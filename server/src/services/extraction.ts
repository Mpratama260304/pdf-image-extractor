import { randomBytes } from 'crypto';
import prisma from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { 
  extractImagesFromPDF, 
  deleteExtractionFiles, 
  calculateSHA256,
  calculateStorageUsage,
  getExtractionPath,
  type ProgressCallback,
} from './pdf-extractor.js';
import { env } from '../config/env.js';
import { existsSync } from 'fs';

// Status constants
export const ExtractionStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ExtractionStatusType = typeof ExtractionStatus[keyof typeof ExtractionStatus];

// Result types for upload handling
export interface UploadResult {
  extraction: Awaited<ReturnType<typeof getExtractionById>>;
  shareToken: string;
  isExisting: boolean;
  isCached: boolean;
  status: ExtractionStatusType;
}

/**
 * Generate a unique share token
 */
function generateShareToken(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Check if extraction with same hash already exists
 */
export async function findExtractionBySha256(sha256: string) {
  return prisma.extraction.findUnique({
    where: { sha256 },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      shareLinks: { where: { isPublic: true } },
    },
  });
}

/**
 * Create a new extraction record
 */
export async function createExtraction(data: {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  imageCount: number;
  status: string;
  errorMessage?: string;
  expiresAt?: Date;
}) {
  const extraction = await prisma.extraction.create({
    data: {
      id: data.id,
      originalFilename: data.originalFilename,
      sizeBytes: data.sizeBytes,
      sha256: data.sha256,
      pageCount: data.pageCount,
      imageCount: data.imageCount,
      status: data.status,
      errorMessage: data.errorMessage,
      expiresAt: data.expiresAt,
    },
  });
  
  return extraction;
}

/**
 * Update extraction status and details
 */
export async function updateExtraction(
  id: string,
  data: Partial<{
    status: string;
    pageCount: number;
    imageCount: number;
    errorMessage: string;
  }>
) {
  return prisma.extraction.update({
    where: { id },
    data,
  });
}

/**
 * Add images to an extraction
 */
export async function addImagesToExtraction(
  extractionId: string,
  images: Array<{
    filename: string;
    width: number;
    height: number;
    mimeType: string;
    sizeBytes: number;
    pageNumber: number;
    sortOrder: number;
  }>
) {
  return prisma.image.createMany({
    data: images.map((img) => ({
      extractionId,
      ...img,
    })),
  });
}

/**
 * Create a share link for an extraction
 */
export async function createShareLink(extractionId: string, isPublic: boolean = true) {
  const token = generateShareToken();
  
  return prisma.shareLink.create({
    data: {
      extractionId,
      token,
      isPublic,
    },
  });
}

/**
 * Get share link by token
 */
export async function getShareLinkByToken(token: string) {
  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      extraction: {
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });
  
  if (!shareLink) {
    return null;
  }
  
  // Check if expired
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
    return null;
  }
  
  // Check if public
  if (!shareLink.isPublic) {
    return null;
  }
  
  // Update access stats
  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  });
  
  return shareLink;
}

/**
 * Get extraction by ID with images and share links
 */
export async function getExtractionById(id: string) {
  return prisma.extraction.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      shareLinks: true,
    },
  });
}

/**
 * List extractions with enhanced filtering and sorting
 */
