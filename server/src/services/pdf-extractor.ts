import { createCanvas } from '@napi-rs/canvas';
// Use legacy build for Node.js - it doesn't require web workers
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { createHash } from 'crypto';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { env } from '../config/env.js';

// No worker configuration needed for Node.js legacy build

export interface ExtractedImageInfo {
  filename: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  pageNumber: number;
  filePath: string;
}

export interface ExtractionResult {
  success: boolean;
  extractionId: string;
  sha256: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  imageCount: number;
  images: ExtractedImageInfo[];
  error?: string;
}

export interface ExtractionProgress {
  stage: 'loading' | 'analyzing' | 'extracting' | 'saving' | 'complete' | 'error';
  progress: number;
  message: string;
  currentPage?: number;
  totalPages?: number;
}

export type ProgressCallback = (progress: ExtractionProgress) => void;

/**
 * Calculate SHA-256 hash of a buffer
 */
export function calculateSHA256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sanitize filename to prevent path traversal and invalid characters
 */
function sanitizeFilename(filename: string): string {
  // Remove path components and sanitize
  const base = basename(filename);
  // Replace invalid characters
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200);
}

/**
 * Get storage path for an extraction
 */
export function getExtractionPath(extractionId: string): string {
  return join(env.STORAGE_DIR, 'extractions', extractionId);
}

/**
 * Get images directory path for an extraction
 */
export function getImagesPath(extractionId: string): string {
  return join(getExtractionPath(extractionId), 'images');
}

/**
 * Get ZIP file path for an extraction
 */
export function getZipPath(extractionId: string): string {
  return join(getExtractionPath(extractionId), 'result.zip');
}

/**
 * Check if a PDF page has image operators
 */
async function pageHasImages(page: PDFPageProxy): Promise<boolean> {
  try {
    const operatorList = await page.getOperatorList();
    const imageOps = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject];
    
    for (const op of operatorList.fnArray) {
      if (imageOps.includes(op)) {
        return true;
      }
    }
    return false;
  } catch {
    // If we can't analyze, assume it might have images
    return true;
  }
}

/**
 * Render a PDF page to an image buffer
 */
async function renderPageToImage(
  page: PDFPageProxy,
  _pageNumber: number,
  scale: number = 2.0
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const viewport = page.getViewport({ scale });
  
  // Limit dimensions to prevent memory issues
  const maxDimension = 4096;
  let finalScale = scale;
  if (viewport.width > maxDimension || viewport.height > maxDimension) {
    const scaleFactor = maxDimension / Math.max(viewport.width, viewport.height);
    finalScale = scale * scaleFactor;
  }
  
  const finalViewport = page.getViewport({ scale: finalScale });
  const width = Math.floor(finalViewport.width);
  const height = Math.floor(finalViewport.height);
  
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  
  // Fill with white background
  context.fillStyle = 'white';
  context.fillRect(0, 0, width, height);
  
  // Render the page - cast to any to handle type mismatch between napi-rs/canvas and pdfjs-dist
  const renderContext = {
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport: finalViewport,
  } as any;
  
  await page.render(renderContext).promise;
  
  // Convert to PNG buffer
  const buffer = canvas.toBuffer('image/png');
  
  return { buffer, width, height };
}

/**
 * Create ZIP file from extracted images
 */
async function createZipFile(
  extractionId: string,
  images: ExtractedImageInfo[],
  _originalFilename: string
): Promise<string> {
  const zipPath = getZipPath(extractionId);
  const imagesPath = getImagesPath(extractionId);
  
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    
    output.on('close', () => resolve(zipPath));
    archive.on('error', (err) => reject(err));
    
    archive.pipe(output);
    
    // Add all images
    for (const image of images) {
      const imagePath = join(imagesPath, image.filename);
      archive.file(imagePath, { name: image.filename });
    }
    
    archive.finalize();
  });
}

/**
 * Main PDF extraction function for server-side processing
 */
