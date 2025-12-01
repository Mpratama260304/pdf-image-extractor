import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

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
  pageCount: number
  extractedImageCount: number
  attempts: DiagnosticAttempt[]
  timestamp: number
  duration: number
  errorCode?: string
  errorMessage?: string
}

export interface DiagnosticAttempt {
  method: string
  success: boolean
  error?: string
  imageCount?: number
  details?: any
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

function validatePDFHeader(arrayBuffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 5))
  const header = String.fromCharCode(...bytes)
  return header === '%PDF-'
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
        throw new PDFExtractionError(
          'File bukan PDF. Pastikan file yang diunggah adalah dokumen PDF.',
          'NOT_PDF',
          diagnostic
        )
      }
    }

    onProgress?.(10, 'Loading PDF document...')
    
    const arrayBuffer = await file.arrayBuffer()
    
    if (!validatePDFHeader(arrayBuffer)) {
      diagnostic.attempts.push({
        method: 'header_validation',
        success: false,
        error: 'Invalid PDF header'
      })
      diagnostic.errorCode = 'INVALID_PDF'
      diagnostic.errorMessage = 'File header does not match PDF format'
      throw new PDFExtractionError(
        'File rusak atau bukan PDF yang valid. Header file tidak sesuai format PDF.',
        'INVALID_PDF',
        diagnostic
      )
    }
    
    diagnostic.attempts.push({
      method: 'header_validation',
      success: true
    })

    let pdf: pdfjsLib.PDFDocumentProxy
    
    try {
      pdf = await pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise
      
      diagnostic.attempts.push({
        method: 'pdf_load',
        success: true,
        details: { pages: pdf.numPages }
      })
    } catch (loadError: any) {
      diagnostic.attempts.push({
        method: 'pdf_load',
        success: false,
        error: loadError.message
      })
      
      if (loadError.message?.includes('password') || loadError.message?.includes('encrypted')) {
        diagnostic.errorCode = 'PDF_ENCRYPTED'
        diagnostic.errorMessage = 'PDF is password protected'
        throw new PDFExtractionError(
          'PDF ini terenkripsi. Silakan buka file dengan sandi terlebih dahulu atau ekspor ulang tanpa enkripsi.',
          'PDF_ENCRYPTED',
          diagnostic
        )
      }
      
      diagnostic.errorCode = 'PDF_LOAD_FAILED'
      diagnostic.errorMessage = loadError.message
      throw new PDFExtractionError(
        'Gagal memuat PDF. File mungkin rusak atau menggunakan format yang tidak didukung.',
        'PDF_LOAD_FAILED',
        diagnostic
      )
    }
    
    diagnostic.pageCount = pdf.numPages
    
    if (pdf.numPages > MAX_PAGES) {
      diagnostic.errorCode = 'TOO_MANY_PAGES'
      diagnostic.errorMessage = `PDF has ${pdf.numPages} pages, exceeds limit of ${MAX_PAGES}`
      throw new PDFExtractionError(
        `PDF terlalu banyak halaman (${pdf.numPages}). Maksimal ${MAX_PAGES} halaman.`,
        'TOO_MANY_PAGES',
        diagnostic
      )
    }
    
    const isEncrypted = await checkIfEncrypted(pdf)
    if (isEncrypted) {
      diagnostic.attempts.push({
        method: 'encryption_check',
        success: false,
        error: 'PDF is encrypted'
      })
      diagnostic.errorCode = 'PDF_ENCRYPTED'
      diagnostic.errorMessage = 'PDF has encryption'
      throw new PDFExtractionError(
        'PDF ini memiliki enkripsi. Silakan gunakan file tanpa proteksi.',
        'PDF_ENCRYPTED',
        diagnostic
      )
    }
    
    let images: ExtractedImage[] = []
    
    try {
      images = await extractEmbeddedImages(pdf, file, onProgress)
      
      diagnostic.attempts.push({
        method: 'embedded_extraction',
        success: true,
        imageCount: images.length
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
      diagnostic.attempts.push({
        method: 'embedded_extraction',
        success: false,
        error: extractError.message,
        imageCount: images.length
      })
    }
    
    onProgress?.(70, 'No embedded images found, trying page rasterization...')
    
    try {
      const maxPagesToRasterize = Math.min(pdf.numPages, 500)
      images = await rasterizePages(pdf, file, maxPagesToRasterize, 200, onProgress)
      
      diagnostic.attempts.push({
        method: 'rasterization',
        success: true,
        imageCount: images.length,
        details: { dpi: 200, maxPages: maxPagesToRasterize }
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
      diagnostic.attempts.push({
        method: 'rasterization',
        success: false,
        error: rasterError.message
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
  })
  
  if (diagnostic.errorCode) {
    lines.push(``, `Error: ${diagnostic.errorCode}`, `Message: ${diagnostic.errorMessage}`)
  }
  
  return lines.join('\n')
}
