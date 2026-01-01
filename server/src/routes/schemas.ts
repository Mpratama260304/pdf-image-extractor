import { z } from 'zod';

// Validation schemas for API requests

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// Enhanced pagination with filters and sorting for admin
export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  dateRange: z.enum(['24h', '7d', '30d', 'all']).default('all'),
  sort: z.enum(['newest', 'oldest', 'largest', 'mostImages']).default('newest'),
});

export const shareTokenParamSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const extractionIdParamSchema = z.object({
  id: z.string().min(1, 'Extraction ID is required'),
});

export const imageFilenameParamSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
});

export const updateShareLinkSchema = z.object({
  isPublic: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  regenerateToken: z.boolean().optional(),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'At least one ID is required'),
});

export const bulkUpdateExpirySchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'At least one ID is required'),
  expiresAt: z.string().datetime().nullable(),
});

// Response types

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ExtractionResponse {
  extractionId: string;
  shareToken: string;
  sharePath: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  imageCount: number;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  images: ImageResponse[];
  isExisting: boolean;
}

export interface ImageResponse {
  id: string;
  url: string;
  filename: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  pageNumber: number;
}

export interface ShareLinkResponse {
  token: string;
  extraction: {
    id: string;
    originalFilename: string;
    sizeBytes: number;
    pageCount: number;
    imageCount: number;
    status: string;
    createdAt: string;
    expiresAt: string | null;
  };
  images: ImageResponse[];
  downloadZipUrl: string;
  isPublic: boolean;
  accessCount: number;
  lastAccessedAt: string | null;
}

export interface AdminStatsResponse {
  totalExtractions: number;
  totalImages: number;
  totalUploadedBytes: number;
  storageUsedBytes: number;
  completedExtractions: number;
  failedExtractions: number;
  pendingExtractions: number;
  totalShareLinks: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type LoginRequest = z.infer<typeof loginSchema>;
export type PaginationQuery = z.infer<typeof paginationSchema>;
export type UpdateShareLinkRequest = z.infer<typeof updateShareLinkSchema>;

// Settings schemas

export const updateSettingsSchema = z.object({
  siteTitle: z.string().min(1).max(100).optional(),
  siteDescription: z.string().max(500).optional(),
});

export const updateProfileSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens').optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(10, 'Password must be at least 10 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type UpdatePasswordRequest = z.infer<typeof updatePasswordSchema>;
