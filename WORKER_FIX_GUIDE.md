# PDF Worker Loading Fix & Server-Side Fallback

## Problem Summary

The application was experiencing `PDF_LOAD_FAILED` errors due to the PDF.js worker failing to load from an external CDN:

```
Setting up fake worker failed: "Failed to fetch dynamically imported module: 
https://cdnjs.cloudflare.com/.../pdf.worker.min.js"
```

This occurred when:
- CDN was blocked by firewall/corporate proxy
- Network connectivity issues
- CSP (Content Security Policy) restrictions
- Offline usage

## Solution Implemented

### 1. Local Worker Bundling

**Before:**
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
```

**After:**
```typescript
async function initializePDFWorker() {
  if (workerInitialized) return
  
  try {
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
    workerInitialized = true
  } catch (error) {
    workerError = error instanceof Error ? error : new Error('Failed to initialize PDF worker')
    console.error('PDF worker initialization failed:', error)
    throw workerError
  }
}
```

**Benefits:**
- ✅ No external CDN dependency
- ✅ Works offline
- ✅ Not affected by firewall/proxy blocking
- ✅ Faster loading (bundled with app)
- ✅ Version consistency guaranteed

### 2. Automatic Server-Side Fallback

When client-side extraction fails (worker errors, parsing errors), the application automatically falls back to server-side extraction:

```typescript
try {
  // Try client-side extraction with PDF.js
  pdf = await tryLoadPDFWithFallbacks(arrayBuffer, diagnostic)
} catch (loadError: any) {
  workerLoadFailed = loadError.message?.includes('worker') || 
                    loadError.message?.includes('Worker') ||
                    loadError.message?.includes('fetch')
  
  if (workerLoadFailed) {
    console.warn('Client-side PDF worker failed, falling back to server:', loadError)
    onProgress?.(30, 'Client worker failed, switching to server extraction...')
    
    try {
      const serverResult = await extractViaServer(file, diagnostic, onProgress)
      return serverResult
    } catch (serverError: any) {
      // Handle complete failure
    }
  }
}
```

### 3. Enhanced Error Handling

New error codes:
- `WORKER_LOAD_ERROR` - PDF.js worker failed to initialize
- `ALL_METHODS_FAILED` - Both client and server extraction failed
- `SERVER_EXTRACTION_FAILED` - Server-side processing failed

### 4. User Interface Improvements

**"Process on Server" Button:**
- Appears when worker loading fails
- Allows manual retry with server-side processing
- Provides alternative when client-side fails

**Enhanced Diagnostics:**
- Shows which extraction method was attempted
- Displays worker loading errors separately
- Provides specific recommendations based on failure type

## Architecture

```
┌─────────────────────────────────────────────────┐
│            User Uploads PDF                     │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│     Try Client-Side Extraction (PDF.js)         │
│  1. Initialize local worker                     │
│  2. Parse PDF in browser                        │
│  3. Extract images                              │
└────────────┬───────────────────────┬─────────────┘
             │                       │
        SUCCESS ✓               FAILURE ✗
             │                       │
             │                       ▼
             │      ┌────────────────────────────────┐
             │      │  Detect Failure Type           │
             │      │  - Worker load error?          │
             │      │  - Parse error?                │
             │      │  - Memory error?               │
             │      └───────────┬────────────────────┘
             │                  │
             │                  ▼
             │      ┌────────────────────────────────┐
             │      │  Auto Fallback to Server       │
             │      │  POST /api/extract-images      │
             │      │  - PyMuPDF extraction          │
             │      │  - pikepdf repair (if needed)  │
             │      │  - pdf2image rasterize         │
             │      └───────────┬────────────────────┘
             │                  │
             │             SUCCESS ✓
             │                  │
             ▼                  ▼
