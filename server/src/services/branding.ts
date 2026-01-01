import { mkdir, writeFile, readFile, unlink, access } from 'fs/promises';
import { constants } from 'fs';
import { join, extname, basename } from 'path';
import sharp from 'sharp';
import { env } from '../config/env.js';
import crypto from 'crypto';

// Branding directory inside storage
const BRANDING_DIR = join(env.STORAGE_DIR, 'branding');

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

// Extension to MIME type mapping
const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// MIME type to extension mapping
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

// Generated favicon sizes
export const FAVICON_SIZES = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 512, name: 'android-chrome-512x512.png' },
];

/**
 * Ensure branding directory exists
 */
export async function ensureBrandingDir(): Promise<void> {
  await mkdir(BRANDING_DIR, { recursive: true });
}

/**
 * Get the full path for a branding file
 */
export function getBrandingPath(filename: string): string {
  // Prevent path traversal
  const safeName = basename(filename);
  return join(BRANDING_DIR, safeName);
}

/**
 * Check if a branding file exists
 */
export async function brandingFileExists(filename: string): Promise<boolean> {
  try {
    await access(getBrandingPath(filename), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a branding file
 */
export async function readBrandingFile(filename: string): Promise<Buffer | null> {
  try {
    const filePath = getBrandingPath(filename);
    return await readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * Delete a branding file
 */
export async function deleteBrandingFile(filename: string): Promise<void> {
  try {
    await unlink(getBrandingPath(filename));
  } catch {
    // Ignore errors if file doesn't exist
  }
}

/**
 * Validate and detect MIME type from buffer
 */
export function detectMimeType(buffer: Buffer, providedMime?: string): string | null {
  // Check magic bytes for common image formats
  const hex = buffer.toString('hex', 0, 12);
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  
  // JPEG: FF D8 FF
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (hex.startsWith('52494646') && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  
  // ICO: 00 00 01 00
  if (hex.startsWith('00000100')) return 'image/x-icon';
  
  // SVG: Check for XML declaration or svg tag
  const text = buffer.toString('utf8', 0, Math.min(500, buffer.length));
  if (text.includes('<svg') || text.includes('<?xml')) return 'image/svg+xml';
  
  // Fall back to provided MIME type if detected type is valid
  if (providedMime && ALLOWED_IMAGE_TYPES.has(providedMime)) {
    return providedMime;
  }
  
  return null;
}

/**
 * Get MIME type from file extension
 */
export function getMimeFromExtension(filename: string): string | null {
  const ext = extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] || null;
}

/**
 * Get file extension from MIME type
 */
export function getExtFromMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] || '.bin';
}

/**
 * Sanitize SVG content to prevent XSS
 */
export function sanitizeSvg(svgContent: string): string {
  // Remove script tags
  let sanitized = svgContent.replace(/<script[\s\S]*?<\/script>/gi, '');
  
  // Remove event handlers (onclick, onload, onerror, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
  
  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  
  // Remove data: URLs with javascript
  sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '');
  
  // Remove foreignObject elements (can embed HTML)
  sanitized = sanitized.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  
  // Remove use elements referencing external files (can bypass CSP)
  sanitized = sanitized.replace(/<use[^>]*xlink:href\s*=\s*["'][^#][^"']*["'][^>]*>/gi, '');
  
  // Remove iframe, embed, object
  sanitized = sanitized.replace(/<(iframe|embed|object)[\s\S]*?<\/\1>/gi, '');
  sanitized = sanitized.replace(/<(iframe|embed|object)[^>]*\/?>/gi, '');
  
  return sanitized;
}

/**
 * Save admin logo
 */
export async function saveAdminLogo(
  buffer: Buffer,
  providedMime: string,
  originalFilename: string
): Promise<{ success: boolean; key?: string; error?: string }> {
  await ensureBrandingDir();
  
  // Detect and validate MIME type
  const mimeType = detectMimeType(buffer, providedMime);
  if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return { success: false, error: 'Invalid image format. Allowed: PNG, JPEG, WebP, SVG' };
  }
  
  // Generate unique filename
  const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const ext = getExtFromMime(mimeType);
  const key = `admin-logo-${hash}${ext}`;
  
  let processedBuffer = buffer;
  
  // Sanitize SVG
  if (mimeType === 'image/svg+xml') {
    const svgContent = buffer.toString('utf8');
    const sanitized = sanitizeSvg(svgContent);
    processedBuffer = Buffer.from(sanitized, 'utf8');
  } else {
    // For raster images, optionally resize if too large (max 500px width)
    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.width > 500) {
        processedBuffer = await sharp(buffer)
          .resize(500, null, { withoutEnlargement: true })
          .toBuffer();
      }
    } catch {
      // Keep original if processing fails
    }
  }
  
  // Save file
  const filePath = getBrandingPath(key);
  await writeFile(filePath, processedBuffer);
  
  return { success: true, key };
}

