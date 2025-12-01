# Architecture - PDF Extraction with Error Handling

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS PDF                         │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │  App.tsx       │
                    │  handleFile()  │
                    └────────┬───────┘
                             ↓
┌────────────────────────────────────────────────────────────────┐
│                   pdf-extractor.ts                              │
│               extractImagesFromPDF()                            │
└────────────────────────────┬───────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────────┐
│                      VALIDATION LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ File Size    │  │ PDF Header   │  │ MIME Type    │        │
│  │ < 200MB      │  │ %PDF-        │  │ Check        │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                  │                 │
│         └──────────────────┴──────────────────┘                │
│                             ↓                                   │
│                    ┌────────────────┐                          │
│                    │   All Valid?    │                          │
│                    └────┬───────┬────┘                          │
│                         │       │                               │
│                    YES  │       │  NO                           │
└─────────────────────────┼───────┼───────────────────────────────┘
                          ↓       ↓
                    Continue    Throw PDFExtractionError
                                      ↓
                                ┌──────────────┐
                                │  ErrorView   │
                                │  Display     │
                                └──────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    PDF LOADING & CHECKS                         │
│                                                                  │
│  ┌─────────────────┐      ┌──────────────────┐                │
│  │ Load with       │  →   │ Check Encryption │                │
│  │ pdf.js          │      │ Detection        │                │
│  └────────┬────────┘      └────────┬─────────┘                │
│           │                         │                           │
│      Success                   Encrypted?                       │
│           │                         │                           │
│           ↓                    YES  ↓  NO                       │
│    ┌────────────┐          ┌──────────────┐                   │
│    │ Get Pages  │          │    Error:    │                   │
│    │ Count      │          │ PDF_ENCRYPTED│                   │
│    └─────┬──────┘          └──────────────┘                   │
│          │                                                      │
│    Pages > 1000?                                               │
│          │                                                      │
│     NO   ↓   YES                                               │
│    Continue  → Error: TOO_MANY_PAGES                          │
└──────────┼──────────────────────────────────────────────────────┘
           ↓

┌────────────────────────────────────────────────────────────────┐
│              EXTRACTION STRATEGY 1: EMBEDDED                    │
│                                                                  │
│  ┌─────────────────────────────────────────────┐              │
│  │  For each page:                              │              │
│  │    1. Get operator list                      │              │
│  │    2. Check for image operations             │              │
│  │    3. If has images → render page            │              │
│  │    4. Convert to PNG/JPEG                    │              │
│  │    5. Add to results                         │              │
│  └──────────────────────┬──────────────────────┘              │
│                         │                                       │
│                    Found images?                                │
│                         │                                       │
│                    YES  ↓  NO                                   │
│                  ┌────────────┐                                │
│                  │  SUCCESS   │                                │
│                  │  Return    │                                │
│                  └────────────┘                                │
└─────────────────────────┼─────────────────────────────────────┘
                          ↓

┌────────────────────────────────────────────────────────────────┐
│            EXTRACTION STRATEGY 2: RASTERIZATION                 │
│                                                                  │
│  ┌─────────────────────────────────────────────┐              │
│  │  For each page (max 500):                    │              │
│  │    1. Calculate memory requirements          │              │
│  │    2. Adjust scale if needed                 │              │
│  │    3. Render page at DPI (200)              │              │
│  │    4. Use JPEG if large                      │              │
│  │    5. Add to results                         │              │
│  └──────────────────────┬──────────────────────┘              │
│                         │                                       │
│                    Found images?                                │
│                         │                                       │
│                    YES  ↓  NO                                   │
│                  ┌────────────┐    ┌──────────────┐           │
│                  │  SUCCESS   │    │    Error:    │           │
│                  │  Return    │    │  NO_IMAGES   │           │
│                  └────────────┘    └──────────────┘           │
└─────────────────────────┼─────────────────────────────────────┘
                          ↓

