import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { 
  processExtraction, 
  processExtractionAsync,
  getShareLinkByToken, 
  getExtractionById,
  ExtractionStatus 
} from '../services/extraction.js';
import { shareTokenParamSchema } from './schemas.js';
import { env } from '../config/env.js';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { getSettings } from '../services/settings.js';
import { readBrandingFile, getMimeFromExtension, FAVICON_SIZES } from '../services/branding.js';

export async function publicRoutes(fastify: FastifyInstance) {
  // POST /api/extractions - Upload and extract PDF (async model for timeout prevention)
  fastify.post('/api/extractions', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.requestId || 'unknown';
    
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'NO_FILE',
            message: 'No file uploaded',
            requestId,
          },
        });
      }
      
      // Validate file type
      const filename = data.filename || 'unknown.pdf';
      if (!filename.toLowerCase().endsWith('.pdf')) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only PDF files are supported',
            requestId,
          },
        });
      }
      
      // Read file buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      console.log(`[${requestId}] Upload received: ${filename}, size=${buffer.length} bytes`);
      
      // Validate file size
      if (buffer.length > env.MAX_FILE_SIZE_BYTES) {
        return reply.status(413).send({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size exceeds maximum of ${env.MAX_FILE_SIZE_MB}MB`,
            requestId,
          },
        });
      }
      
      // Process extraction with async model
      // Returns 202 immediately for new extractions, processes in background
      const result = await processExtractionAsync(buffer, filename, requestId);
      
      if (!result.extraction) {
        return reply.status(500).send({
          success: false,
          error: {
            code: 'EXTRACTION_FAILED',
            message: 'Extraction failed to initialize',
            requestId,
          },
        });
      }
      
      // Use RELATIVE URLs - frontend will construct absolute URLs using window.location.origin
      const sharePath = `/s/${result.shareToken}`;
      
      // Determine HTTP status based on result
      // - 200: Cached result returned (completed)
      // - 201: New extraction created and completed
      // - 202: Processing in progress - frontend should poll
      let httpStatus = 201;
      if (result.isCached) {
        httpStatus = 200;
      } else if (result.status === ExtractionStatus.PROCESSING) {
        httpStatus = 202;
      }
      
      console.log(`[${requestId}] Response: status=${httpStatus}, extractionId=${result.extraction.id}`);
      
      return reply.status(httpStatus).send({
        success: true,
        data: {
          extractionId: result.extraction.id,
          shareToken: result.shareToken,
          // Return relative paths - frontend builds absolute URLs
          sharePath,
          originalFilename: result.extraction.originalFilename,
          sizeBytes: result.extraction.sizeBytes,
          pageCount: result.extraction.pageCount,
          imageCount: result.extraction.imageCount,
          status: result.extraction.status,
          createdAt: result.extraction.createdAt.toISOString(),
          expiresAt: result.extraction.expiresAt?.toISOString() || null,
          images: result.extraction.images.map((img) => ({
            id: img.id,
            // Relative URL for images
            url: `/api/shares/${result.shareToken}/images/${img.filename}`,
            filename: img.filename,
            width: img.width,
            height: img.height,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            pageNumber: img.pageNumber,
          })),
          // Additional metadata for idempotency
          cached: result.isCached,
          isExisting: result.isExisting,
        },
      });
    } catch (error) {
      console.error(`[${requestId}] Extraction error:`, error);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'EXTRACTION_ERROR',
          message: error instanceof Error ? error.message : 'Extraction failed',
          requestId,
        },
      });
    }
  });
  
  // GET /api/extractions/:id - Poll extraction status (for async model)
  fastify.get('/api/extractions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.requestId || 'unknown';
    const { id } = request.params as { id: string };
    
    try {
      const extraction = await getExtractionById(id);
      
      if (!extraction) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Extraction not found',
            requestId,
          },
        });
      }
      
      // Get share token
      const shareLink = extraction.shareLinks[0];
      const shareToken = shareLink?.token;
      const sharePath = shareToken ? `/s/${shareToken}` : null;
      
      // Determine HTTP status based on extraction status
      let httpStatus = 200;
      if (extraction.status === ExtractionStatus.PROCESSING) {
        httpStatus = 202; // Still processing
      } else if (extraction.status === ExtractionStatus.FAILED) {
        httpStatus = 200; // Return error details in body
      }
      
      return reply.status(httpStatus).send({
        success: true,
        data: {
          extractionId: extraction.id,
          shareToken,
          sharePath,
          originalFilename: extraction.originalFilename,
          sizeBytes: extraction.sizeBytes,
          pageCount: extraction.pageCount,
          imageCount: extraction.imageCount,
          status: extraction.status,
          errorMessage: extraction.errorMessage,
          createdAt: extraction.createdAt.toISOString(),
          expiresAt: extraction.expiresAt?.toISOString() || null,
          images: extraction.images.map((img) => ({
            id: img.id,
            url: shareToken ? `/api/shares/${shareToken}/images/${img.filename}` : null,
            filename: img.filename,
            width: img.width,
            height: img.height,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            pageNumber: img.pageNumber,
          })),
        },
      });
    } catch (error) {
      console.error(`[${requestId}] Get extraction error:`, error);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get extraction',
          requestId,
        },
      });
    }
  });
  
  // GET /api/shares/:token - Get share link details
  fastify.get('/api/shares/:token', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = shareTokenParamSchema.parse(request.params);
      
      const shareLink = await getShareLinkByToken(params.token);
      
      if (!shareLink || !shareLink.extraction) {
        return reply.status(404).send({
          success: false,
          error: 'Share link not found or expired',
        });
      }
      
      // Use RELATIVE URLs - frontend will construct absolute URLs
      return reply.send({
        success: true,
        data: {
          token: shareLink.token,
          extraction: {
            id: shareLink.extraction.id,
            originalFilename: shareLink.extraction.originalFilename,
            sizeBytes: shareLink.extraction.sizeBytes,
            pageCount: shareLink.extraction.pageCount,
            imageCount: shareLink.extraction.imageCount,
            status: shareLink.extraction.status,
            createdAt: shareLink.extraction.createdAt.toISOString(),
            expiresAt: shareLink.extraction.expiresAt?.toISOString() || null,
          },
          images: shareLink.extraction.images.map((img) => ({
            id: img.id,
            // Relative URL
            url: `/api/shares/${params.token}/images/${img.filename}`,
            filename: img.filename,
            width: img.width,
            height: img.height,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            pageNumber: img.pageNumber,
          })),
          // Relative URL
          downloadZipUrl: `/api/shares/${params.token}/download.zip`,
          isPublic: shareLink.isPublic,
          accessCount: shareLink.accessCount,
          lastAccessedAt: shareLink.lastAccessedAt?.toISOString() || null,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid parameters',
        });
      }
      
      console.error('Share link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch share link',
      });
    }
  });
  
  // GET /api/shares/:token/download.zip - Download ZIP
  fastify.get('/api/shares/:token/download.zip', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = shareTokenParamSchema.parse(request.params);
      
      const shareLink = await getShareLinkByToken(params.token);
      
      if (!shareLink || !shareLink.extraction) {
        return reply.status(404).send({
          success: false,
          error: 'Share link not found or expired',
        });
      }
      
      const zipPath = join(env.STORAGE_DIR, 'extractions', shareLink.extraction.id, 'result.zip');
      
      if (!existsSync(zipPath)) {
        return reply.status(404).send({
          success: false,
          error: 'ZIP file not found',
        });
      }
      
      const filename = `${shareLink.extraction.originalFilename.replace('.pdf', '')}_images.zip`;
      
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      
      const stream = createReadStream(zipPath);
      return reply.send(stream);
    } catch (error) {
      console.error('ZIP download error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to download ZIP',
      });
    }
  });
  
  // GET /api/shares/:token/images/:filename - Get image file
  fastify.get('/api/shares/:token/images/:filename', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({
        token: z.string(),
        filename: z.string(),
      }).parse(request.params);
      
      const shareLink = await getShareLinkByToken(params.token);
      
      if (!shareLink || !shareLink.extraction) {
        console.log(`[Image] 404 - Share link not found: ${params.token}`);
        return reply.status(404).send({
          success: false,
          error: 'Share link not found or expired',
        });
      }
      
      // Sanitize filename to prevent path traversal
      const sanitizedFilename = params.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      
      // Verify the filename belongs to this extraction (security check)
      const image = shareLink.extraction.images.find(img => img.filename === sanitizedFilename);
      if (!image) {
        console.log(`[Image] 404 - Image not in extraction: ${sanitizedFilename}`);
        return reply.status(404).send({
          success: false,
          error: 'Image not found in extraction',
        });
      }
      
      const imagePath = join(env.STORAGE_DIR, 'extractions', shareLink.extraction.id, 'images', sanitizedFilename);
      
      if (!existsSync(imagePath)) {
        console.log(`[Image] 404 - File not on disk: ${imagePath}`);
        return reply.status(404).send({
          success: false,
          error: 'Image file not found',
        });
      }
      
      // Get file stats for Content-Length
      const { statSync } = await import('fs');
      const stats = statSync(imagePath);
      
      // Determine mime type from image record or file extension
      const mimeType = image.mimeType || (sanitizedFilename.endsWith('.png') ? 'image/png' : 'image/jpeg');
      
      // Set proper headers for binary image response
      reply.header('Content-Type', mimeType);
      reply.header('Content-Length', stats.size);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('X-Content-Type-Options', 'nosniff');
      
      console.log(`[Image] 200 - Serving: ${sanitizedFilename}, type=${mimeType}, size=${stats.size}`);
      
      const stream = createReadStream(imagePath);
      return reply.send(stream);
    } catch (error) {
      console.error('[Image] Error serving image:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch image',
      });
    }
  });

  // =====================
  // Branding Routes (Public)
  // =====================

  // GET /favicon.ico - Serve custom favicon
  fastify.get('/favicon.ico', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await getSettings();
      
      if (!settings.faviconKey) {
        // No custom favicon, return 404 (browser will use default)
        return reply.status(404).send();
      }
      
      // Try to serve the .ico file
      const icoFile = await readBrandingFile(`${settings.faviconKey}.ico`);
      if (icoFile) {
        reply.header('Content-Type', 'image/x-icon');
        reply.header('Cache-Control', 'public, max-age=86400'); // 1 day cache
        reply.header('X-Content-Type-Options', 'nosniff');
        return reply.send(icoFile);
      }
      
      return reply.status(404).send();
    } catch (error) {
      console.error('Error serving favicon:', error);
      return reply.status(500).send();
    }
  });

  // GET /branding/admin-logo - Serve admin logo
  fastify.get('/branding/admin-logo', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await getSettings();
      
      if (!settings.adminLogoKey) {
        return reply.status(404).send({
          success: false,
          error: 'No admin logo configured',
        });
      }
      
      const logoFile = await readBrandingFile(settings.adminLogoKey);
      if (!logoFile) {
        return reply.status(404).send({
          success: false,
          error: 'Logo file not found',
        });
      }
      
      // Determine MIME type from filename
      const mimeType = getMimeFromExtension(settings.adminLogoKey) || 'application/octet-stream';
      
      reply.header('Content-Type', mimeType);
      reply.header('Cache-Control', 'public, max-age=86400'); // 1 day cache
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.send(logoFile);
    } catch (error) {
      console.error('Error serving admin logo:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to serve logo',
      });
    }
  });

  // GET /branding/favicon-:size - Serve specific favicon size (e.g., favicon-32x32.png)
  fastify.get('/branding/favicon-:sizeFile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = z.object({
        sizeFile: z.string(),
      }).parse(request.params);
      
      const settings = await getSettings();
      
      if (!settings.faviconKey) {
        return reply.status(404).send();
      }
      
      // Construct the full filename (e.g., favicon-abc123-favicon-32x32.png)
      const filename = `${settings.faviconKey}-${params.sizeFile}`;
      const faviconFile = await readBrandingFile(filename);
      
      if (!faviconFile) {
        return reply.status(404).send();
      }
      
      const mimeType = getMimeFromExtension(filename) || 'image/png';
      
      reply.header('Content-Type', mimeType);
      reply.header('Cache-Control', 'public, max-age=86400');
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.send(faviconFile);
    } catch (error) {
      console.error('Error serving favicon size:', error);
      return reply.status(500).send();
    }
  });

  // GET /apple-touch-icon.png - Apple touch icon shortcut
  fastify.get('/apple-touch-icon.png', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await getSettings();
      
      if (!settings.faviconKey) {
        return reply.status(404).send();
      }
      
      const filename = `${settings.faviconKey}-apple-touch-icon.png`;
      const iconFile = await readBrandingFile(filename);
      
      if (!iconFile) {
        return reply.status(404).send();
      }
      
      reply.header('Content-Type', 'image/png');
      reply.header('Cache-Control', 'public, max-age=86400');
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.send(iconFile);
    } catch (error) {
      console.error('Error serving apple touch icon:', error);
      return reply.status(500).send();
    }
  });

  // GET /api/public/settings - Get public site settings (no auth required)
  fastify.get('/api/public/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await getSettings();
      
      return reply.send({
        success: true,
        data: {
          siteTitle: settings.siteTitle,
          siteDescription: settings.siteDescription,
          hasAdminLogo: !!settings.adminLogoKey,
          hasFavicon: !!settings.faviconKey,
        },
      });
    } catch (error) {
      console.error('Error fetching public settings:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch settings',
      });
    }
  });

  // GET /api/debug/image-bytes - Debug endpoint to verify image files (dev only)
  if (env.IS_DEVELOPMENT) {
    fastify.get('/api/debug/image-bytes', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = z.object({
          token: z.string(),
          file: z.string(),
        }).parse(request.query);

        const shareLink = await getShareLinkByToken(query.token);
        
        if (!shareLink || !shareLink.extraction) {
          return reply.send({ exists: false, error: 'Share link not found' });
        }
        
        const sanitizedFilename = query.file.replace(/[^a-zA-Z0-9._-]/g, '_');
        const imagePath = join(env.STORAGE_DIR, 'extractions', shareLink.extraction.id, 'images', sanitizedFilename);
        
        if (!existsSync(imagePath)) {
          return reply.send({ exists: false, path: imagePath });
        }
        
        const { readFileSync, statSync } = await import('fs');
        const stats = statSync(imagePath);
        const buffer = readFileSync(imagePath);
        const firstBytes = buffer.slice(0, 16);
        const firstBytesHex = firstBytes.toString('hex').match(/.{2}/g)?.join(' ') || '';
        
        // Detect content type from magic bytes
        let detectedType = 'unknown';
        if (firstBytesHex.startsWith('89 50 4e 47 0d 0a 1a 0a')) {
          detectedType = 'image/png';
        } else if (firstBytesHex.startsWith('ff d8 ff')) {
          detectedType = 'image/jpeg';
        } else if (firstBytesHex.startsWith('47 49 46 38')) {
          detectedType = 'image/gif';
        }
        
        return reply.send({
          exists: true,
          path: imagePath,
          size: stats.size,
          firstBytesHex,
          detectedType,
          isValidImage: detectedType !== 'unknown',
        });
      } catch (error) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Debug failed',
        });
      }
    });
  }
}