export async function listExtractions(options: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  dateRange?: '24h' | '7d' | '30d' | 'all';
  sort?: 'newest' | 'oldest' | 'largest' | 'mostImages';
}) {
  const { page = 1, limit = 20, search, status, dateRange = 'all', sort = 'newest' } = options;
  const skip = (page - 1) * limit;
  
  // Build where clause
  const whereConditions: any[] = [];
  
  // Search by filename or sha256
  if (search) {
    whereConditions.push({
      OR: [
        { originalFilename: { contains: search } },
        { sha256: { contains: search } },
      ],
    });
  }
  
  // Filter by status
  if (status) {
    whereConditions.push({ status });
  }
  
  // Filter by date range
  if (dateRange !== 'all') {
    const now = new Date();
    let dateFrom: Date;
    
    switch (dateRange) {
      case '24h':
        dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFrom = new Date(0);
    }
    
    whereConditions.push({ createdAt: { gte: dateFrom } });
  }
  
  const where = whereConditions.length > 0 ? { AND: whereConditions } : {};
  
  // Build order by clause
  let orderBy: any;
  switch (sort) {
    case 'oldest':
      orderBy = { createdAt: 'asc' };
      break;
    case 'largest':
      orderBy = { sizeBytes: 'desc' };
      break;
    case 'mostImages':
      orderBy = { imageCount: 'desc' };
      break;
    case 'newest':
    default:
      orderBy = { createdAt: 'desc' };
  }
  
  const [extractions, total] = await Promise.all([
    prisma.extraction.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        shareLinks: true,
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.extraction.count({ where }),
  ]);
  
  return {
    extractions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Delete extraction and all associated data
 */
export async function deleteExtraction(id: string): Promise<boolean> {
  const extraction = await prisma.extraction.findUnique({ where: { id } });
  
  if (!extraction) {
    return false;
  }
  
  // Delete files from disk
  await deleteExtractionFiles(id);
  
  // Delete from database (cascades to images and share links)
  await prisma.extraction.delete({ where: { id } });
  
  return true;
}

/**
 * Update share link settings
 */
export async function updateShareLink(
  token: string,
  data: Partial<{
    isPublic: boolean;
    expiresAt: Date | null;
  }>
) {
  return prisma.shareLink.update({
    where: { token },
    data,
  });
}

/**
 * Regenerate share link token
 */
export async function regenerateShareToken(oldToken: string) {
  const newToken = generateShareToken();
  
  return prisma.shareLink.update({
    where: { token: oldToken },
    data: { token: newToken },
  });
}

/**
 * Get admin statistics
 */
export async function getAdminStats() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const [
    extractionStats,
    storageStats,
    completedCount,
    failedCount,
    pendingCount,
    processingCount,
    totalShareLinks,
    extractionsLast24h,
    extractionsLast7d,
    topLargest,
  ] = await Promise.all([
    prisma.extraction.aggregate({
      _count: true,
      _sum: { imageCount: true, sizeBytes: true },
    }),
    calculateStorageUsage(),
    prisma.extraction.count({ where: { status: 'completed' } }),
    prisma.extraction.count({ where: { status: 'failed' } }),
    prisma.extraction.count({ where: { status: 'pending' } }),
    prisma.extraction.count({ where: { status: 'processing' } }),
    prisma.shareLink.count(),
    prisma.extraction.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.extraction.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.extraction.findMany({
      orderBy: { sizeBytes: 'desc' },
      take: 5,
      select: {
        id: true,
        originalFilename: true,
        sizeBytes: true,
        imageCount: true,
        createdAt: true,
      },
    }),
  ]);
  
  return {
    totalExtractions: extractionStats._count,
    totalImages: extractionStats._sum.imageCount ?? 0,
    totalUploadedBytes: extractionStats._sum.sizeBytes ?? 0,
    storageUsedBytes: storageStats.totalBytes,
    completedExtractions: completedCount,
    failedExtractions: failedCount,
    pendingExtractions: pendingCount,
    processingExtractions: processingCount,
    totalShareLinks,
    extractionsLast24h,
    extractionsLast7d,
    topLargestExtractions: topLargest.map((e) => ({
      id: e.id,
      originalFilename: e.originalFilename,
      sizeBytes: e.sizeBytes,
      imageCount: e.imageCount,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/**
 * Bulk delete extractions
 */
export async function bulkDeleteExtractions(ids: string[]): Promise<{ deleted: number; failed: string[] }> {
  const failed: string[] = [];
  let deleted = 0;
  
  for (const id of ids) {
    try {
      const success = await deleteExtraction(id);
      if (success) {
        deleted++;
      } else {
        failed.push(id);
      }
    } catch (error) {
      console.error(`Failed to delete extraction ${id}:`, error);
      failed.push(id);
    }
  }
  
  return { deleted, failed };
}

/**
 * Bulk update extraction expiry
 */
export async function bulkUpdateExpiry(ids: string[], expiresAt: Date | null): Promise<{ updated: number }> {
  const result = await prisma.extraction.updateMany({
    where: { id: { in: ids } },
    data: { expiresAt },
  });
  
  return { updated: result.count };
}

/**
 * Get bulk info (for confirmation dialogs)
 */
export async function getBulkInfo(ids: string[]) {
  const extractions = await prisma.extraction.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      originalFilename: true,
      sizeBytes: true,
      imageCount: true,
    },
  });
  
  const totalSize = extractions.reduce((sum, e) => sum + e.sizeBytes, 0);
  const totalImages = extractions.reduce((sum, e) => sum + e.imageCount, 0);
  
  return {
    count: extractions.length,
    totalSize,
    totalImages,
    extractions,
  };
}

/**
 * Clean up expired extractions
 */
export async function cleanupExpiredExtractions(): Promise<number> {
  const now = new Date();
  
  const expiredExtractions = await prisma.extraction.findMany({
    where: {
      expiresAt: { lt: now },
    },
    select: { id: true },
  });
  
  let deletedCount = 0;
  
  for (const extraction of expiredExtractions) {
    const deleted = await deleteExtraction(extraction.id);
    if (deleted) {
      deletedCount++;
    }
  }
  
  return deletedCount;
}

/**
 * Process PDF extraction with full workflow
 * 
 * This function is IDEMPOTENT by sha256:
 * - If a completed extraction exists with files → return cached result
 * - If a processing extraction exists → return it (caller can poll)
 * - If a failed extraction exists → reuse record and retry
 * - If no extraction exists → create new one
 * 
 * Handles race conditions by catching P2002 unique constraint errors
 * and refetching the existing record.
 */
export async function processExtraction(
  pdfBuffer: Buffer,
  originalFilename: string,
  onProgress?: ProgressCallback
): Promise<UploadResult> {
  // Calculate hash first to check for duplicates
  const sha256 = calculateSHA256(pdfBuffer);
  
  console.log(`[Extraction] Processing upload: ${originalFilename}, sha256=${sha256.slice(0, 12)}...`);
  
  // Check for existing extraction with same hash
  let existing = await findExtractionBySha256(sha256);
  
  // Handle existing extraction based on status
  if (existing) {
    const filesExist = existsSync(getExtractionPath(existing.id));
    
    // Case 1: Completed and files exist → return cached result
    if (existing.status === ExtractionStatus.COMPLETED && filesExist && existing.images.length > 0) {
      console.log(`[Extraction] CACHE HIT: Returning existing completed extraction ${existing.id}`);
      const shareLink = existing.shareLinks[0] || await createShareLink(existing.id);
      
      return {
        extraction: existing,
        shareToken: shareLink.token,
        isExisting: true,
        isCached: true,
        status: ExtractionStatus.COMPLETED,
      };
    }
    
    // Case 2: Currently processing → return current state (caller can poll)
    if (existing.status === ExtractionStatus.PROCESSING) {
      console.log(`[Extraction] IN PROGRESS: Extraction ${existing.id} is still processing`);
      const shareLink = existing.shareLinks[0] || await createShareLink(existing.id);
      
      return {
        extraction: existing,
        shareToken: shareLink.token,
        isExisting: true,
        isCached: false,
        status: ExtractionStatus.PROCESSING,
      };
    }
    
    // Case 3: Failed or files missing → clean up and retry with same record
    console.log(`[Extraction] RETRY: Reusing failed/incomplete extraction ${existing.id}`);
    
    // Clean up old files if any
    await deleteExtractionFiles(existing.id);
    
    // Delete old images from DB
    await prisma.image.deleteMany({ where: { extractionId: existing.id } });
    
    // Reset extraction for retry
    existing = await prisma.extraction.update({
      where: { id: existing.id },
      data: {
        status: ExtractionStatus.PROCESSING,
        errorMessage: null,
        pageCount: 0,
        imageCount: 0,
        originalFilename, // Update filename in case it changed
        sizeBytes: pdfBuffer.length,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        shareLinks: { where: { isPublic: true } },
      },
    });
    
    // Process with existing ID
    return await performExtraction(existing.id, pdfBuffer, originalFilename, sha256, onProgress);
  }
  
  // No existing extraction → create new one
  // Handle race condition with upsert pattern + catch P2002
  const extractionId = `ext_${Date.now()}_${randomBytes(8).toString('hex')}`;
  const expiresAt = env.EXTRACTION_EXPIRY_DAYS > 0
    ? new Date(Date.now() + env.EXTRACTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    : undefined;
  
  try {
    await createExtraction({
      id: extractionId,
      originalFilename,
      sizeBytes: pdfBuffer.length,
      sha256,
      pageCount: 0,
      imageCount: 0,
      status: ExtractionStatus.PROCESSING,
      expiresAt,
    });
    
    console.log(`[Extraction] NEW: Created extraction ${extractionId}`);
    
    return await performExtraction(extractionId, pdfBuffer, originalFilename, sha256, onProgress);
    
  } catch (error) {
    // Handle unique constraint violation (race condition)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      console.log(`[Extraction] RACE CONDITION: sha256 collision, refetching existing record`);
      
      // Refetch the existing record that won the race
      const winner = await findExtractionBySha256(sha256);
      
      if (winner) {
        // Return existing extraction (may be processing or completed by now)
        const shareLink = winner.shareLinks[0] || await createShareLink(winner.id);
        
        return {
          extraction: winner,
          shareToken: shareLink.token,
          isExisting: true,
          isCached: winner.status === ExtractionStatus.COMPLETED,
          status: winner.status as ExtractionStatusType,
        };
      }
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Perform the actual PDF extraction (internal helper)
 */
async function performExtraction(
  extractionId: string,
  pdfBuffer: Buffer,
  originalFilename: string,
  sha256: string,
  onProgress?: ProgressCallback
): Promise<UploadResult> {
  try {
    // Run extraction
    const result = await extractImagesFromPDF(
      pdfBuffer,
      originalFilename,
      extractionId,
      onProgress
    );
    
    if (!result.success) {
      // Update status to failed
      await updateExtraction(extractionId, {
        status: ExtractionStatus.FAILED,
        errorMessage: result.error,
        pageCount: result.pageCount,
      });
      
      throw new Error(result.error || 'Extraction failed');
    }
    
    // Add images to database
    await addImagesToExtraction(
      extractionId,
      result.images.map((img, index) => ({
        filename: img.filename,
        width: img.width,
        height: img.height,
        mimeType: img.mimeType,
        sizeBytes: img.sizeBytes,
        pageNumber: img.pageNumber,
        sortOrder: index,
      }))
    );
    
    // Update extraction status
    await updateExtraction(extractionId, {
      status: ExtractionStatus.COMPLETED,
      pageCount: result.pageCount,
      imageCount: result.imageCount,
    });
    
    // Create share link
    const shareLink = await createShareLink(extractionId);
    
    // Get full extraction data
    const extraction = await getExtractionById(extractionId);
    
    console.log(`[Extraction] COMPLETED: ${extractionId} with ${result.imageCount} images`);
    
    return {
      extraction,
      shareToken: shareLink.token,
      isExisting: false,
      isCached: false,
      status: ExtractionStatus.COMPLETED,
    };
  } catch (error) {
    // Update status to failed if not already
    await updateExtraction(extractionId, {
      status: ExtractionStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    
    console.error(`[Extraction] FAILED: ${extractionId}`, error);
    
    throw error;
  }
}
