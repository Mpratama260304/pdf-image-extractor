# Developer Guide - PDF Extraction Error Handling

## Quick Start

### Using the Enhanced Extractor

```typescript
import { extractImagesFromPDF, PDFExtractionError } from '@/lib/pdf-extractor'

try {
  const result = await extractImagesFromPDF(file, (progress, status) => {
    console.log(`${progress}% - ${status}`)
  })
  
  console.log(`Extracted ${result.images.length} images`)
  console.log('Diagnostic:', result.diagnostic)
  
} catch (error) {
  if (error instanceof PDFExtractionError) {
    console.error(`Error ${error.code}:`, error.message)
    console.error('Diagnostic:', error.diagnostic)
    
    // Download diagnostic for debugging
    downloadDiagnostic(error.diagnostic)
  }
}
```

### Error Handling Pattern

```typescript
try {
  const result = await extractImagesFromPDF(file, onProgress)
  // Success - handle result
  
} catch (error) {
  if (error instanceof PDFExtractionError) {
    // Structured error with diagnostic
    setError({
      code: error.code,
      message: error.message,
      diagnostic: error.diagnostic
    })
    
  } else {
    // Unexpected error
    setError({
      code: 'UNKNOWN_ERROR',
      message: String(error),
      diagnostic: undefined
    })
  }
}
```

## Error Codes Reference

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| `FILE_TOO_LARGE` | File exceeds 200MB limit | User uploaded very large PDF |
| `NOT_PDF` | File is not a PDF | Wrong file type selected |
| `INVALID_PDF` | PDF structure invalid | Corrupted or malformed PDF |
| `PDF_ENCRYPTED` | Password protected | Encrypted PDF uploaded |
| `PDF_LOAD_FAILED` | Cannot load PDF | Parsing error, unsupported format |
| `TOO_MANY_PAGES` | Over 1000 pages | Extremely large document |
| `NO_IMAGES` | No extractable images | Text-only PDF or failed extraction |
| `UNKNOWN_ERROR` | Unexpected error | Uncaught exception |

## Diagnostic Structure

```typescript
interface DiagnosticInfo {
  sessionId: string              // Unique ID: "pdf_1234567890_abc123"
  originalFilename: string       // "document.pdf"
  fileSize: number              // Bytes: 5242880
  pageCount: number             // Pages: 25
  extractedImageCount: number   // Images extracted: 0
  attempts: DiagnosticAttempt[] // Array of all attempts
  timestamp: number             // Unix timestamp
  duration: number              // Processing time in ms
  errorCode?: string            // Error code if failed
  errorMessage?: string         // Error message if failed
}

interface DiagnosticAttempt {
  method: string       // "header_validation", "embedded_extraction", etc.
  success: boolean     // true/false
  error?: string       // Error message if failed
  imageCount?: number  // Images found (if applicable)
  details?: any        // Additional method-specific data
}
```

## Adding Custom Error Types

To add a new error type:

1. **Define error code constant:**
```typescript
const ERROR_CUSTOM = 'CUSTOM_ERROR'
```

2. **Add validation/detection logic:**
```typescript
if (someCondition) {
  diagnostic.errorCode = ERROR_CUSTOM
  diagnostic.errorMessage = 'Detailed technical message'
  throw new PDFExtractionError(
    'User-friendly message in Indonesian',
    ERROR_CUSTOM,
    diagnostic
  )
}
```

3. **Add error message to ErrorView:**
```typescript
// In src/components/ErrorView.tsx
const errorMessages = {
  // ... existing errors
  CUSTOM_ERROR: {
    title: 'Custom Error Title',
    description: 'What this error means',
    tips: [
      'Recovery tip 1',
      'Recovery tip 2',
      'Recovery tip 3'
    ]
  }
}
```

## Logging & Debugging

### Console Logging

The extractor logs to console automatically:
```typescript
console.error('PDF extraction error:', error)
console.error('Extraction error:', error)
```

### Diagnostic Download

```typescript
import { downloadDiagnostic } from '@/lib/pdf-extractor'

// Download as JSON file
downloadDiagnostic(diagnostic)
downloadDiagnostic(diagnostic, 'custom-filename.json')
```

### Format as Text

```typescript
import { formatDiagnosticMessage } from '@/lib/pdf-extractor'

const text = formatDiagnosticMessage(diagnostic)
console.log(text)
// Output:
// Session: pdf_1234567890_abc123
// File: document.pdf (5.00MB)
// Pages: 25
// Duration: 2.50s
//
// Extraction Attempts:
// 1. header_validation: ✓
// 2. pdf_load: ✓
// 3. embedded_extraction: ✗
//    Error: No embedded images found
// ...
```

## Memory Management

### Automatic Quality Adjustment

The extractor automatically reduces quality for large pages:

```typescript
const MAX_MEMORY_PER_IMAGE = 50 * 1024 * 1024 // 50MB

if (estimatedMemory > MAX_MEMORY_PER_IMAGE) {
  // Reduces scale
  // Switches to JPEG
  // Applies compression
}
```

### Manual Quality Control

For custom implementations:

```typescript
// High quality (PNG, scale 3)
const viewport = page.getViewport({ scale: 3 })
const dataUrl = canvas.toDataURL('image/png')

// Medium quality (JPEG 90%)
const viewport = page.getViewport({ scale: 2 })
const dataUrl = canvas.toDataURL('image/jpeg', 0.9)

// Low quality (JPEG 70%)
const viewport = page.getViewport({ scale: 1.5 })
const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
```