┌────────────────────────────────────────────────────────────────┐
│                        RESULT HANDLING                          │
│                                                                  │
│         SUCCESS                           ERROR                 │
│            ↓                                 ↓                  │
│  ┌──────────────────┐          ┌──────────────────┐           │
│  │ ExtractionResult │          │ PDFExtractionError│           │
│  │   - images[]     │          │   - code          │           │
│  │   - totalPages   │          │   - message       │           │
│  │   - pdfName      │          │   - diagnostic    │           │
│  │   - diagnostic   │          └─────────┬─────────┘           │
│  └────────┬─────────┘                    ↓                     │
│           ↓                    ┌──────────────────┐            │
│  ┌──────────────────┐          │   ErrorView      │            │
│  │  ImageGallery    │          │   - Show error   │            │
│  │  - Display       │          │   - Show tips    │            │
│  │  - Download      │          │   - Download     │            │
│  │  - ZIP           │          │     diagnostic   │            │
│  └──────────────────┘          └──────────────────┘            │
└────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            App.tsx                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  State Management                                         │  │
│  │  - view: ViewState                                        │  │
│  │  - extractionResult: ExtractionResult                     │  │
│  │  - errorInfo: ErrorInfo                                   │  │
│  │  - progress: number                                       │  │
│  │  - status: string                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│       ┌────────────────────┼────────────────────┐              │
│       ↓                    ↓                    ↓               │
│  ┌─────────┐        ┌──────────┐        ┌──────────┐          │
│  │  Hero   │        │  Upload  │        │Processing│          │
│  └─────────┘        └──────────┘        └──────────┘          │
│       │                    │                    │               │
│       ↓                    ↓                    ↓               │
│  view='hero'        view='upload'        view='processing'     │
│                                                                  │
│       ┌────────────────────┼────────────────────┐              │
│       ↓                    ↓                                    │
│  ┌──────────┐        ┌──────────┐                             │
│  │ Results  │        │  Error   │                             │
│  └──────────┘        └──────────┘                             │
│       │                    │                                    │
│       ↓                    ↓                                    │
│  view='results'      view='error'                             │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────┐
│   User      │
│   Action    │
└──────┬──────┘
       │
       ↓
┌──────────────────────────────────────────┐
│        Event Handlers                     │
│  - handleFileSelect()                     │
│  - handleStartOver()                      │
│  - handleBackToHero()                     │
│  - handleRetryAfterError()               │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│     State Updates                         │
│  - setView()                              │
│  - setProgress()                          │
│  - setStatus()                            │
│  - setExtractionResult()                  │
│  - setErrorInfo()                         │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│     Component Render                      │
│  - AnimatePresence                        │
│  - Conditional rendering                  │
│  - Motion transitions                     │
└──────┬───────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────┐
│     User Interaction                      │
│  - View content                           │
│  - Download images                        │
│  - Download diagnostic                    │
│  - Navigate                               │
└───────────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    extractImagesFromPDF()                        │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │ Create Session │
                    │ & Diagnostic   │
                    └────────┬───────┘
                             ↓
┌────────────────────────────────────────────────────────────────┐
│                        Try Block                                │
│                                                                  │
│  Validate → Load → Check → Extract → Rasterize                │
│     ↓         ↓      ↓       ↓          ↓                      │
│   Pass     Pass   Pass    Pass       Pass                      │
│     │         │      │       │          │                      │
│  [Record] [Record] [Record] [Record] [Record]                 │
│     ↓         ↓      ↓       ↓          ↓                      │
│  Continue  Continue Continue Continue  Success!                │
│                                                                  │
│  Any step fails?                                                │
│     ↓                                                           │
│  [Record failure in diagnostic.attempts[]]                     │
│     ↓                                                           │
│  throw PDFExtractionError(message, code, diagnostic)          │
└────────────────────────────┬───────────────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │  Catch Block   │
                    └────────┬───────┘
                             ↓
                  Is PDFExtractionError?
                             │
                        YES  │  NO
                             ↓
                    ┌────────────────┐
                    │  Re-throw      │
                    │  existing      │
                    └────────┬───────┘
                             ↓
┌────────────────────────────────────────────────────────────────┐
│                      App.tsx Catch                              │
│                                                                  │
│  if (error instanceof PDFExtractionError) {                    │
│    setErrorInfo({                                               │
│      code: error.code,                                          │
│      message: error.message,                                    │
│      diagnostic: error.diagnostic                               │
│    })                                                           │
│    setView('error')                                             │
│  }                                                              │
└────────────────────────────┬───────────────────────────────────┘
                             ↓
┌────────────────────────────────────────────────────────────────┐
│                         ErrorView                               │
│                                                                  │
│  Display:                                                       │
│  - Error title & description (from errorMessages map)          │
│  - Error code badge                                             │
│  - File information (from diagnostic)                           │
│  - Extraction attempts timeline                                 │
│  - Recovery tips                                                │
│  - Download diagnostic button                                   │
│  - Retry / Back buttons                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Diagnostic Collection