┌─────────────────────────────────────────────────┐
│         Display Extracted Images                │
│  - Image gallery                                │
│  - Download options                             │
│  - Diagnostic info                              │
└─────────────────────────────────────────────────┘
```

## Configuration

### Vite Configuration

The worker is automatically bundled by Vite using the import.meta.url resolution. No additional configuration needed.

### Content Security Policy (CSP)

If using CSP headers, ensure:

```http
Content-Security-Policy: 
  default-src 'self';
  script-src 'self';
  worker-src 'self' blob:;
  connect-src 'self';
```

Key points:
- `worker-src 'self'` - Allow workers from same origin
- `blob:` - Allow blob URLs if needed for dynamic worker creation

### Environment Variables

For server-side API (if applicable):

```env
API_BASE_URL=http://localhost:3000
MAX_FILE_SIZE=209715200  # 200MB
SERVER_TIMEOUT=60000      # 60 seconds
```

## Testing

### Test Worker Loading

```typescript
import * as pdfjsLib from 'pdfjs-dist'

async function testWorker() {
  try {
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href
    
    console.log('Worker URL:', workerUrl)
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
    
    // Try loading a simple PDF
    const pdf = await pdfjsLib.getDocument('/test.pdf').promise
    console.log('Worker initialized successfully, pages:', pdf.numPages)
  } catch (error) {
    console.error('Worker test failed:', error)
  }
}
```

### Test Server Fallback

```bash
# Block CDN in browser DevTools (Network tab)
# Or use browser extension to block cdnjs.cloudflare.com
# Upload a PDF and verify server fallback works
```

### Test Complete Flow

1. **Normal operation:** Upload PDF → Client extraction works
2. **Worker blocked:** Block worker URL → Auto fallback to server
3. **Server unavailable:** Mock 500 error → Show appropriate error message
4. **Manual server:** Click "Process on Server" button → Force server extraction

## Debugging

### Check Worker Loading

```javascript
console.log('Worker URL:', pdfjsLib.GlobalWorkerOptions.workerSrc)
```

### Monitor Network Requests

In browser DevTools Network tab, filter by:
- `pdf.worker` - Should load from same origin, not CDN
- `/api/extract-images` - Server fallback requests

### Diagnostic Download

Users can download diagnostic JSON with:
- All extraction attempts
- Error messages and stack traces
- Timing information
- File metadata

## Known Limitations

1. **Server Required:** Full fallback requires server-side API implementation
2. **File Size:** Large PDFs may timeout on server (configure timeout appropriately)
3. **Browser Support:** Web Workers required (supported in all modern browsers)
4. **Memory:** Very large PDFs may still fail in browser (server handles these)

## Future Improvements

1. **WebAssembly Worker:** Compile PyMuPDF to WASM for client-side processing
2. **Streaming Upload:** Stream large files to server in chunks
3. **Progressive Results:** Return images as they're extracted (SSE/WebSocket)
4. **Caching:** Cache extraction results by file hash
5. **Batch Processing:** Support multiple file uploads

## Server-Side API

See `SERVER_API_SPEC.md` for complete server-side implementation guide.

Required endpoint:
- **POST** `/api/extract-images`
- Accepts: `multipart/form-data` with `pdf` file and `sessionId`
- Returns: JSON with extracted images as base64 data URLs

## Migration Notes

If you're upgrading from the CDN-based worker:

1. **No breaking changes** - Automatic fallback handles failures
2. **No user action required** - Transparent to end users
3. **Monitor logs** - Check for worker load failures in production
4. **Deploy server API** - Implement `/api/extract-images` endpoint
5. **Test thoroughly** - Verify both client and server paths work

## Support

For issues related to:
- **Worker loading:** Check browser console for initialization errors
- **Server fallback:** Check network tab for API call status
- **Diagnostic info:** Download diagnostic JSON and check attempts array
- **Performance:** Monitor extraction duration in diagnostic data

## References

- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Vite Asset Handling](https://vitejs.dev/guide/assets.html)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [PyMuPDF Documentation](https://pymupdf.readthedocs.io/)