export async function extractImagesFromPDF(
  pdfBuffer: Buffer,
  originalFilename: string,
  extractionId: string,
  onProgress?: ProgressCallback
): Promise<ExtractionResult> {
  const sha256 = calculateSHA256(pdfBuffer);
  const sizeBytes = pdfBuffer.length;
  const sanitizedFilename = sanitizeFilename(originalFilename);
  
  const report = (stage: ExtractionProgress['stage'], progress: number, message: string, extra?: Partial<ExtractionProgress>) => {
    onProgress?.({ stage, progress, message, ...extra });
  };
  
  report('loading', 0, 'Loading PDF document...');
  
  let pdf: PDFDocumentProxy | null = null;
  
  try {
    // Ensure storage directories exist
    const imagesPath = getImagesPath(extractionId);
    
    await mkdir(imagesPath, { recursive: true });
    
    // Load PDF
    const loadingTask = getDocument({
      data: new Uint8Array(pdfBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableAutoFetch: true,
      disableStream: true,
    });
    
    pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    
    // Validate page count
    if (pageCount > env.MAX_PAGES) {
      return {
        success: false,
        extractionId,
        sha256,
        originalFilename: sanitizedFilename,
        sizeBytes,
        pageCount,
        imageCount: 0,
        images: [],
        error: `PDF has ${pageCount} pages, which exceeds the maximum of ${env.MAX_PAGES} pages`,
      };
    }
    
    report('analyzing', 10, `Analyzing ${pageCount} pages...`, { totalPages: pageCount });
    
    // Analyze pages for image content
    const pagesWithImages: number[] = [];
    
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const hasImages = await pageHasImages(page);
      
      if (hasImages) {
        pagesWithImages.push(i);
      }
      
      report('analyzing', 10 + (20 * i / pageCount), `Analyzed page ${i}/${pageCount}`, {
        currentPage: i,
        totalPages: pageCount,
      });
    }
    
    // If no pages have images, render all pages as fallback
    const pagesToRender = pagesWithImages.length > 0 ? pagesWithImages : 
      Array.from({ length: pageCount }, (_, i) => i + 1);
    
    report('extracting', 30, `Extracting images from ${pagesToRender.length} pages...`);
    
    const images: ExtractedImageInfo[] = [];
    
    for (let i = 0; i < pagesToRender.length; i++) {
      const pageNum = pagesToRender[i];
      const page = await pdf.getPage(pageNum);
      
      try {
        const { buffer, width, height } = await renderPageToImage(page, pageNum);
        
        const filename = `page_${pageNum.toString().padStart(4, '0')}.png`;
        const imagePath = join(imagesPath, filename);
        
        // Write the buffer (PNG binary data)
        await writeFile(imagePath, buffer);
        
        // Validate the written file has PNG magic bytes
        const writtenFile = await readFile(imagePath);
        const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        if (!writtenFile.slice(0, 8).equals(pngMagic)) {
          console.error(`[PDF Extractor] Warning: Invalid PNG header for ${filename}`);
          console.error(`[PDF Extractor] First 8 bytes: ${writtenFile.slice(0, 8).toString('hex')}`);
        }
        
        const imageInfo: ExtractedImageInfo = {
          filename,
          width,
          height,
          mimeType: 'image/png',
          sizeBytes: buffer.length,
          pageNumber: pageNum,
          filePath: imagePath,
        };
        
        images.push(imageInfo);
        
        report('extracting', 30 + (50 * (i + 1) / pagesToRender.length), 
          `Extracted page ${pageNum}/${pageCount}`, {
            currentPage: pageNum,
            totalPages: pageCount,
          });
      } catch (error) {
        console.error(`Failed to render page ${pageNum}:`, error);
        // Continue with other pages
      }
    }
    
    if (images.length === 0) {
      return {
        success: false,
        extractionId,
        sha256,
        originalFilename: sanitizedFilename,
        sizeBytes,
        pageCount,
        imageCount: 0,
        images: [],
        error: 'No images could be extracted from the PDF',
      };
    }
    
    report('saving', 85, 'Creating ZIP archive...');
    
    // Create ZIP file
    await createZipFile(extractionId, images, sanitizedFilename);
    
    report('complete', 100, 'Extraction complete!');
    
    return {
      success: true,
      extractionId,
      sha256,
      originalFilename: sanitizedFilename,
      sizeBytes,
      pageCount,
      imageCount: images.length,
      images,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during extraction';
    
    report('error', 0, errorMessage);
    
    return {
      success: false,
      extractionId,
      sha256,
      originalFilename: sanitizedFilename,
      sizeBytes,
      pageCount: 0,
      imageCount: 0,
      images: [],
      error: errorMessage,
    };
  } finally {
    if (pdf) {
      await pdf.destroy();
    }
  }
}

/**
 * Delete extraction files from disk
 */
export async function deleteExtractionFiles(extractionId: string): Promise<void> {
  const extractionPath = getExtractionPath(extractionId);
  
  if (existsSync(extractionPath)) {
    await rm(extractionPath, { recursive: true, force: true });
  }
}

/**
 * Get image file buffer
 */
export async function getImageBuffer(extractionId: string, filename: string): Promise<Buffer | null> {
  const sanitizedFilename = sanitizeFilename(filename);
  const imagePath = join(getImagesPath(extractionId), sanitizedFilename);
  
  if (!existsSync(imagePath)) {
    return null;
  }
  
  return readFile(imagePath);
}

/**
 * Get ZIP file path if exists
 */
export async function getZipBuffer(extractionId: string): Promise<Buffer | null> {
  const zipPath = getZipPath(extractionId);
  
  if (!existsSync(zipPath)) {
    return null;
  }
  
  return readFile(zipPath);
}

/**
 * Calculate total storage used for all extractions
 */
export async function calculateStorageUsage(): Promise<{ totalBytes: number; extractionCount: number }> {
  const extractionsDir = join(env.STORAGE_DIR, 'extractions');
  
  if (!existsSync(extractionsDir)) {
    return { totalBytes: 0, extractionCount: 0 };
  }
  
  const { readdir, stat } = await import('fs/promises');
  
  let totalBytes = 0;
  let extractionCount = 0;
  
  async function getDirSize(dir: string): Promise<number> {
    let size = 0;
    try {
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const filePath = join(dir, file.name);
        if (file.isDirectory()) {
          size += await getDirSize(filePath);
        } else {
          const fileStat = await stat(filePath);
          size += fileStat.size;
        }
      }
    } catch {
      // Ignore errors
    }
    return size;
  }
  
  const entries = await readdir(extractionsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      extractionCount++;
      const extractionPath = join(extractionsDir, entry.name);
      totalBytes += await getDirSize(extractionPath);
    }
  }
  
  return { totalBytes, extractionCount };
}