```
┌──────────────────────────────────────────────────────────────┐
│              Diagnostic Data Structure                        │
│                                                                │
│  Created at start:                                            │
│  ┌────────────────────────────────────────────┐             │
│  │ sessionId: generateSessionId()              │             │
│  │ originalFilename: file.name                 │             │
│  │ fileSize: file.size                         │             │
│  │ timestamp: Date.now()                       │             │
│  │ attempts: []                                │             │
│  └────────────────────────────────────────────┘             │
│                                                                │
│  Updated during extraction:                                   │
│  ┌────────────────────────────────────────────┐             │
│  │ pageCount: pdf.numPages                     │             │
│  │ attempts.push({                             │             │
│  │   method: "validation/extraction/etc",      │             │
│  │   success: true/false,                      │             │
│  │   error: "...",                             │             │
│  │   imageCount: 0                             │             │
│  │ })                                          │             │
│  └────────────────────────────────────────────┘             │
│                                                                │
│  On success:                                                  │
│  ┌────────────────────────────────────────────┐             │
│  │ extractedImageCount: images.length          │             │
│  │ duration: Date.now() - timestamp            │             │
│  └────────────────────────────────────────────┘             │
│                                                                │
│  On error:                                                    │
│  ┌────────────────────────────────────────────┐             │
│  │ errorCode: "ERROR_CODE"                     │             │
│  │ errorMessage: "technical message"           │             │
│  │ duration: Date.now() - timestamp            │             │
│  └────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

## Memory Management

```
┌──────────────────────────────────────────────────────────────┐
│               Memory-Aware Processing                         │
│                                                                │
│  For each page:                                               │
│                                                                │
│  1. Estimate memory needed                                    │
│     estimatedMemory = width × height × 4 (RGBA)              │
│                                                                │
│  2. Check against limit                                       │
│     if (estimatedMemory > MAX_MEMORY_PER_IMAGE)              │
│                                                                │
│  3. Adjust if needed                                          │
│     ┌────────────────────────────────┐                       │
│     │ Reduce scale                   │                       │
│     │ newScale = sqrt(limit/current) │                       │
│     └────────────────────────────────┘                       │
│     ┌────────────────────────────────┐                       │
│     │ Switch to JPEG                 │                       │
│     │ quality = 0.85                 │                       │
│     └────────────────────────────────┘                       │
│                                                                │
│  4. Render with adjusted settings                             │
│                                                                │
│  5. Clean up canvas                                           │
│     canvas = null                                             │
│     context = null                                            │
│                                                                │
│  Result: Prevents browser crashes from memory exhaustion     │
└──────────────────────────────────────────────────────────────┘
```

## Key Design Patterns

### 1. Error Hierarchy
```
Error (built-in)
  └── PDFExtractionError (custom)
        ├── code: string
        ├── message: string (user-facing)
        └── diagnostic: DiagnosticInfo
```

### 2. State Machine
```
ViewState = 'hero' | 'upload' | 'processing' | 'results' | 'error'

hero → upload → processing → results
                     ↓
                   error
```

### 3. Strategy Pattern
```
Extraction Strategies (executed in order):
1. Embedded Image Extraction
2. Page Rasterization
3. (Future: OCR, etc.)
```

### 4. Observer Pattern
```
Progress Callbacks:
onProgress(progress, status)
  ↓
Updates UI in real-time
```

### 5. Factory Pattern
```
generateSessionId() → unique session ID
createDiagnostic() → DiagnosticInfo object
```

## Performance Considerations

```
┌──────────────────────────────────────────────┐
│         Performance Optimizations            │
│                                               │
│  1. Canvas Context Options                   │
│     willReadFrequently: false                │
│     → Better GPU performance                 │
│                                               │
│  2. Progressive Rendering                    │
│     Process page by page                     │
│     → Prevents UI freeze                     │
│                                               │
│  3. Memory Cleanup                           │
│     Release canvas after each page           │
│     → Prevents memory leaks                  │
│                                               │
│  4. Async/Await                              │
│     Non-blocking operations                  │
│     → Responsive UI                          │
│                                               │
│  5. Progress Callbacks                       │
│     Update every page                        │
│     → User feedback                          │
└──────────────────────────────────────────────┘
```

## Security Model

```
┌──────────────────────────────────────────────┐
│         Security Features                     │
│                                               │
│  1. Client-Side Only                         │
│     ✓ No server uploads                      │
│     ✓ No data transmission                   │
│     ✓ Complete privacy                       │
│                                               │
│  2. Validation                               │
│     ✓ File size limits                       │
│     ✓ Type checking                          │
│     ✓ Header validation                      │
│                                               │
│  3. Resource Protection                      │
│     ✓ Memory limits                          │
│     ✓ Page count limits                      │
│     ✓ Timeout potential (future)             │
│                                               │
│  4. No PII Collection                        │
│     ✓ Only file metadata                     │
│     ✓ No user tracking                       │
│     ✓ Local diagnostic storage               │
└──────────────────────────────────────────────┘
```

This architecture provides robust error handling, comprehensive diagnostics, and a great user experience while maintaining complete client-side privacy.
