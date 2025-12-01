# Quick Reference - PDF Extraction Error Handling

## 🚀 What's New

This update adds **comprehensive error handling, diagnostics, and multiple fallback strategies** to the PDF image extraction application.

## 📁 Files Changed/Added

### New Files
- `src/components/ErrorView.tsx` - Error display component
- `EXTRACTION_FEATURES.md` - Feature documentation
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `DEVELOPER_GUIDE.md` - Developer reference
- `CHANGELOG.md` - Version history
- `QUICK_REFERENCE.md` - This file

### Modified Files
- `src/lib/pdf-extractor.ts` - Enhanced with diagnostics
- `src/App.tsx` - Added error handling
- `src/components/ProcessingView.tsx` - Added stage indicators
- `src/components/Hero.tsx` - Updated features
- `src/components/UploadZone.tsx` - Updated file limit
- `PRD.md` - Added error handling section

## 🎯 Key Features

### 1. Error Detection
✅ File size validation (200MB limit)  
✅ PDF header validation  
✅ MIME type checking  
✅ Encryption detection  
✅ Page count limits (1000 max)  
✅ Memory management  

### 2. Error Messages (Indonesian)
8 specific error types with friendly messages:
- `FILE_TOO_LARGE` - File terlalu besar
- `NOT_PDF` - Bukan file PDF
- `INVALID_PDF` - PDF tidak valid
- `PDF_ENCRYPTED` - PDF terenkripsi
- `PDF_LOAD_FAILED` - Gagal memuat PDF
- `TOO_MANY_PAGES` - Terlalu banyak halaman
- `NO_IMAGES` - Tidak ada gambar
- `UNKNOWN_ERROR` - Kesalahan tidak diketahui

### 3. Diagnostic System
Every extraction collects:
- Session ID
- File metadata
- All attempts
- Error details
- Processing time

### 4. User Experience
- Professional error screens
- Actionable recovery tips
- Downloadable diagnostics
- Clear navigation
- Progress indicators

## 💻 Code Examples

### Basic Usage
```typescript
import { extractImagesFromPDF, PDFExtractionError } from '@/lib/pdf-extractor'

try {
  const result = await extractImagesFromPDF(file, (progress, status) => {
    console.log(`${progress}% - ${status}`)
  })
  
  console.log(`Success: ${result.images.length} images`)
  
} catch (error) {
  if (error instanceof PDFExtractionError) {
    console.error(`Error ${error.code}:`, error.message)
    // Access diagnostic data
    console.log(error.diagnostic)
  }
}
```

### Error Handling
```typescript
catch (error) {
  if (error instanceof PDFExtractionError) {
    setError({
      code: error.code,
      message: error.message,
      diagnostic: error.diagnostic
    })
    showErrorView()
  }
}
```

### Download Diagnostic
```typescript
import { downloadDiagnostic } from '@/lib/pdf-extractor'

downloadDiagnostic(diagnostic)
// Downloads: diagnostic_pdf_1234567890_abc123.json
```

## 📊 Error Codes

| Code | Trigger | User Message |
|------|---------|--------------|
| `FILE_TOO_LARGE` | File > 200MB | File terlalu besar (XMB). Maksimal 200MB |
| `NOT_PDF` | Invalid type | Bukan PDF yang valid |
| `INVALID_PDF` | Bad header | File rusak atau bukan PDF yang valid |
| `PDF_ENCRYPTED` | Password | PDF terenkripsi, silakan buka file dengan sandi |
| `PDF_LOAD_FAILED` | Parse error | Gagal memuat PDF, file mungkin rusak |
| `TOO_MANY_PAGES` | Pages > 1000 | PDF terlalu banyak halaman (X). Maksimal 1000 |
| `NO_IMAGES` | 0 extracted | Tidak ada gambar yang dapat diekstrak |
| `UNKNOWN_ERROR` | Other | Terjadi kesalahan tidak terduga |

## 🎨 UI Components

### ErrorView Props
```typescript
interface ErrorViewProps {
  errorCode: string         // Error code
  errorMessage: string      // User message
  diagnostic?: DiagnosticInfo // Diagnostic data
  onRetry: () => void      // Retry callback
  onBack: () => void       // Back callback
}
```

