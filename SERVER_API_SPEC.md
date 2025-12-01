# Server-Side PDF Extraction API Specification

## Overview

This document describes the server-side API endpoint required for fallback PDF extraction when client-side processing fails (e.g., when the PDF.js worker cannot be loaded or when the PDF cannot be parsed in the browser).

## Endpoint

**POST** `/api/extract-images`

## Purpose

When client-side PDF extraction fails (worker loading errors, parsing errors, or browser limitations), the application automatically falls back to server-side extraction using robust tools like PyMuPDF, pikepdf, or pdf2image.

## Request Format

**Content-Type:** `multipart/form-data`

### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pdf` | File | Yes | The PDF file to process |
| `sessionId` | String | Yes | Unique session identifier from the client |

### Example Request (JavaScript)

```javascript
const formData = new FormData()
formData.append('pdf', file, file.name)
formData.append('sessionId', 'pdf_1234567890_abc123xyz')

const response = await fetch('/api/extract-images', {
  method: 'POST',
  body: formData,
})
```

## Response Format

**Content-Type:** `application/json`

### Success Response

```json
{
  "success": true,
  "images": [
    {
      "data": "data:image/png;base64,iVBORw0KG...",
      "format": "PNG",
      "width": 1920,
      "height": 1080,
      "pageNumber": 1
    },
    {
      "data": "data:image/jpeg;base64,/9j/4AAQ...",
      "format": "JPEG",
      "width": 800,
      "height": 600,
      "pageNumber": 2
    }
  ],
  "diagnostic": {
    "sessionId": "pdf_1234567890_abc123xyz",
    "originalFilename": "document.pdf",
    "fileSize": 2048576,
    "pageCount": 2,
    "extractedImageCount": 2,
    "attempts": [
      {
        "method": "pymupdf_extraction",
        "success": true,
        "timestamp": 1704067200000,
        "duration": 1234
      }
    ],
    "timestamp": 1704067200000,
    "duration": 1500
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Failed to parse PDF: Invalid PDF structure",
  "diagnostic": {
    "sessionId": "pdf_1234567890_abc123xyz",
    "originalFilename": "corrupt.pdf",
    "fileSize": 1024000,
    "pageCount": 0,
    "extractedImageCount": 0,
    "attempts": [
      {
        "method": "pymupdf_extraction",
        "success": false,
        "error": "Invalid PDF structure",
        "timestamp": 1704067200000,
        "duration": 500
      },
      {
        "method": "pikepdf_repair",
        "success": false,
        "error": "Repair failed: missing xref table",
        "timestamp": 1704067200500,
        "duration": 300
      }
    ],
    "timestamp": 1704067200000,
    "duration": 800,
    "errorCode": "PARSE_ERROR",
    "errorMessage": "Failed to parse PDF: Invalid PDF structure"
  }
}
```

## Image Data Format

Images should be returned as data URLs with base64-encoded image data:

- **PNG images:** `data:image/png;base64,{base64_data}`
- **JPEG images:** `data:image/jpeg;base64,{base64_data}`
- **GIF images:** `data:image/gif;base64,{base64_data}`

Alternatively, you can return just the base64 data (without the `data:` prefix), and the client will add it automatically.

## Recommended Server-Side Tools

### Python (Recommended)

1. **PyMuPDF (fitz)** - Best for embedded image extraction
   ```python
   import fitz  # PyMuPDF
   
   doc = fitz.open(pdf_path)
   for page_num in range(len(doc)):
       page = doc[page_num]
       image_list = page.get_images()
       for img in image_list:
           xref = img[0]
           base_image = doc.extract_image(xref)
           image_bytes = base_image["image"]
           # Convert to base64 and return
   ```

2. **pikepdf** - Best for PDF repair and structure fixes
   ```python
   import pikepdf
   
   pdf = pikepdf.open(pdf_path)
   # Repair and re-save if needed
   pdf.save(repaired_path)
   ```

3. **pdf2image** - Best for rasterizing pages
   ```python
   from pdf2image import convert_from_path
   
   images = convert_from_path(pdf_path, dpi=200)
   # Convert PIL images to base64
   ```

### Node.js (Alternative)

