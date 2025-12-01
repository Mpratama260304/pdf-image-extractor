import * as pdfjsLib from 'pdfjs-dist'
import { initializePDFWorker } from './pdf-worker-setup'

export interface ExtractedImage {
  id: string
  dataUrl: string
  pageNumber: number
  width: number
  height: number
  format: string
  filename: string
}

export interface ExtractionResult {
  images: ExtractedImage[]
  totalPages: number
  pdfName: string
  diagnostic?: DiagnosticInfo
}

export interface DiagnosticInfo {
  sessionId: string
  originalFilename: string
  fileSize: number
  fileMd5?: string
  pdfVersion?: string
  pdfHeader?: string
  pageCount: number
  extractedImageCount: number
  attempts: DiagnosticAttempt[]
  timestamp: number
  duration: number
  errorCode?: string
  errorMessage?: string
  stackTrace?: string
  recommendations?: string[]
  autoRepairUsed?: string
}

export interface DiagnosticAttempt {
  method: string
  success: boolean
  error?: string
  errorStack?: string
  imageCount?: number
  details?: any
  timestamp: number
  duration?: number
}

export interface ServerExtractionResponse {
  success: boolean
  images?: {
    data: string
    format: string
    width: number
    height: number
    pageNumber: number
  }[]
  error?: string
  diagnostic?: DiagnosticInfo
}

export class PDFExtractionError extends Error {
  constructor(
    message: string,
    public code: string,
    public diagnostic: DiagnosticInfo
  ) {
    super(message)
    this.name = 'PDFExtractionError'
  }
}

const MAX_FILE_SIZE = 200 * 1024 * 1024
const MAX_PAGES = 1000
const MAX_MEMORY_PER_IMAGE = 50 * 1024 * 1024