### Usage
```tsx
<ErrorView
  errorCode={error.code}
  errorMessage={error.message}
  diagnostic={error.diagnostic}
  onRetry={() => setView('upload')}
  onBack={() => setView('hero')}
/>
```

## 🔍 Diagnostic Structure

```typescript
{
  sessionId: "pdf_1234567890_abc123",
  originalFilename: "document.pdf",
  fileSize: 5242880,
  pageCount: 25,
  extractedImageCount: 0,
  timestamp: 1234567890000,
  duration: 2500,
  attempts: [
    {
      method: "header_validation",
      success: true
    },
    {
      method: "embedded_extraction",
      success: false,
      error: "No images found",
      imageCount: 0
    }
  ],
  errorCode: "NO_IMAGES",
  errorMessage: "Tidak ada gambar..."
}
```

## 🧪 Testing

### Test Scenarios
1. ✅ Normal PDF with images
2. ✅ Scanned PDF (no embedded images)
3. ✅ Encrypted PDF
4. ✅ Oversized file (>200MB)
5. ✅ Corrupted PDF
6. ✅ Non-PDF file
7. ✅ Text-only PDF
8. ✅ Large page count (>1000)

### Manual Test
```bash
# Create test files
dd if=/dev/zero of=large.pdf bs=1M count=250  # Too large
echo "fake" > fake.pdf                        # Not PDF
```

## 📚 Documentation

| File | Purpose |
|------|---------|
| `EXTRACTION_FEATURES.md` | Feature overview & API |
| `IMPLEMENTATION_SUMMARY.md` | Implementation details |
| `DEVELOPER_GUIDE.md` | Developer reference |
| `CHANGELOG.md` | Version history |
| `QUICK_REFERENCE.md` | This guide |

## ⚡ Performance

- **Validation:** < 100ms
- **PDF Load:** 500ms - 2s
- **Extraction:** 100-500ms/page
- **Rasterization:** 200-800ms/page
- **Memory Limit:** 50MB per image

## 🔐 Security

- ✅ Client-side only
- ✅ No server uploads
- ✅ No PII collection
- ✅ Safe validation
- ✅ Memory limits

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🎯 Key Improvements

### Before
- ❌ Generic error messages
- ❌ No diagnostic data
- ❌ No recovery guidance
- ❌ Limited validation
- ❌ No fallback strategies

### After
- ✅ Specific error codes
- ✅ Comprehensive diagnostics
- ✅ Actionable tips
- ✅ Multi-layer validation
- ✅ Multiple extraction strategies
- ✅ Memory management
- ✅ Professional UI
- ✅ Indonesian messages

## 🚨 Common Issues

### Issue: Worker script fails
**Solution:** Check network, CDN may be blocked

### Issue: Out of memory
**Solution:** Already handled - auto quality adjustment

### Issue: Progress stuck
**Solution:** Normal for complex pages

### Issue: Download blocked
**Solution:** User must allow downloads in browser

## 🛠 Development

### Run locally
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Type check
```bash
npx tsc --noEmit
```

## 📞 Support

When users report errors:
1. Ask for diagnostic JSON download
2. Check `errorCode` and `attempts`
3. Review `fileSize` and `pageCount`
4. Examine attempt errors
5. Check `duration` for performance

## 🔄 Update Workflow

```typescript
// 1. User uploads file
const file = event.target.files[0]

// 2. Start processing
setView('processing')
const result = await extractImagesFromPDF(file, onProgress)

// 3a. Success
setView('results')
showImages(result.images)

// 3b. Error
catch (error) {
  setView('error')
  showError(error.code, error.message, error.diagnostic)
}

// 4. User can:
// - Download diagnostic
// - Retry with new file
// - Go back to home
```

## 🎓 Learn More

- See `EXTRACTION_FEATURES.md` for full feature list
- See `DEVELOPER_GUIDE.md` for code examples
- See `IMPLEMENTATION_SUMMARY.md` for technical details
- See `CHANGELOG.md` for version history

---

**Quick Links:**
- [Features](./EXTRACTION_FEATURES.md)
- [Developer Guide](./DEVELOPER_GUIDE.md)
- [Implementation](./IMPLEMENTATION_SUMMARY.md)
- [Changelog](./CHANGELOG.md)
