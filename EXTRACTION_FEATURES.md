# PDF Extraction Features - Comprehensive Error Handling & Diagnostics

This document describes the robust PDF extraction features implemented in the application, including comprehensive error handling, diagnostics, and fallback strategies.

## Features Overview

### 1. Multi-Strategy Extraction

The extraction engine uses multiple strategies to maximize success rate:

1. **Embedded Image Extraction** - Attempts to extract images directly embedded in the PDF
2. **Page Rasterization Fallback** - If no embedded images found, rasterizes entire pages as high-quality images
3. **Memory-Aware Processing** - Automatically adjusts quality and resolution based on available memory

### 2. Comprehensive Validation

Before processing, the system validates:

- **File Size Limits** - Maximum 200MB to prevent browser crashes
- **PDF Header Validation** - Checks for valid PDF magic bytes (`%PDF-`)
- **MIME Type Check** - Verifies file is actually a PDF
- **Page Count Limits** - Maximum 1000 pages
- **Encryption Detection** - Detects password-protected PDFs early

### 3. Error Handling with Diagnostics

Every extraction attempt collects detailed diagnostic information:

```typescript
interface DiagnosticInfo {
  sessionId: string              // Unique session identifier
  originalFilename: string       // Original file name
  fileSize: number              // File size in bytes
  pageCount: number             // Number of pages in PDF
  extractedImageCount: number   // Successfully extracted images
  attempts: DiagnosticAttempt[] // All extraction attempts
  timestamp: number             // Start timestamp
  duration: number              // Total processing time
  errorCode?: string            // Error code if failed
  errorMessage?: string         // Error message if failed
}
```

### 4. Friendly Error Messages (Indonesian)

Users receive actionable error messages in Indonesian with specific recovery tips:

| Error Code | User Message | Tips Provided |
|------------|-------------|---------------|
| `FILE_TOO_LARGE` | File terlalu besar | Compress PDF, split into smaller files |
| `NOT_PDF` | Bukan file PDF | Check file extension, re-export as PDF |
| `INVALID_PDF` | PDF tidak valid | Repair with Adobe Reader, re-export |
| `PDF_ENCRYPTED` | PDF terenkripsi | Remove password, request unencrypted version |
| `PDF_LOAD_FAILED` | Gagal memuat PDF | Save as PDF 1.4, use Ghostscript |
| `TOO_MANY_PAGES` | Terlalu banyak halaman | Split PDF into sections |
| `NO_IMAGES` | Tidak ada gambar | PDF may only contain text |
| `UNKNOWN_ERROR` | Kesalahan tidak diketahui | Refresh, check browser, download diagnostic |

### 5. Diagnostic Download

Users can download a JSON diagnostic report containing:

- Session ID for support reference
- File metadata (name, size, page count)
- All extraction attempts and their results
- Error traces and failure reasons
- Processing duration

Example diagnostic JSON:

```json
{
  "sessionId": "pdf_1234567890_abc123",
  "originalFilename": "document.pdf",
  "fileSize": 5242880,
  "pageCount": 25,
  "extractedImageCount": 0,
  "timestamp": 1234567890000,
  "duration": 2500,
  "attempts": [
    {
      "method": "header_validation",
      "success": true
    },
    {
      "method": "pdf_load",
      "success": true,
      "details": { "pages": 25 }
    },
    {
      "method": "embedded_extraction",
      "success": false,
      "error": "No embedded images found",
      "imageCount": 0
    },
    {
      "method": "rasterization",
      "success": false,
      "error": "Memory limit exceeded"
    }
  ],
  "errorCode": "NO_IMAGES",
  "errorMessage": "Tidak ada gambar yang dapat diekstrak dari PDF ini."
}
```

### 6. Memory-Aware Processing

To prevent browser crashes:

- **Per-Image Memory Limit** - 50MB max per image
- **Dynamic Resolution Adjustment** - Reduces DPI if image would be too large
- **JPEG Fallback** - Uses JPEG with compression for large pages
- **Canvas Cleanup** - Properly releases canvas memory after each page

