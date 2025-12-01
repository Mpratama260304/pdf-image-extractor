# Deployment Checklist - Worker Fix & Server Fallback

## Pre-Deployment Verification

### ✅ Client-Side Checklist

- [ ] PDF.js worker loads from local bundle (not CDN)
- [ ] Worker URL resolves correctly in production build
- [ ] Client-side extraction works for normal PDFs
- [ ] Worker loading errors are caught and handled
- [ ] Fallback to server triggers automatically on worker failure
- [ ] Error messages display correctly for all error types
- [ ] "Process on Server" button appears for appropriate errors
- [ ] Diagnostic download works and includes all attempts

### ✅ Server-Side Checklist

- [ ] `/api/extract-images` endpoint is implemented
- [ ] Server accepts multipart/form-data with `pdf` and `sessionId`
- [ ] PyMuPDF (or equivalent) is installed and working
- [ ] Server returns proper JSON format (see SERVER_API_SPEC.md)
- [ ] Images are returned as base64 data URLs
- [ ] Diagnostic information is included in responses
- [ ] Error responses are properly formatted
- [ ] File size limits are enforced (200MB recommended)
- [ ] Temporary files are cleaned up after processing
- [ ] Rate limiting is configured to prevent abuse

### ✅ Build & Bundle Checklist

- [ ] Production build completes without errors
- [ ] Worker file is included in build output
- [ ] Asset paths resolve correctly with base URL
- [ ] No external CDN references remain in code
- [ ] Bundle size is acceptable (check for bloat)
- [ ] Source maps are generated for debugging

### ✅ CSP & Security Checklist

- [ ] Content-Security-Policy allows `worker-src 'self'`
- [ ] No external worker URLs in policy
- [ ] HTTPS is enforced in production
- [ ] File upload size limits are enforced
- [ ] File type validation is strict
- [ ] CORS is configured correctly for API endpoint

### ✅ Testing Checklist

#### Client-Side Tests
- [ ] Upload normal PDF → Extracts successfully with client
- [ ] Upload corrupted PDF → Shows appropriate error
- [ ] Upload encrypted PDF → Detects and shows error
- [ ] Upload large PDF → Handles memory constraints
- [ ] Block CDN (simulate) → Falls back to server automatically
- [ ] Disable worker in browser → Falls back to server
- [ ] Offline mode → Worker loads from bundle

#### Server-Side Tests
- [ ] POST valid PDF → Returns extracted images
- [ ] POST corrupted PDF → Returns error with diagnostic
- [ ] POST encrypted PDF → Returns appropriate error
- [ ] POST oversized file → Returns 413 error
- [ ] POST non-PDF file → Returns 400 error
- [ ] Concurrent requests → Server handles load

#### Integration Tests
- [ ] Client fails → Server succeeds → User sees images
- [ ] Client fails → Server fails → Shows combined error
- [ ] Click "Process on Server" → Manual server extraction works
- [ ] Download diagnostic → All attempts recorded correctly

#### Browser Tests
- [ ] Chrome/Edge (latest) → All features work
- [ ] Firefox (latest) → All features work
- [ ] Safari (latest) → All features work
- [ ] Mobile Chrome → Worker loads and processes
- [ ] Mobile Safari → Worker loads and processes

### ✅ Performance Checklist

- [ ] Worker initialization is < 500ms
- [ ] Small PDFs (< 5MB) process in < 3s
- [ ] Medium PDFs (5-50MB) process in < 10s
- [ ] Server fallback adds acceptable latency
- [ ] Progress indicators update smoothly
- [ ] UI remains responsive during processing
- [ ] Memory usage stays within browser limits

### ✅ User Experience Checklist

- [ ] Upload flow is intuitive
- [ ] Progress messages are clear and informative
- [ ] Error messages are helpful and actionable
- [ ] "Process on Server" button is discoverable
- [ ] Download diagnostic is easy to access
- [ ] Fallback happens transparently
- [ ] Toast notifications are informative
- [ ] Gallery displays images correctly

### ✅ Documentation Checklist

