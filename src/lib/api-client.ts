import type {
  ApiResponse,
  ExtractionResponse,
  ShareLinkData,
  AdminUser,
  AdminStats,
  AdminExtraction,
  PaginatedResponse,
} from './api-types';

const API_BASE = '/api';

// Helper to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as ApiResponse<T>;
  
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Request failed');
  }
  
  return data.data as T;
}

// Public API

export async function uploadPDF(file: File): Promise<ExtractionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/extractions`, {
    method: 'POST',
    body: formData,
  });
  
  return handleResponse<ExtractionResponse>(response);
}

export async function getShareLink(token: string): Promise<ShareLinkData> {
  const response = await fetch(`${API_BASE}/shares/${token}`);
  return handleResponse<ShareLinkData>(response);
}

export function getImageUrl(token: string, filename: string): string {
  return `${API_BASE}/shares/${token}/images/${filename}`;
}

export function getZipDownloadUrl(token: string): string {
  return `${API_BASE}/shares/${token}/download.zip`;
}

// Admin Auth API

export async function adminLogin(emailOrUsername: string, password: string): Promise<{ user: AdminUser }> {
  const response = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ emailOrUsername, password }),
  });
  
  return handleResponse<{ user: AdminUser }>(response);
}

export async function adminLogout(): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new Error('Logout failed');
  }
}

export async function getAdminMe(): Promise<{ user: AdminUser }> {
  const response = await fetch(`${API_BASE}/admin/me`, {
    credentials: 'include',
  });
  
  return handleResponse<{ user: AdminUser }>(response);
}

// Admin Management API

export async function getAdminStats(): Promise<AdminStats> {
  const response = await fetch(`${API_BASE}/admin/stats`, {
    credentials: 'include',
  });
  
  return handleResponse<AdminStats>(response);
}

export async function getAdminExtractions(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  dateRange?: '24h' | '7d' | '30d' | 'all';
  sort?: 'newest' | 'oldest' | 'largest' | 'mostImages';
}): Promise<PaginatedResponse<AdminExtraction>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.status) searchParams.set('status', params.status);
  if (params.dateRange) searchParams.set('dateRange', params.dateRange);
  if (params.sort) searchParams.set('sort', params.sort);
  
  const response = await fetch(`${API_BASE}/admin/extractions?${searchParams}`, {
    credentials: 'include',
  });
  
  return handleResponse<PaginatedResponse<AdminExtraction>>(response);
}

export async function getAdminExtraction(id: string): Promise<AdminExtraction> {
  const response = await fetch(`${API_BASE}/admin/extractions/${id}`, {
    credentials: 'include',
  });
  
  return handleResponse<AdminExtraction>(response);
}

export async function deleteAdminExtraction(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/extractions/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Delete failed');
  }
}

export async function createShareLinkForExtraction(extractionId: string): Promise<{ token: string; sharePath: string; isPublic: boolean }> {
  const response = await fetch(`${API_BASE}/admin/extractions/${extractionId}/shares`, {
    method: 'POST',
    credentials: 'include',
  });
  
  return handleResponse<{ token: string; sharePath: string; isPublic: boolean }>(response);
}

export async function updateShareLink(
  token: string,
  data: { isPublic?: boolean; expiresAt?: string | null; regenerateToken?: boolean }
): Promise<{ token: string; sharePath: string }> {
  const response = await fetch(`${API_BASE}/admin/shares/${token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  
  return handleResponse<{ token: string; sharePath: string }>(response);
}

export async function runCleanup(): Promise<{ deletedCount: number }> {
  const response = await fetch(`${API_BASE}/admin/cleanup`, {
    method: 'POST',
    credentials: 'include',
  });
  
  return handleResponse<{ deletedCount: number }>(response);
}

// Bulk operations

export async function bulkDeleteExtractions(ids: string[]): Promise<{ deleted: number; failed: string[] }> {
  const response = await fetch(`${API_BASE}/admin/extractions/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids }),
  });
  
  return handleResponse<{ deleted: number; failed: string[] }>(response);
}

export async function bulkUpdateExpiry(ids: string[], expiresAt: string | null): Promise<{ updated: number }> {
  const response = await fetch(`${API_BASE}/admin/extractions/bulk-expiry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids, expiresAt }),
  });
  
  return handleResponse<{ updated: number }>(response);
}

export async function getBulkInfo(ids: string[]): Promise<{
  count: number;
  totalSize: number;
  totalImages: number;
  extractions: { id: string; originalFilename: string; sizeBytes: number; imageCount: number }[];
}> {
  const response = await fetch(`${API_BASE}/admin/extractions/bulk-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids }),
  });
  
  return handleResponse<{
    count: number;
    totalSize: number;
    totalImages: number;
    extractions: { id: string; originalFilename: string; sizeBytes: number; imageCount: number }[];
  }>(response);
}