function generateSessionId(): string {
  return `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

async function calculateMD5(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function extractPDFVersion(arrayBuffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(arrayBuffer.slice(0, 20))
    const header = String.fromCharCode(...bytes)
    const versionMatch = header.match(/%PDF-(\d+\.\d+)/)
    return versionMatch ? versionMatch[1] : 'unknown'
  } catch {
    return 'unknown'
  }
}

function validatePDFHeader(arrayBuffer: ArrayBuffer): { valid: boolean; header: string } {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 5))
  const header = String.fromCharCode(...bytes)
  return {
    valid: header === '%PDF-',
    header: header
  }
}

async function checkIfEncrypted(pdf: pdfjsLib.PDFDocumentProxy): Promise<boolean> {
  try {
    const metadata = await pdf.getMetadata()
    const info = metadata.info as any
    return info?.IsEncrypted === true || false
  } catch {
    return false
  }
}

async function tryLoadPDFWithFallbacks(
  arrayBuffer: ArrayBuffer,
  diagnostic: DiagnosticInfo
): Promise<pdfjsLib.PDFDocumentProxy> {
  const workerInit = await initializePDFWorker()
  
  diagnostic.attempts.push({
    method: 'worker_initialization',
    success: workerInit.success,
    details: { mode: workerInit.mode },
    error: workerInit.error?.message,
    timestamp: Date.now(),
    duration: 0
  })
  
  const attempts: { method: string; config: any }[] = [
    {
      method: 'standard_load_no_worker',
      config: {
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        disableWorker: true,
      }
    },
    {
      method: 'load_with_recovery_no_worker',
      config: {
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        stopAtErrors: false,
        disableFontFace: true,
        disableWorker: true,
      }
    },
    {
      method: 'load_ignore_errors_no_worker',
      config: {
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        stopAtErrors: false,
        disableFontFace: true,
        verbosity: 0,
        disableWorker: true,
      }
    },
    {
      method: 'load_minimal_no_worker',
      config: {
        data: new Uint8Array(arrayBuffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        disableFontFace: true,
        stopAtErrors: false,
        disableWorker: true,
      }
    }
  ]

  let lastError: any = null

  for (const attempt of attempts) {
    const attemptStart = Date.now()
    try {
      const pdf = await pdfjsLib.getDocument(attempt.config).promise
      
      const isNoWorker = attempt.method.includes('no_worker')
      diagnostic.attempts.push({
        method: attempt.method,
        success: true,
        details: { 
          pages: pdf.numPages, 
          workerMode: isNoWorker ? 'no-worker' : workerInit.mode,
          disableWorker: isNoWorker 
        },
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
      
      diagnostic.autoRepairUsed = attempt.method !== 'standard_load_no_worker' ? attempt.method : undefined
      
      return pdf
    } catch (error: any) {
      lastError = error
      diagnostic.attempts.push({
        method: attempt.method,
        success: false,
        error: error.message || String(error),
        errorStack: error.stack,
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
    }
  }

  throw lastError
}

async function attemptPDFRepair(
  arrayBuffer: ArrayBuffer,
  diagnostic: DiagnosticInfo
): Promise<ArrayBuffer | null> {
  const attemptStart = Date.now()
  
  try {
    const bytes = new Uint8Array(arrayBuffer)
    
    const hasPDFHeader = bytes[0] === 0x25 && bytes[1] === 0x50 && 
                         bytes[2] === 0x44 && bytes[3] === 0x46
    
    if (!hasPDFHeader) {
      const pdfHeaderIndex = findPDFHeaderIndex(bytes)
      if (pdfHeaderIndex > 0) {
        const repairedBytes = bytes.slice(pdfHeaderIndex)
        diagnostic.attempts.push({
          method: 'header_repair',
          success: true,
          details: { removedBytes: pdfHeaderIndex },
          timestamp: attemptStart,
          duration: Date.now() - attemptStart
        })
        return repairedBytes.buffer
      }
    }

    const hasEOFMarker = findEOFMarker(bytes)
    if (!hasEOFMarker) {
      const repairedBytes = new Uint8Array(bytes.length + 6)
      repairedBytes.set(bytes)
      repairedBytes.set([0x0A, 0x25, 0x25, 0x45, 0x4F, 0x46], bytes.length)
      diagnostic.attempts.push({
        method: 'eof_repair',
        success: true,
        details: { addedEOF: true },
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
      return repairedBytes.buffer
    }

    diagnostic.attempts.push({
      method: 'pdf_repair',
      success: false,
      error: 'No repairs applicable',
      timestamp: attemptStart,
      duration: Date.now() - attemptStart
    })
    
    return null
  } catch (error: any) {
    diagnostic.attempts.push({
      method: 'pdf_repair',
      success: false,
      error: error.message,
      errorStack: error.stack,
      timestamp: attemptStart,
      duration: Date.now() - attemptStart
    })
    return null
  }
}

function findPDFHeaderIndex(bytes: Uint8Array): number {
  for (let i = 0; i < Math.min(bytes.length - 5, 1024); i++) {
    if (bytes[i] === 0x25 && bytes[i+1] === 0x50 && 
        bytes[i+2] === 0x44 && bytes[i+3] === 0x46) {
      return i
    }
  }
  return -1
}

function findEOFMarker(bytes: Uint8Array): boolean {
  const eofMarker = [0x25, 0x25, 0x45, 0x4F, 0x46]
  const searchStart = Math.max(0, bytes.length - 1024)
  
  for (let i = bytes.length - 1; i >= searchStart; i--) {
    let found = true
    for (let j = 0; j < eofMarker.length; j++) {
      if (bytes[i - eofMarker.length + 1 + j] !== eofMarker[j]) {
        found = false
        break
      }
    }
    if (found) return true
  }
  
  return false
}

function generateRecommendations(diagnostic: DiagnosticInfo): string[] {
  const recommendations: string[] = []
  
  if (diagnostic.errorCode === 'ALL_METHODS_FAILED') {
    recommendations.push('Buka PDF di Adobe Reader dan Save As dengan nama baru')
    recommendations.push('Gunakan "Print to PDF" untuk membuat salinan bersih')
    recommendations.push('Coba refresh halaman dan upload ulang file PDF')
    recommendations.push('Coba export ulang dari aplikasi sumber dengan PDF 1.4 compatibility')
    return recommendations
  }
  
  if (diagnostic.errorCode === 'PDF_LOAD_FAILED') {
    recommendations.push('Buka PDF di Adobe Reader dan Save As dengan nama baru')
    recommendations.push('Gunakan "Print to PDF" untuk membuat salinan bersih')
    recommendations.push('Coba export ulang dari aplikasi sumber dengan PDF 1.4 compatibility')
    
    const headerAttempt = diagnostic.attempts.find(a => a.method === 'header_validation')
    if (headerAttempt && !headerAttempt.success) {
      recommendations.push('File mungkin memiliki data tambahan di awal - coba buka dengan PDF repair tool')
    }
    
    if (diagnostic.pdfVersion && parseFloat(diagnostic.pdfVersion) > 1.7) {
      recommendations.push(`PDF versi ${diagnostic.pdfVersion} mungkin terlalu baru - coba save as PDF 1.7 atau lebih rendah`)
    }
  }
  
  return recommendations
}

async function extractEmbeddedImages(
  pdf: pdfjsLib.PDFDocumentProxy,
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<ExtractedImage[]> {
  const totalPages = pdf.numPages
  const images: ExtractedImage[] = []
  
  onProgress?.(20, `Scanning ${totalPages} pages for embedded images...`)

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum)
      const operatorList = await page.getOperatorList()
      
      let hasImages = false
      
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const fn = operatorList.fnArray[i]
        
        if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
          hasImages = true
          break
        }
      }

      if (hasImages) {
        const scale = 2
        const viewport = page.getViewport({ scale })
        
        if (viewport.width * viewport.height * 4 > MAX_MEMORY_PER_IMAGE) {
          console.warn(`Page ${pageNum} too large, using lower resolution`)
          const adjustedScale = Math.sqrt(MAX_MEMORY_PER_IMAGE / (viewport.width * viewport.height * 4))
          const newViewport = page.getViewport({ scale: adjustedScale })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d', { willReadFrequently: false })!
          
          canvas.width = newViewport.width
          canvas.height = newViewport.height
          
          await page.render({
            canvasContext: context,
            viewport: newViewport,
          } as any).promise
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
          
          images.push({
            id: `${file.name}-page-${pageNum}-${Date.now()}`,
            dataUrl,
            pageNumber: pageNum,
            width: Math.round(newViewport.width),
            height: Math.round(newViewport.height),
            format: 'JPEG',
            filename: `${file.name.replace('.pdf', '')}_page-${pageNum}.jpg`,
          })
        } else {
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d', { willReadFrequently: false })!
          
          canvas.width = viewport.width
          canvas.height = viewport.height
          
          await page.render({
            canvasContext: context,
            viewport: viewport,
          } as any).promise
          
          const dataUrl = canvas.toDataURL('image/png')
          
          images.push({
            id: `${file.name}-page-${pageNum}-${Date.now()}`,
            dataUrl,
            pageNumber: pageNum,
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
            format: 'PNG',
            filename: `${file.name.replace('.pdf', '')}_page-${pageNum}.png`,
          })
        }
      }
      
      const progress = 20 + ((pageNum / totalPages) * 50)
      onProgress?.(progress, `Scanning page ${pageNum}/${totalPages}...`)
    } catch (error) {
      console.error(`Error processing page ${pageNum}:`, error)
    }
  }

  return images
}

async function rasterizePages(
  pdf: pdfjsLib.PDFDocumentProxy,
  file: File,
  maxPages: number,
  dpi: number = 200,
  onProgress?: (progress: number, status: string) => void
): Promise<ExtractedImage[]> {
  const totalPages = Math.min(pdf.numPages, maxPages)
  const images: ExtractedImage[] = []
  const scale = dpi / 72
  
  onProgress?.(75, `Rasterizing ${totalPages} pages at ${dpi} DPI...`)
  
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      
      const estimatedMemory = viewport.width * viewport.height * 4
      let useScale = scale
      let useFormat: 'png' | 'jpeg' = 'png'
      let quality = 1.0
      
      if (estimatedMemory > MAX_MEMORY_PER_IMAGE) {
        useScale = Math.sqrt(MAX_MEMORY_PER_IMAGE / (viewport.width * viewport.height * 4)) * scale
        useFormat = 'jpeg'
        quality = 0.85
      }
      
      const finalViewport = page.getViewport({ scale: useScale })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: false })!
      
      canvas.width = finalViewport.width
      canvas.height = finalViewport.height
      
      await page.render({
        canvasContext: context,
        viewport: finalViewport,
      } as any).promise
      
      const dataUrl = useFormat === 'jpeg' 
        ? canvas.toDataURL('image/jpeg', quality)
        : canvas.toDataURL('image/png')
      
      images.push({
        id: `${file.name}-page-${pageNum}-${Date.now()}`,
        dataUrl,
        pageNumber: pageNum,
        width: Math.round(finalViewport.width),
        height: Math.round(finalViewport.height),
        format: useFormat.toUpperCase(),
        filename: `${file.name.replace('.pdf', '')}_page-${pageNum}.${useFormat}`,
      })
      
      const progress = 75 + ((pageNum / totalPages) * 20)
      onProgress?.(progress, `Rasterizing page ${pageNum}/${totalPages}...`)
    } catch (error) {
      console.error(`Error rasterizing page ${pageNum}:`, error)
    }
  }
  
  return images
}



export async function extractImagesFromPDF(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<ExtractionResult> {
  const startTime = Date.now()
  const sessionId = generateSessionId()
  const diagnostic: DiagnosticInfo = {
    sessionId,
    originalFilename: file.name,
    fileSize: file.size,
    pageCount: 0,
    extractedImageCount: 0,
    attempts: [],
    timestamp: startTime,
    duration: 0,
  }

  try {
    onProgress?.(5, 'Validating PDF file...')
    
    if (file.size > MAX_FILE_SIZE) {
      diagnostic.errorCode = 'FILE_TOO_LARGE'
      diagnostic.errorMessage = `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      diagnostic.duration = Date.now() - startTime
      throw new PDFExtractionError(
        `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimal ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        'FILE_TOO_LARGE',
        diagnostic
      )
    }
    
    if (!file.type || file.type !== 'application/pdf') {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        diagnostic.errorCode = 'NOT_PDF'
        diagnostic.errorMessage = 'File does not have PDF extension or MIME type'
        diagnostic.duration = Date.now() - startTime
        throw new PDFExtractionError(
          'File bukan PDF. Pastikan file yang diunggah adalah dokumen PDF.',
          'NOT_PDF',
          diagnostic
        )
      }
    }

    let arrayBuffer: ArrayBuffer
    let pdf: pdfjsLib.PDFDocumentProxy | null = null
    
    try {
      onProgress?.(10, 'Loading PDF document...')
      
      arrayBuffer = await file.arrayBuffer()
      
      onProgress?.(15, 'Computing file fingerprint...')
      diagnostic.fileMd5 = await calculateMD5(arrayBuffer)
      diagnostic.pdfVersion = extractPDFVersion(arrayBuffer)
      
      const headerValidation = validatePDFHeader(arrayBuffer)
      diagnostic.pdfHeader = headerValidation.header
      
      if (!headerValidation.valid) {
        const attemptStart = Date.now()
        diagnostic.attempts.push({
          method: 'header_validation',
          success: false,
          error: `Invalid PDF header: "${headerValidation.header}"`,
          timestamp: attemptStart,
          duration: Date.now() - attemptStart
        })
        
        onProgress?.(20, 'Attempting header repair...')
        const repairedBuffer = await attemptPDFRepair(arrayBuffer, diagnostic)
        
        if (repairedBuffer) {
          arrayBuffer = repairedBuffer
          const repairedValidation = validatePDFHeader(arrayBuffer)
          if (repairedValidation.valid) {
            diagnostic.pdfHeader = repairedValidation.header
            diagnostic.attempts.push({
              method: 'header_validation_after_repair',
              success: true,
              timestamp: Date.now(),
              duration: 0
            })
          }
        } else {
          diagnostic.errorCode = 'INVALID_PDF'
          diagnostic.errorMessage = `File header does not match PDF format: "${headerValidation.header}"`
          diagnostic.duration = Date.now() - startTime
          diagnostic.recommendations = generateRecommendations(diagnostic)
          throw new PDFExtractionError(
            'File rusak atau bukan PDF yang valid. Header file tidak sesuai format PDF.',
            'INVALID_PDF',
            diagnostic
          )
        }
      } else {
        diagnostic.attempts.push({
          method: 'header_validation',
          success: true,
          timestamp: Date.now(),
          duration: 0
        })
      }

      try {
        onProgress?.(25, 'Loading PDF with enhanced compatibility...')
        pdf = await tryLoadPDFWithFallbacks(arrayBuffer, diagnostic)
      } catch (loadError: any) {
        if (loadError.message?.includes('password') || loadError.message?.includes('encrypted')) {
          diagnostic.errorCode = 'PDF_ENCRYPTED'
          diagnostic.errorMessage = 'PDF is password protected'
          diagnostic.duration = Date.now() - startTime
          diagnostic.stackTrace = loadError.stack
          throw new PDFExtractionError(
            'PDF ini terenkripsi. Silakan buka file dengan sandi terlebih dahulu atau ekspor ulang tanpa enkripsi.',
            'PDF_ENCRYPTED',
            diagnostic
          )
        }
        
        diagnostic.errorCode = 'PDF_LOAD_FAILED'
        diagnostic.errorMessage = loadError.message
        diagnostic.stackTrace = loadError.stack
        diagnostic.duration = Date.now() - startTime
        diagnostic.recommendations = generateRecommendations(diagnostic)
        throw new PDFExtractionError(
          'Gagal memuat PDF. File mungkin rusak atau menggunakan format yang tidak didukung.',
          'PDF_LOAD_FAILED',
          diagnostic
        )
      }
    } catch (error) {
      if (error instanceof PDFExtractionError) {
        throw error
      }
      
      diagnostic.errorCode = 'UNKNOWN_ERROR'
      diagnostic.errorMessage = error instanceof Error ? error.message : String(error)
      diagnostic.stackTrace = error instanceof Error ? error.stack : undefined
      diagnostic.duration = Date.now() - startTime
      
      throw new PDFExtractionError(
        'Terjadi kesalahan tidak terduga saat memproses PDF.',
        'UNKNOWN_ERROR',
        diagnostic
      )
    }
    
    if (!pdf) {
      throw new Error('PDF object is null after loading')
    }
    
    diagnostic.pageCount = pdf.numPages
    
    if (pdf.numPages > MAX_PAGES) {
      diagnostic.errorCode = 'TOO_MANY_PAGES'
      diagnostic.errorMessage = `PDF has ${pdf.numPages} pages, exceeds limit of ${MAX_PAGES}`
      diagnostic.duration = Date.now() - startTime
      throw new PDFExtractionError(
        `PDF terlalu banyak halaman (${pdf.numPages}). Maksimal ${MAX_PAGES} halaman.`,
        'TOO_MANY_PAGES',
        diagnostic
      )
    }
    
    const isEncrypted = await checkIfEncrypted(pdf)
    if (isEncrypted) {
      const attemptStart = Date.now()
      diagnostic.attempts.push({
        method: 'encryption_check',
        success: false,
        error: 'PDF is encrypted',
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
      diagnostic.errorCode = 'PDF_ENCRYPTED'
      diagnostic.errorMessage = 'PDF has encryption'
      diagnostic.duration = Date.now() - startTime
      throw new PDFExtractionError(
        'PDF ini memiliki enkripsi. Silakan gunakan file tanpa proteksi.',
        'PDF_ENCRYPTED',
        diagnostic
      )
    }
    
    let images: ExtractedImage[] = []
    
    try {
      images = await extractEmbeddedImages(pdf, file, onProgress)
      
      const attemptStart = Date.now()
      diagnostic.attempts.push({
        method: 'embedded_extraction',
        success: true,
        imageCount: images.length,
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
      
      if (images.length > 0) {
        diagnostic.extractedImageCount = images.length
        diagnostic.duration = Date.now() - startTime
        onProgress?.(100, 'Extraction complete!')
        
        return {
          images,
          totalPages: pdf.numPages,
          pdfName: file.name,
          diagnostic
        }
      }
    } catch (extractError: any) {
      const attemptStart = Date.now()
      diagnostic.attempts.push({
        method: 'embedded_extraction',
        success: false,
        error: extractError.message,
        errorStack: extractError.stack,
        imageCount: images.length,
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
    }
    
    onProgress?.(70, 'No embedded images found, trying page rasterization...')
    
    try {
      const maxPagesToRasterize = Math.min(pdf.numPages, 500)
      images = await rasterizePages(pdf, file, maxPagesToRasterize, 200, onProgress)
      
      const attemptStart = Date.now()
      diagnostic.attempts.push({
        method: 'rasterization',
        success: true,
        imageCount: images.length,
        details: { dpi: 200, maxPages: maxPagesToRasterize },
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
      
      if (images.length > 0) {
        diagnostic.extractedImageCount = images.length
        diagnostic.duration = Date.now() - startTime
        onProgress?.(100, 'Rasterization complete!')
        
        return {
          images,
          totalPages: pdf.numPages,
          pdfName: file.name,
          diagnostic
        }
      }
    } catch (rasterError: any) {
      const attemptStart = Date.now()
      diagnostic.attempts.push({
        method: 'rasterization',
        success: false,
        error: rasterError.message,
        errorStack: rasterError.stack,
        timestamp: attemptStart,
        duration: Date.now() - attemptStart
      })
    }
    
    diagnostic.errorCode = 'NO_IMAGES'
    diagnostic.errorMessage = 'No images found after all extraction methods'
    diagnostic.duration = Date.now() - startTime
    throw new PDFExtractionError(
      'Tidak ada gambar yang dapat diekstrak dari PDF ini.',
      'NO_IMAGES',
      diagnostic
    )
    
  } catch (error) {
    diagnostic.duration = Date.now() - startTime
    
    if (error instanceof PDFExtractionError) {
      throw error
    }
    
    diagnostic.errorCode = 'UNKNOWN_ERROR'
    diagnostic.errorMessage = error instanceof Error ? error.message : String(error)
    diagnostic.stackTrace = error instanceof Error ? error.stack : undefined
    
    throw new PDFExtractionError(
      'Terjadi kesalahan tidak terduga saat memproses PDF.',
      'UNKNOWN_ERROR',
      diagnostic
    )
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

export function downloadDiagnostic(diagnostic: DiagnosticInfo, filename?: string): void {
  const json = JSON.stringify(diagnostic, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `diagnostic_${diagnostic.sessionId}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function formatDiagnosticMessage(diagnostic: DiagnosticInfo): string {
  const lines = [
    `Session: ${diagnostic.sessionId}`,
    `File: ${diagnostic.originalFilename} (${(diagnostic.fileSize / 1024 / 1024).toFixed(2)}MB)`,
    `MD5: ${diagnostic.fileMd5 || 'N/A'}`,
    `PDF Version: ${diagnostic.pdfVersion || 'unknown'}`,
    `PDF Header: ${diagnostic.pdfHeader || 'N/A'}`,
    `Pages: ${diagnostic.pageCount}`,
    `Duration: ${(diagnostic.duration / 1000).toFixed(2)}s`,
    ``,
    `Extraction Attempts:`,
  ]
  
  diagnostic.attempts.forEach((attempt, i) => {
    lines.push(`${i + 1}. ${attempt.method}: ${attempt.success ? '✓' : '✗'}`)
    if (attempt.error) {
      lines.push(`   Error: ${attempt.error}`)
    }
    if (attempt.imageCount !== undefined) {
      lines.push(`   Images: ${attempt.imageCount}`)
    }
    if (attempt.duration !== undefined) {
      lines.push(`   Duration: ${attempt.duration}ms`)
    }
  })
  
  if (diagnostic.autoRepairUsed) {
    lines.push(``, `Auto-Repair Method Used: ${diagnostic.autoRepairUsed}`)
  }
  
  if (diagnostic.errorCode) {
    lines.push(``, `Error: ${diagnostic.errorCode}`, `Message: ${diagnostic.errorMessage}`)
  }
  
  if (diagnostic.recommendations && diagnostic.recommendations.length > 0) {
    lines.push(``, `Recommendations:`)
    diagnostic.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`)
    })
  }
  
  return lines.join('\n')
}
