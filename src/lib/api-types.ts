// API Types for frontend

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ImageData {
  id: string;
  url: string;
  filename: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  pageNumber: number;
}

export interface ExtractionResponse {
  extractionId: string;
  shareToken: string;
  // Relative path for share link - frontend constructs absolute URL
  sharePath: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  imageCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  errorMessage?: string | null;
  createdAt: string;
  expiresAt: string | null;
  images: ImageData[];
  isExisting: boolean;
  cached?: boolean;
}

export interface ShareLinkData {
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
  images: ImageData[];
  downloadZipUrl: string;
  isPublic: boolean;
  accessCount: number;
  lastAccessedAt: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
}

export interface AdminStats {
  totalExtractions: number;
  totalImages: number;
  totalUploadedBytes: number;
  storageUsedBytes: number;
  completedExtractions: number;
  failedExtractions: number;
  pendingExtractions: number;
  processingExtractions: number;
  totalShareLinks: number;
  extractionsLast24h: number;
  extractionsLast7d: number;
  topLargestExtractions: {
    id: string;
    originalFilename: string;
    sizeBytes: number;
    imageCount: number;
    createdAt: string;
  }[];
}

export interface AdminExtraction {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  imageCount: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  expiresAt: string | null;
  // Top-level share token for easy access (null if no share link)
  shareToken: string | null;
  shareLinks: {
    token: string;
    sharePath: string;
    isPublic: boolean;
    accessCount: number;
    lastAccessedAt: string | null;
    expiresAt: string | null;
  }[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Settings types
export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  adminLogoKey: string | null;
  faviconKey: string | null;
  adminLogoUrl: string | null;
  faviconUrl: string | null;
  allowedLogoTypes: string[];
  allowedFaviconTypes: string[];
  maxLogoSizeMB: number;
  maxFaviconSizeMB: number;
  updatedAt: string;
}

export interface PublicSettings {
  siteTitle: string;
  siteDescription: string;
  hasAdminLogo: boolean;
  hasFavicon: boolean;
}