## Testing Error Scenarios

### Create Test Files

```bash
# Create oversized dummy PDF (will fail FILE_TOO_LARGE)
dd if=/dev/zero of=large.pdf bs=1M count=250

# Create non-PDF file (will fail NOT_PDF)
echo "not a pdf" > fake.pdf

# Create invalid PDF header (will fail INVALID_PDF)
echo "%PDF-1.4corrupted..." > broken.pdf
```

### Test in Browser DevTools

```javascript
// Simulate file upload in console
const file = new File(['%PDF-corrupted'], 'test.pdf', {
  type: 'application/pdf'
})

extractImagesFromPDF(file).catch(err => {
  console.log('Error code:', err.code)
  console.log('Diagnostic:', err.diagnostic)
})
```

## Component Integration

### Using ErrorView

```typescript
import { ErrorView } from '@/components/ErrorView'

function MyComponent() {
  const [error, setError] = useState<{
    code: string
    message: string
    diagnostic?: DiagnosticInfo
  } | null>(null)
  
  if (error) {
    return (
      <ErrorView
        errorCode={error.code}
        errorMessage={error.message}
        diagnostic={error.diagnostic}
        onRetry={() => setError(null)}
        onBack={() => navigate('/')}
      />
    )
  }
  
  // ... normal render
}
```

## Best Practices

### ✅ Do

- Always wrap `extractImagesFromPDF` in try-catch
- Check for `PDFExtractionError` specifically
- Provide progress callbacks for UX
- Log diagnostics for debugging
- Offer diagnostic download to users
- Show actionable error messages
- Clear state on retry

### ❌ Don't

- Ignore diagnostic data
- Show raw error messages to users
- Swallow errors silently
- Skip validation steps
- Assume errors won't happen
- Block UI during processing
- Leave resources uncleaned

## Performance Tips

1. **Use progress callbacks:**
```typescript
const onProgress = (progress: number, status: string) => {
  setProgress(progress)
  setStatus(status)
}
```

2. **Debounce file selection:**
```typescript
const handleFile = useMemo(
  () => debounce(processFile, 300),
  []
)
```

3. **Clean up on unmount:**
```typescript
useEffect(() => {
  return () => {
    // Cancel ongoing operations
    abortController.abort()
  }
}, [])
```

4. **Monitor memory:**
```typescript
if (performance.memory) {
  console.log('Heap used:', 
    performance.memory.usedJSHeapSize / 1024 / 1024, 'MB'
  )
}
```

## Troubleshooting

### "Worker script failed to load"

**Cause:** CDN blocked or offline  
**Solution:** Check network, verify CDN URL in pdf-extractor.ts

### "Out of memory" errors

**Cause:** Processing very large PDFs  
**Solution:** Already handled - system auto-adjusts quality

### Progress stuck at certain percentage

**Cause:** Long-running page render  
**Solution:** Expected behavior for complex pages

### Diagnostic download not working

**Cause:** Browser popup blocker  
**Solution:** User must allow downloads

## Example: Custom Extraction Strategy

```typescript
async function customExtractor(file: File) {
  const diagnostic: DiagnosticInfo = {
    sessionId: generateSessionId(),
    originalFilename: file.name,
    fileSize: file.size,
    pageCount: 0,
    extractedImageCount: 0,
    attempts: [],
    timestamp: Date.now(),
    duration: 0
  }
  
  try {
    // Custom validation
    if (file.size < 1024) {
      diagnostic.attempts.push({
        method: 'custom_size_check',
        success: false,
        error: 'File too small'
      })
      throw new PDFExtractionError(
        'File too small to be valid PDF',
        'FILE_TOO_SMALL',
        diagnostic
      )
    }
    
    diagnostic.attempts.push({
      method: 'custom_size_check',
      success: true
    })
    
    // Continue with standard extraction
    return await extractImagesFromPDF(file)
    
  } catch (error) {
    diagnostic.duration = Date.now() - diagnostic.timestamp
    throw error
  }
}
```

## Support & Debugging

When users report issues:

1. Ask for diagnostic JSON
2. Check `errorCode` and `attempts` array
3. Verify `fileSize` and `pageCount`
4. Review `duration` for performance issues
5. Check `timestamp` for timeline
6. Examine attempt errors for root cause

## API Reference

### Functions

```typescript
// Main extraction function
extractImagesFromPDF(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<ExtractionResult>

// Download diagnostic
downloadDiagnostic(
  diagnostic: DiagnosticInfo,
  filename?: string
): void

// Format diagnostic
formatDiagnosticMessage(
  diagnostic: DiagnosticInfo
): string

// Convert data URL to blob
dataUrlToBlob(dataUrl: string): Blob
```

### Types

All types exported from `@/lib/pdf-extractor`:
- `ExtractedImage`
- `ExtractionResult`
- `DiagnosticInfo`
- `DiagnosticAttempt`
- `PDFExtractionError`

## Future Enhancements Checklist

- [ ] Add retry logic with exponential backoff
- [ ] Implement extraction cancellation
- [ ] Add bandwidth throttling detection
- [ ] Support password-protected PDFs
- [ ] Add OCR fallback for text-in-images
- [ ] Implement batch processing queue
- [ ] Add telemetry/analytics hooks
- [ ] Create unit tests for error paths
- [ ] Add E2E tests with Playwright
- [ ] Implement session persistence (useKV)