1. **pdf-lib** - For PDF manipulation
2. **pdfjs-dist** (server-side) - For extraction (though less reliable than Python tools)

## Error Handling

The server should handle these error cases:

| Error | HTTP Status | Response |
|-------|-------------|----------|
| File too large | 413 | `{"success": false, "error": "File exceeds maximum size"}` |
| Invalid PDF | 400 | `{"success": false, "error": "Invalid PDF format"}` |
| Encrypted PDF | 400 | `{"success": false, "error": "PDF is password protected"}` |
| No images found | 200 | `{"success": true, "images": []}` |
| Server error | 500 | `{"success": false, "error": "Internal server error"}` |

## Performance Considerations

1. **Timeout:** Set a reasonable timeout (e.g., 60 seconds) for processing
2. **Memory:** Limit PDF size (recommended: 200MB max)
3. **Concurrency:** Use worker pools for parallel processing
4. **Caching:** Consider caching results by file hash (MD5/SHA-256)

## Security Considerations

1. **File validation:** Always validate that uploaded files are actual PDFs
2. **Size limits:** Enforce strict file size limits
3. **Sandboxing:** Run PDF processing in isolated environments
4. **Rate limiting:** Implement rate limiting to prevent abuse
5. **Cleanup:** Delete uploaded files after processing

## Example Implementation (Python/Flask)

```python
from flask import Flask, request, jsonify
import fitz  # PyMuPDF
import base64
import time
import hashlib

app = Flask(__name__)

@app.route('/api/extract-images', methods=['POST'])
def extract_images():
    if 'pdf' not in request.files:
        return jsonify({'success': False, 'error': 'No PDF file provided'}), 400
    
    file = request.files['pdf']
    session_id = request.form.get('sessionId', '')
    
    start_time = time.time()
    diagnostic = {
        'sessionId': session_id,
        'originalFilename': file.filename,
        'fileSize': len(file.read()),
        'pageCount': 0,
        'extractedImageCount': 0,
        'attempts': [],
        'timestamp': int(start_time * 1000),
        'duration': 0
    }
    file.seek(0)
    
    try:
        # Save temporary file
        pdf_data = file.read()
        
        # Open with PyMuPDF
        attempt_start = time.time()
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        diagnostic['pageCount'] = len(doc)
        
        images = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            image_list = page.get_images()
            
            for img_index, img in enumerate(image_list):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                # Convert to base64
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                
                images.append({
                    'data': f'data:image/{image_ext};base64,{image_b64}',
                    'format': image_ext.upper(),
                    'width': base_image.get('width', 0),
                    'height': base_image.get('height', 0),
                    'pageNumber': page_num + 1
                })
        
        diagnostic['extractedImageCount'] = len(images)
        diagnostic['attempts'].append({
            'method': 'pymupdf_extraction',
            'success': True,
            'timestamp': int(attempt_start * 1000),
            'duration': int((time.time() - attempt_start) * 1000)
        })
        
        diagnostic['duration'] = int((time.time() - start_time) * 1000)
        
        return jsonify({
            'success': True,
            'images': images,
            'diagnostic': diagnostic
        })
        
    except Exception as e:
        diagnostic['attempts'].append({
            'method': 'pymupdf_extraction',
            'success': False,
            'error': str(e),
            'timestamp': int(time.time() * 1000),
            'duration': int((time.time() - start_time) * 1000)
        })
        diagnostic['duration'] = int((time.time() - start_time) * 1000)
        diagnostic['errorCode'] = 'EXTRACTION_FAILED'
        diagnostic['errorMessage'] = str(e)
        
        return jsonify({
            'success': False,
            'error': str(e),
            'diagnostic': diagnostic
        }), 500

if __name__ == '__main__':
    app.run(debug=True)
```

## Testing

Test the endpoint with:

```bash
curl -X POST http://localhost:5000/api/extract-images \
  -F "pdf=@test.pdf" \
  -F "sessionId=test_session_123"
```

## Client-Side Integration

The client automatically falls back to server extraction when:

1. PDF.js worker fails to load (CDN blocked, network issues)
2. PDF parsing fails in the browser
3. Browser memory limits are exceeded

The fallback is transparent to the user, with progress updates showing "Processing on server..."