- [ ] README.md updated with deployment instructions
- [ ] SERVER_API_SPEC.md available for backend team
- [ ] WORKER_FIX_GUIDE.md explains the fix
- [ ] CHANGELOG.md documents version 3.0.0
- [ ] PRD.md reflects current features
- [ ] API documentation is complete

## Deployment Steps

### 1. Build Application

```bash
npm run build
```

Verify:
- `dist/` directory created
- Worker file present in assets
- No build errors or warnings

### 2. Deploy Frontend

#### Static Hosting (Netlify/Vercel/Cloudflare Pages)
```bash
# Deploy dist/ directory
netlify deploy --prod --dir=dist
# or
vercel --prod
```

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/pdf-extractor/dist;
    index index.html;
    
    # Worker needs correct MIME type
    location ~* \.mjs$ {
        add_header Content-Type application/javascript;
    }
    
    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy to backend API
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # CSP Header
    add_header Content-Security-Policy "default-src 'self'; worker-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;";
}
```

### 3. Deploy Backend

#### Python/Flask Example
```bash
# Install dependencies
pip install flask pymupdf pillow

# Run with gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

#### Docker Example
```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install flask pymupdf pillow gunicorn
COPY server.py .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "server:app"]
```

### 4. Configure Environment

```env
# Frontend (.env)
VITE_API_URL=https://api.your-domain.com

# Backend (.env)
MAX_FILE_SIZE=209715200
UPLOAD_FOLDER=/tmp/pdf-uploads
ALLOWED_ORIGINS=https://your-domain.com
```

### 5. Test Production

```bash
# Test worker loading
curl https://your-domain.com/assets/pdf.worker*.mjs

# Test API endpoint
curl -X POST https://api.your-domain.com/api/extract-images \
  -F "pdf=@test.pdf" \
  -F "sessionId=test_123"
```

## Monitoring & Maintenance

### Metrics to Track

- Worker initialization success rate
- Client extraction success rate
- Server fallback trigger rate
- Average processing time (client vs server)
- Error rates by error code
- API endpoint response times
- Memory usage patterns

### Logging

Client-side:
```javascript
// Track worker initialization
console.log('[PDF] Worker initialized:', workerUrl)

// Track fallback events
console.warn('[PDF] Falling back to server:', error)

// Track extraction attempts
diagnostic.attempts.forEach(attempt => {
  console.log(`[PDF] ${attempt.method}: ${attempt.success ? 'SUCCESS' : 'FAILED'}`)
})
```

Server-side:
```python
# Log extraction requests
logger.info(f"Extraction request: {filename} ({file_size} bytes)")

# Log processing time
logger.info(f"Extraction completed in {duration}ms: {image_count} images")

# Log errors
logger.error(f"Extraction failed: {error_code} - {error_message}")
```

### Alerts

Set up alerts for:
- Worker initialization failure rate > 5%
- Server fallback rate > 20%
- API error rate > 10%
- Average response time > 30s
- Memory usage > 80%

## Rollback Plan

If issues occur after deployment:

1. **Client Issues:**
   - Revert to previous version
   - Check worker URL configuration
   - Verify CSP headers

2. **Server Issues:**
   - Check API endpoint logs
   - Verify PyMuPDF installation
   - Check file permissions
   - Increase timeout if needed

3. **Both Failing:**
   - Show maintenance page
   - Display offline mode message
   - Provide contact information

## Post-Deployment

- [ ] Monitor error rates for 24 hours
- [ ] Check server logs for unexpected errors
- [ ] Verify analytics are tracking properly
- [ ] Test with real user PDFs
- [ ] Update status page if applicable
- [ ] Notify users of improvements
- [ ] Document any issues encountered

## Support

For deployment issues:
1. Check browser console for errors
2. Download and review diagnostic JSON
3. Check server logs for API errors
4. Verify worker file loads correctly
5. Test with curl commands
6. Review CSP headers

## Success Criteria

Deployment is successful when:
- ✅ 95%+ of PDFs extract successfully
- ✅ Worker loads reliably from bundle
- ✅ Server fallback works when needed
- ✅ Error messages are clear and helpful
- ✅ No external CDN dependencies
- ✅ All browsers supported
- ✅ Performance meets targets
