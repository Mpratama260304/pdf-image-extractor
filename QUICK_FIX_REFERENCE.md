# Quick Fix Reference - Worker Loading Issue

## Problem
```
PDF_LOAD_FAILED: Setting up fake worker failed: 
"Failed to fetch dynamically imported module: 
https://cdnjs.cloudflare.com/.../pdf.worker.min.js"
```

## Root Cause
- PDF.js worker loading from external CDN
- CDN blocked by firewall/proxy
- Network connectivity issues
- CSP restrictions

## Solution Summary

### 1. Local Worker Bundle ✅
**Before:**
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
```

**After:**
```typescript
async function initializePDFWorker() {
  const workerUrl = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
  workerInitialized = true
}
```

### 2. Automatic Server Fallback ✅
```typescript
try {
  pdf = await tryLoadPDFWithFallbacks(arrayBuffer, diagnostic)
} catch (loadError: any) {
  if (workerLoadFailed) {
    // Automatically fall back to server
    const serverResult = await extractViaServer(file, diagnostic, onProgress)
    return serverResult
  }
}
```

### 3. User Options ✅
- Automatic fallback (transparent to user)
- Manual "Process on Server" button
- Clear error messages with recommendations

## Quick Debug

### Check Worker Loading
```javascript
// Browser console
console.log(pdfjsLib.GlobalWorkerOptions.workerSrc)
// Should be: blob:http://... or /assets/pdf.worker...
// NOT: cdnjs.cloudflare.com
```

### Test Fallback
1. Open Network tab in DevTools
2. Block `cdnjs.cloudflare.com` 
3. Upload PDF
4. Should see POST to `/api/extract-images`
5. Should complete successfully

### Check Error Type
```javascript
// In error diagnostic
if (errorCode === 'WORKER_LOAD_ERROR') {
  // Worker failed to load
} else if (errorCode === 'ALL_METHODS_FAILED') {
  // Both client and server failed
}
```

## Files Changed
- `src/lib/pdf-extractor.ts` - Worker init + server fallback
- `src/components/ErrorView.tsx` - New error types + server button
- `src/App.tsx` - Force server extraction handler
- `SERVER_API_SPEC.md` - Server implementation guide
- `WORKER_FIX_GUIDE.md` - Detailed documentation

## Server API Required

**Endpoint:** POST `/api/extract-images`

**Request:**
```bash
curl -X POST /api/extract-images \
  -F "pdf=@file.pdf" \
  -F "sessionId=session_123"
```

**Response:**
```json
{
  "success": true,
  "images": [
    {
      "data": "data:image/png;base64,...",
      "format": "PNG",
      "width": 1920,
      "height": 1080,
      "pageNumber": 1
    }
  ]
}
```

## Testing

### ✅ Normal Case
```bash
# Upload PDF → Client extracts → Success
```

### ✅ Worker Blocked
```bash
# Block CDN → Upload PDF → Server fallback → Success
```

### ✅ Manual Override
```bash
# Upload → Error → Click "Process on Server" → Success
```

## Common Issues

### Worker Still Loading from CDN
**Fix:** Clear cache, rebuild app
```bash
rm -rf node_modules/.vite
npm run build
```

### Server Fallback Not Working
**Fix:** Check API endpoint is implemented
```bash
curl -X POST http://localhost:3000/api/extract-images
# Should not return 404
```

### CSP Blocking Worker
**Fix:** Update CSP header
```
Content-Security-Policy: worker-src 'self' blob:;
```

## Success Indicators
- ✅ No CDN requests in Network tab
- ✅ Worker loads from same origin
- ✅ Fallback works when CDN blocked
- ✅ Clear error messages
- ✅ Diagnostic downloads work

## Need Help?
1. Download diagnostic JSON
2. Check `attempts` array
3. Look for `worker_load_error` or `WORKER_LOAD_ERROR`
4. Check server logs if fallback attempted
5. Verify CSP headers

## Version
- Fixed in: v3.0.0
- Previous version: v2.0.0 (had CDN dependency)
- Breaking changes: None (automatic fallback)
