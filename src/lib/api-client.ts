import type {
  ApiResponse,
  ExtractionResponse,
  ShareLinkData,
  AdminUser,
  AdminStats,
  AdminExtraction,
  PaginatedResponse,
  SiteSettings,
  PublicSettings,
} from './api-types';

const API_BASE = '/api';

// =============================================================================
// ROBUST ERROR HANDLING (PART A)
// =============================================================================

/**
 * Diagnostic information for debugging upload/request failures
 */
export interface RequestDiagnostic {
  timestamp: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  contentType: string | null;
  requestId: string | null;
  bodySnippet: string;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
  };
  errorType: 'json_parse' | 'html_response' | 'network' | 'timeout' | 'http_error' | 'unknown';
}

/**
 * Extended error class with diagnostic information
 */
export class ApiError extends Error {
  public readonly diagnostic: RequestDiagnostic;
  public readonly userMessage: string;

  constructor(message: string, userMessage: string, diagnostic: RequestDiagnostic) {
    super(message);
    this.name = 'ApiError';
    this.userMessage = userMessage;
    this.diagnostic = diagnostic;
  }

  /**
   * Download diagnostic info as JSON file
   */
  downloadDiagnostic(): void {
    const blob = new Blob([JSON.stringify(this.diagnostic, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-diagnostic-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Get user-friendly error message based on status code and content
 */
function getUserFriendlyMessage(status: number, bodySnippet: string, contentType: string | null): string {
  // Check for common proxy/gateway errors
  if (status === 413) {
    return 'File terlalu besar / melebihi batas upload. Coba file yang lebih kecil (maksimal 200MB).';
  }
  
  if (status === 504) {
    return 'Server timeout - proses memakan waktu terlalu lama. Coba upload ulang atau gunakan file PDF yang lebih kecil.';
  }
  
  if (status === 502) {
    return 'Gateway error - server sedang tidak tersedia. Coba lagi dalam beberapa saat.';
  }
  
  if (status === 503) {
    return 'Server sedang sibuk atau dalam maintenance. Coba lagi dalam beberapa saat.';
  }
  
  if (status === 408) {
    return 'Request timeout - koneksi terlalu lambat. Periksa koneksi internet Anda.';
  }
  
  // Check if response is HTML (proxy error page)
  if (contentType?.includes('text/html') || bodySnippet.trim().startsWith('<')) {
    if (bodySnippet.toLowerCase().includes('timeout')) {
      return 'Server timeout (reverse proxy). Proses ekstraksi memakan waktu terlalu lama.';
    }
    if (bodySnippet.toLowerCase().includes('too large') || bodySnippet.toLowerCase().includes('413')) {
      return 'File terlalu besar (reverse proxy limit). Coba file yang lebih kecil.';
    }
    if (bodySnippet.toLowerCase().includes('bad gateway') || bodySnippet.toLowerCase().includes('502')) {
      return 'Gateway error - server backend tidak merespon.';
    }
    return 'Server mengembalikan halaman HTML (reverse proxy error). Coba lagi atau hubungi administrator.';
  }
  
  // Default messages by status range
  if (status >= 500) {
    return 'Server error - terjadi kesalahan internal. Coba lagi dalam beberapa saat.';
  }
  
  if (status === 404) {
    return 'Endpoint tidak ditemukan. Mungkin ada masalah konfigurasi server.';
  }
  
  if (status === 401 || status === 403) {
    return 'Akses ditolak. Silakan login ulang.';
  }
  
  if (status >= 400) {
    return 'Request tidak valid. Periksa file yang diupload.';
  }
  
  return 'Terjadi kesalahan yang tidak diketahui. Coba lagi.';
}

/**
 * Determine error type from response characteristics
 */
function getErrorType(
  status: number,
  contentType: string | null,
  body: string,
  isNetworkError: boolean
): RequestDiagnostic['errorType'] {
  if (isNetworkError) return 'network';
  
  if (contentType?.includes('text/html') || body.trim().startsWith('<')) {
    return 'html_response';
  }
  
  if (status === 504 || status === 408) return 'timeout';
  if (status >= 400) return 'http_error';
  
  return 'unknown';
}

/**
 * Safe response handler that never throws JSON parse errors
 * Detects HTML responses and provides actionable error messages
 */
async function handleResponseSafe<T>(
  response: Response,
  url: string,
  method: string,
  fileInfo?: { name: string; size: number; type: string }
): Promise<T> {
  const status = response.status;
  const statusText = response.statusText;
  const contentType = response.headers.get('content-type');
  const requestId = response.headers.get('x-request-id');
  
  // Read body as text first (safe)
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (e) {
    bodyText = '[Could not read response body]';
  }
  
  const bodySnippet = bodyText.slice(0, 500);
  
  // Create diagnostic object
  const diagnostic: RequestDiagnostic = {
    timestamp: new Date().toISOString(),
    url,
    method,
    status,
    statusText,
    contentType,
    requestId,
    bodySnippet,
    fileInfo,
    errorType: 'unknown',
  };
  
  // Check if response is JSON
  const isJsonContent = contentType?.includes('application/json');
  
  if (isJsonContent && response.ok) {
    // Try to parse as JSON
    try {
      const data = JSON.parse(bodyText) as ApiResponse<T>;
      
      if (data.success) {
        return data.data as T;
      }
      
      // API returned success: false
      diagnostic.errorType = 'http_error';
      throw new ApiError(
        data.error || 'Request failed',
        data.error || 'Permintaan gagal',
        diagnostic
      );
    } catch (parseError) {
      if (parseError instanceof ApiError) throw parseError;
      
      // JSON parse error even though content-type was JSON
      diagnostic.errorType = 'json_parse';
      const userMessage = 'Server mengembalikan response yang tidak valid (JSON parse error).';
      throw new ApiError(
        `JSON parse error: ${parseError}`,
        userMessage,
        diagnostic
      );
    }
  }
  
  // Response is not OK or not JSON
  diagnostic.errorType = getErrorType(status, contentType, bodyText, false);
  const userMessage = getUserFriendlyMessage(status, bodySnippet, contentType);
  
  // Try to extract error message from JSON if possible
  let apiErrorMessage = userMessage;
  if (isJsonContent) {
    try {
      const errorData = JSON.parse(bodyText);
      if (errorData.error?.message) {
        apiErrorMessage = errorData.error.message;
      } else if (errorData.error) {
        apiErrorMessage = typeof errorData.error === 'string' ? errorData.error : userMessage;
      } else if (errorData.message) {
        apiErrorMessage = errorData.message;
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  throw new ApiError(
    `HTTP ${status}: ${statusText}`,
    apiErrorMessage,
    diagnostic
  );
}

/**
 * Wrapper for fetch that handles network errors and timeouts
 */
async function safeFetch(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 300000, ...fetchOptions } = options; // 5 minute default timeout
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      const diagnostic: RequestDiagnostic = {
        timestamp: new Date().toISOString(),
        url,
        method: fetchOptions.method || 'GET',
        status: 0,
        statusText: 'Request Timeout',
        contentType: null,
        requestId: null,
        bodySnippet: 'Request was aborted due to timeout',
        errorType: 'timeout',
      };
      throw new ApiError(
        'Request timeout',
        'Request timeout - koneksi terlalu lambat atau server tidak merespon.',
        diagnostic
      );
    }
    
    // Handle network errors
    const diagnostic: RequestDiagnostic = {
      timestamp: new Date().toISOString(),
      url,
      method: fetchOptions.method || 'GET',
      status: 0,
      statusText: 'Network Error',
      contentType: null,
      requestId: null,
      bodySnippet: error instanceof Error ? error.message : 'Unknown network error',
      errorType: 'network',
    };
    throw new ApiError(
      'Network error',
      'Gagal terhubung ke server. Periksa koneksi internet Anda.',
      diagnostic
    );
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

export async function uploadPDF(file: File): Promise<ExtractionResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  const fileInfo = { name: file.name, size: file.size, type: file.type };
  const url = `${API_BASE}/extractions`;
  
  const response = await safeFetch(url, {
    method: 'POST',
    body: formData,
    timeout: 600000, // 10 minute timeout for large files
  });
  
  return handleResponseSafe<ExtractionResponse>(response, url, 'POST', fileInfo);
}

/**
 * Poll extraction status (for async extraction model)
 */
export async function getExtractionStatus(extractionId: string): Promise<ExtractionResponse> {
  const url = `${API_BASE}/extractions/${extractionId}`;
  const response = await safeFetch(url);
  return handleResponseSafe<ExtractionResponse>(response, url, 'GET');
}

export async function getShareLink(token: string): Promise<ShareLinkData> {
  const url = `${API_BASE}/shares/${token}`;
  const response = await safeFetch(url);
  return handleResponseSafe<ShareLinkData>(response, url, 'GET');
}

export function getImageUrl(token: string, filename: string): string {
  return `${API_BASE}/shares/${token}/images/${filename}`;
}

export function getZipDownloadUrl(token: string): string {
  return `${API_BASE}/shares/${token}/download.zip`;
}

// =============================================================================
// ADMIN AUTH API
// =============================================================================

export async function adminLogin(emailOrUsername: string, password: string): Promise<{ user: AdminUser }> {
  const url = `${API_BASE}/admin/login`;
  const response = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ emailOrUsername, password }),
  });
  
  return handleResponseSafe<{ user: AdminUser }>(response, url, 'POST');
}

export async function adminLogout(): Promise<void> {
  const response = await safeFetch(`${API_BASE}/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new Error('Logout failed');
  }
}

export async function getAdminMe(): Promise<{ user: AdminUser }> {
  const url = `${API_BASE}/admin/me`;
  const response = await safeFetch(url, {
    credentials: 'include',
  });
  
  return handleResponseSafe<{ user: AdminUser }>(response, url, 'GET');
}

// =============================================================================
// ADMIN MANAGEMENT API
// =============================================================================

export async function getAdminStats(): Promise<AdminStats> {
  const url = `${API_BASE}/admin/stats`;
  const response = await safeFetch(url, {
    credentials: 'include',
  });
  
  return handleResponseSafe<AdminStats>(response, url, 'GET');
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
  
  const url = `${API_BASE}/admin/extractions?${searchParams}`;
  const response = await safeFetch(url, {
    credentials: 'include',
  });
  
  return handleResponseSafe<PaginatedResponse<AdminExtraction>>(response, url, 'GET');
}

export async function getAdminExtraction(id: string): Promise<AdminExtraction> {
  const url = `${API_BASE}/admin/extractions/${id}`;
  const response = await safeFetch(url, {
    credentials: 'include',
  });
  
  return handleResponseSafe<AdminExtraction>(response, url, 'GET');
}

export async function deleteAdminExtraction(id: string): Promise<void> {
  const url = `${API_BASE}/admin/extractions/${id}`;
  const response = await safeFetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    await handleResponseSafe<void>(response, url, 'DELETE');
  }
}

export async function createShareLinkForExtraction(extractionId: string): Promise<{ token: string; sharePath: string; isPublic: boolean }> {
  const url = `${API_BASE}/admin/extractions/${extractionId}/shares`;
  const response = await safeFetch(url, {
    method: 'POST',
    credentials: 'include',
  });
  
  return handleResponseSafe<{ token: string; sharePath: string; isPublic: boolean }>(response, url, 'POST');
}

export async function updateShareLink(
  token: string,
  data: { isPublic?: boolean; expiresAt?: string | null; regenerateToken?: boolean }
): Promise<{ token: string; sharePath: string }> {
  const url = `${API_BASE}/admin/shares/${token}`;
  const response = await safeFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  
  return handleResponseSafe<{ token: string; sharePath: string }>(response, url, 'PATCH');
}

export async function runCleanup(): Promise<{ deletedCount: number }> {
  const url = `${API_BASE}/admin/cleanup`;
  const response = await safeFetch(url, {
    method: 'POST',
    credentials: 'include',
  });
  
  return handleResponseSafe<{ deletedCount: number }>(response, url, 'POST');
}

// =============================================================================
// BULK OPERATIONS
// =============================================================================

export async function bulkDeleteExtractions(ids: string[]): Promise<{ deleted: number; failed: string[] }> {
  const url = `${API_BASE}/admin/extractions/bulk-delete`;
  const response = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids }),
  });
  
  return handleResponseSafe<{ deleted: number; failed: string[] }>(response, url, 'POST');
}

export async function bulkUpdateExpiry(ids: string[], expiresAt: string | null): Promise<{ updated: number }> {
  const url = `${API_BASE}/admin/extractions/bulk-expiry`;
  const response = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids, expiresAt }),
  });
  
  return handleResponseSafe<{ updated: number }>(response, url, 'POST');
}

export async function getBulkInfo(ids: string[]): Promise<{
  count: number;
  totalSize: number;
  totalImages: number;
  extractions: { id: string; originalFilename: string; sizeBytes: number; imageCount: number }[];
}> {
  const url = `${API_BASE}/admin/extractions/bulk-info`;
  const response = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ids }),
  });
  
  return handleResponseSafe<{
    count: number;
    totalSize: number;
    totalImages: number;
    extractions: { id: string; originalFilename: string; sizeBytes: number; imageCount: number }[];
  }>(response, url, 'POST');
}

// =============================================================================
// SETTINGS API
// =============================================================================

export async function getAdminSettings(): Promise<SiteSettings> {
  const url = `${API_BASE}/admin/settings`;
  const response = await safeFetch(url, {
    credentials: 'include',
  });
  
  return handleResponseSafe<SiteSettings>(response, url, 'GET');
}

export async function updateAdminSettings(data: {
  siteTitle?: string;
  siteDescription?: string;
}): Promise<SiteSettings> {
  const url = `${API_BASE}/admin/settings`;
  const response = await safeFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  
  return handleResponseSafe<SiteSettings>(response, url, 'PATCH');
}

export async function uploadAdminLogo(file: File): Promise<{ adminLogoKey: string; logoUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const url = `${API_BASE}/admin/settings/admin-logo`;
  const response = await safeFetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  
  return handleResponseSafe<{ adminLogoKey: string; logoUrl: string }>(response, url, 'POST', {
    name: file.name,
    size: file.size,
    type: file.type,
  });
}

export async function removeAdminLogo(): Promise<void> {
  const url = `${API_BASE}/admin/settings/admin-logo`;
  const response = await safeFetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    await handleResponseSafe<void>(response, url, 'DELETE');
  }
}

export async function uploadFavicon(file: File): Promise<{ faviconKey: string; generatedFiles: string[]; faviconUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const url = `${API_BASE}/admin/settings/favicon`;
  const response = await safeFetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  
  return handleResponseSafe<{ faviconKey: string; generatedFiles: string[]; faviconUrl: string }>(response, url, 'POST', {
    name: file.name,
    size: file.size,
    type: file.type,
  });
}

export async function removeFavicon(): Promise<void> {
  const url = `${API_BASE}/admin/settings/favicon`;
  const response = await safeFetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  if (!response.ok) {
    await handleResponseSafe<void>(response, url, 'DELETE');
  }
}

// =============================================================================
// PROFILE API
// =============================================================================

export async function updateAdminProfile(data: {
  email?: string;
  username?: string;
}): Promise<{ user: AdminUser }> {
  const url = `${API_BASE}/admin/profile`;
  const response = await safeFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  
  return handleResponseSafe<{ user: AdminUser }>(response, url, 'PATCH');
}

export async function updateAdminPassword(data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  const url = `${API_BASE}/admin/profile/password`;
  const response = await safeFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    await handleResponseSafe<void>(response, url, 'PATCH');
  }
}

// =============================================================================
// PUBLIC SETTINGS API (no auth required)
// =============================================================================

export async function getPublicSettings(): Promise<PublicSettings> {
  const url = `${API_BASE}/public/settings`;
  const response = await safeFetch(url);
  return handleResponseSafe<PublicSettings>(response, url, 'GET');
}