### 7. Error View UI

Dedicated error screen includes:

- ✅ Error title and description in Indonesian
- ✅ Error code badge for reference
- ✅ File information summary
- ✅ List of all extraction attempts with success/failure indicators
- ✅ Specific recovery tips relevant to the error
- ✅ Download diagnostic button
- ✅ Retry and back to home options

## API Changes

### extractImagesFromPDF Function

```typescript
extractImagesFromPDF(
  file: File,
  onProgress?: (progress: number, status: string) => void
): Promise<ExtractionResult>
```

**Returns:**
```typescript
interface ExtractionResult {
  images: ExtractedImage[]
  totalPages: number
  pdfName: string
  diagnostic?: DiagnosticInfo  // Always included now
}
```

**Throws:**
```typescript
class PDFExtractionError extends Error {
  code: string           // Error code (e.g., 'FILE_TOO_LARGE')
  diagnostic: DiagnosticInfo  // Diagnostic data
}
```

### New Utility Functions

```typescript
// Download diagnostic as JSON file
downloadDiagnostic(diagnostic: DiagnosticInfo, filename?: string): void

// Format diagnostic as human-readable text
formatDiagnosticMessage(diagnostic: DiagnosticInfo): string
```

## Testing Scenarios

### Test Case 1: Normal PDF with Embedded Images
**Expected:** Direct extraction succeeds, images displayed

### Test Case 2: Scanned PDF (No Embedded Images)
**Expected:** Fallback to rasterization, all pages converted to images

### Test Case 3: Encrypted/Password-Protected PDF
**Expected:** Early detection, error message with password removal instructions

### Test Case 4: Oversized File (>200MB)
**Expected:** Immediate rejection with file size message

### Test Case 5: Corrupted PDF (Invalid Header)
**Expected:** Header validation fails, repair suggestions provided

### Test Case 6: Non-PDF File
**Expected:** MIME type/extension check fails, clear error message

### Test Case 7: PDF with 1000+ Pages
**Expected:** Page limit enforced, suggestion to split file

### Test Case 8: Empty/Text-Only PDF
**Expected:** Both strategies return 0 images, NO_IMAGES error with explanation

## Implementation Notes

### Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### Performance Considerations

- Progress updates every page for responsive UI
- Canvas operations use `willReadFrequently: false` for better performance
- Worker-based PDF.js processing to avoid blocking main thread
- Automatic quality/resolution adjustment for memory management

### Limitations (Client-Side Only)

Unlike backend solutions, this client-side implementation cannot:

- Run Ghostscript or pikepdf repair tools
- Use pdf2image with Poppler
- Access system-level PDF repair utilities

However, it provides:

- ✅ Complete privacy (no server uploads)
- ✅ Instant processing (no network latency)
- ✅ No server costs
- ✅ Works offline after initial load

### Future Enhancements

Potential improvements:

1. **Web Worker Integration** - Move extraction to dedicated worker thread
2. **OCR Fallback** - Use Tesseract.js for text-in-image PDFs
3. **PDF Repair** - Client-side PDF repair using WASM-compiled libraries
4. **Batch Processing** - Queue multiple PDFs for processing
5. **Cloud Backup** - Optional upload of diagnostics to error reporting service
6. **Password Support** - Accept user password for encrypted PDFs

## User Experience

### Success Flow
1. User uploads PDF → 
2. Validation passes → 
3. Extraction attempts → 
4. Images displayed → 
5. Download options available

### Error Flow
1. User uploads PDF → 
2. Validation or extraction fails → 
3. Error screen appears with:
   - Clear error explanation
   - File details
   - Extraction attempts log
   - Actionable recovery tips
   - Diagnostic download option
4. User can retry with different file or download diagnostic for support

### Error Screen Benefits

- **Educational** - Users learn what went wrong and why
- **Actionable** - Specific steps to resolve the issue
- **Transparent** - Full visibility into what the system tried
- **Supportable** - Diagnostic JSON enables effective support
- **Professional** - Polished error UX builds trust