/**
 * Save favicon and generate all required sizes
 */
export async function saveFavicon(
  buffer: Buffer,
  providedMime: string,
  originalFilename: string
): Promise<{ success: boolean; key?: string; generatedFiles?: string[]; error?: string }> {
  await ensureBrandingDir();
  
  // Detect and validate MIME type
  const mimeType = detectMimeType(buffer, providedMime);
  if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return { success: false, error: 'Invalid image format. Allowed: PNG, JPEG, WebP, SVG, ICO' };
  }
  
  const generatedFiles: string[] = [];
  
  // Generate unique key based on content hash
  const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const key = `favicon-${hash}`;
  
  // Handle SVG specially - save as-is and generate PNG versions
  if (mimeType === 'image/svg+xml') {
    const svgContent = buffer.toString('utf8');
    const sanitized = sanitizeSvg(svgContent);
    const svgKey = `${key}.svg`;
    await writeFile(getBrandingPath(svgKey), Buffer.from(sanitized, 'utf8'));
    generatedFiles.push(svgKey);
    
    // Try to generate PNG versions from SVG
    try {
      for (const { size, name } of FAVICON_SIZES) {
        const pngBuffer = await sharp(buffer)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        const pngKey = `${key}-${name}`;
        await writeFile(getBrandingPath(pngKey), pngBuffer);
        generatedFiles.push(pngKey);
      }
      
      // Generate .ico file (16x16 and 32x32 in one file)
      const ico16 = await sharp(buffer)
        .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const icoKey = `${key}.ico`;
      await writeFile(getBrandingPath(icoKey), ico16); // Simplified - just use 16x16 PNG as ico
      generatedFiles.push(icoKey);
    } catch (err) {
      console.warn('Could not generate PNG versions from SVG:', err);
    }
    
    return { success: true, key, generatedFiles };
  }
  
  // Handle ICO - save as-is and try to extract/convert
  if (mimeType === 'image/x-icon' || mimeType === 'image/vnd.microsoft.icon') {
    const icoKey = `${key}.ico`;
    await writeFile(getBrandingPath(icoKey), buffer);
    generatedFiles.push(icoKey);
    
    // Try to convert to PNG sizes
    try {
      for (const { size, name } of FAVICON_SIZES) {
        const pngBuffer = await sharp(buffer)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        const pngKey = `${key}-${name}`;
        await writeFile(getBrandingPath(pngKey), pngBuffer);
        generatedFiles.push(pngKey);
      }
    } catch {
      // ICO conversion may fail, that's okay
    }
    
    return { success: true, key, generatedFiles };
  }
  
  // Handle raster images (PNG, JPEG, WebP)
  // Save original (converted to PNG for consistency)
  const ext = getExtFromMime(mimeType);
  const originalKey = `${key}-original${ext}`;
  await writeFile(getBrandingPath(originalKey), buffer);
  generatedFiles.push(originalKey);
  
  // Generate all favicon sizes
  try {
    for (const { size, name } of FAVICON_SIZES) {
      const pngBuffer = await sharp(buffer)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const pngKey = `${key}-${name}`;
      await writeFile(getBrandingPath(pngKey), pngBuffer);
      generatedFiles.push(pngKey);
    }
    
    // Generate .ico file (simplified - use 32x32 PNG)
    const ico32 = await sharp(buffer)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const icoKey = `${key}.ico`;
    await writeFile(getBrandingPath(icoKey), ico32);
    generatedFiles.push(icoKey);
  } catch (err) {
    console.error('Failed to generate favicon sizes:', err);
    return { success: false, error: 'Failed to process favicon image' };
  }
  
  return { success: true, key, generatedFiles };
}

/**
 * Clean up old branding files when logo/favicon key changes
 */
export async function cleanupOldBrandingFiles(oldKey: string | null): Promise<void> {
  if (!oldKey) return;
  
  try {
    const { readdir } = await import('fs/promises');
    const files = await readdir(BRANDING_DIR);
    
    // Delete all files that start with the old key prefix
    for (const file of files) {
      if (file.startsWith(oldKey)) {
        await deleteBrandingFile(file);
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}
