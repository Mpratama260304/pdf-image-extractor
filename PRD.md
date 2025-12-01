# Planning Guide

A modern, client-side PDF image extraction tool that allows users to upload PDFs, extract all embedded images, and download them individually or as a ZIP archive—all within the browser with zero backend dependencies.

**Experience Qualities**:
1. **Effortless** - The extraction process should feel instantaneous and require minimal user interaction, with clear visual feedback at every step
2. **Professional** - The interface should convey reliability and technical competence through precise typography, considered spacing, and smooth interactions
3. **Delightful** - Subtle animations and glass-morphic effects should create moments of visual interest without distracting from the core functionality

**Complexity Level**: Light Application (multiple features with basic state)
  - Single-purpose tool with multiple views (upload, processing, results), image preview modals, session persistence, and ZIP generation—all handled client-side

## Essential Features

### PDF Upload Interface
- **Functionality**: Drag-and-drop or click-to-browse file upload that accepts PDF files
- **Purpose**: Provide an intuitive, friction-free way for users to begin the extraction process
- **Trigger**: User lands on homepage or navigates to extract page
- **Progression**: View hero section → Click "Extract Images" CTA → Drag PDF or click upload zone → File validates → Processing begins
- **Success criteria**: PDF file is successfully loaded into memory and validated as a proper PDF document

### Image Extraction Engine
- **Functionality**: Extract embedded images from PDF using pdf.js, with multiple fallback strategies and comprehensive error handling
- **Purpose**: Core functionality that retrieves all visual content from the uploaded PDF with robust diagnostics
- **Trigger**: User uploads valid PDF file
- **Progression**: PDF loaded → Validate file (size, header, encryption) → Extract embedded images → If count = 0, rasterize pages at high DPI → If errors occur, collect diagnostic data → Display results or friendly error
- **Success criteria**: All images successfully extracted with correct metadata, or pages rasterized as fallback, within reasonable time (<10s for typical PDFs); errors provide actionable feedback with diagnostic downloads

### Results Gallery
- **Functionality**: Display all extracted images in a responsive masonry grid with metadata
- **Purpose**: Allow users to preview, download individual images, or download all as ZIP
- **Trigger**: Extraction completes successfully
- **Progression**: Extraction complete → Animate transition to results → Display masonry grid → User clicks image → Modal opens with full preview → User downloads single or clicks "Download All ZIP"
- **Success criteria**: All images render correctly, modal interactions feel smooth, download actions work reliably

### ZIP Archive Generation
- **Functionality**: Bundle all extracted images into a single ZIP file for download
- **Purpose**: Provide convenient batch download for users with many extracted images
- **Trigger**: User clicks "Download All as ZIP" button
- **Progression**: Button clicked → Generate ZIP in browser using JSZip → Trigger download → Toast confirmation
- **Success criteria**: ZIP file contains all images with proper filenames, downloads successfully to user's system

### Session Persistence
- **Functionality**: Save extraction results to KV storage so users can return and access previous extractions
- **Purpose**: Allow users to close the app and return without re-uploading PDFs
- **Trigger**: Extraction completes, page loads with existing session
- **Progression**: Extraction complete → Save to KV with session ID → User closes tab → User returns → Session restored → Previous results displayed
- **Success criteria**: Results persist across browser sessions, load quickly on return

### Error Handling & Diagnostics
- **Functionality**: Comprehensive error detection with diagnostic data collection and user-friendly error messages
- **Purpose**: Help users understand why extraction failed and provide actionable solutions
- **Trigger**: Any extraction error occurs (invalid file, corrupted PDF, encryption, size limits)
- **Progression**: Error detected → Collect diagnostic data (file info, attempts, duration) → Display friendly error screen → Offer diagnostic download → Show specific tips for resolution
- **Success criteria**: Users receive clear, actionable error messages in Indonesian with specific recovery steps; diagnostic JSON available for debugging

## Edge Case Handling

- **Invalid File Upload** - Display clear error screen with diagnostic info if uploaded file is not a valid PDF or is corrupted
- **Empty PDF** - Show friendly message if PDF contains no images and no pages to rasterize
- **Large PDFs** - Display progress indicator for PDFs with many pages, prevent UI freeze during processing; enforce 200MB limit with clear message
- **Memory Limits** - Gracefully handle browser memory constraints by adjusting image quality and resolution for extremely large PDFs
- **Download Failures** - Catch and display errors if ZIP generation or download fails
- **Mobile Upload** - Ensure file picker works correctly on iOS/Android devices
- **Encrypted PDFs** - Detect password-protected PDFs early and show clear message with resolution steps
- **Corrupted Files** - Validate PDF header and structure before processing; provide repair suggestions
- **Network Issues** - Handle CDN failures for pdf.js worker gracefully
- **Browser Compatibility** - Test on Chrome, Firefox, Safari, Edge; provide fallback for older browsers

## Design Direction

The design should feel like a premium developer tool—think Linear.app meets Apple's design language. Clean, dark glassmorphism with neon accent colors creates a modern, technical aesthetic. The interface should be minimal and content-focused, with generous spacing and purposeful animations that guide attention without feeling gratuitous. Every interaction should feel immediate and precise.

## Color Selection

**Custom palette** - A dark, sophisticated theme with electric blue/purple accents that evoke cutting-edge technology while maintaining excellent readability

- **Primary Color**: Electric Blue (oklch(0.6 0.22 250)) - Represents the primary action (extract/download), communicates innovation and technical precision
- **Secondary Colors**: 
  - Deep Purple (oklch(0.55 0.18 280)) for secondary actions and hover states
  - Slate Gray (oklch(0.35 0.02 250)) for muted UI elements
- **Accent Color**: Neon Cyan (oklch(0.75 0.15 200)) - Draws attention to success states, active elements, and important CTAs
- **Foreground/Background Pairings**:
  - Background (oklch(0.12 0.01 250) dark navy): White text (oklch(0.98 0 0)) - Ratio 16.2:1 ✓
  - Card (oklch(0.16 0.015 250) slate): White text (oklch(0.98 0 0)) - Ratio 14.8:1 ✓
  - Primary (oklch(0.6 0.22 250) electric blue): White text (oklch(0.98 0 0)) - Ratio 6.1:1 ✓
  - Secondary (oklch(0.55 0.18 280) deep purple): White text (oklch(0.98 0 0)) - Ratio 7.2:1 ✓
  - Accent (oklch(0.75 0.15 200) neon cyan): Dark text (oklch(0.12 0.01 250)) - Ratio 9.8:1 ✓
  - Muted (oklch(0.35 0.02 250) slate gray): Light gray text (oklch(0.7 0 0)) - Ratio 4.9:1 ✓

## Font Selection

Typography should feel technical yet approachable—Inter provides excellent readability at all sizes while maintaining a modern, neutral character suitable for a professional tool.

- **Typographic Hierarchy**:
  - H1 (Hero Title): Inter Bold/48px/tight (-0.02em) letter spacing/leading tight
  - H2 (Section Headers): Inter SemiBold/32px/tight letter spacing/leading snug
  - H3 (Card Titles): Inter Medium/20px/normal letter spacing/leading normal
  - Body (Descriptions): Inter Regular/16px/normal letter spacing/leading relaxed (1.6)
  - Small (Metadata): Inter Medium/14px/normal letter spacing/leading normal
  - Button Text: Inter SemiBold/16px/slight letter spacing (0.01em)

## Animations

Animations should feel physics-based and purposeful—every motion guides the user's attention or provides feedback. Err on the side of subtlety; animations should enhance clarity rather than showcase themselves.

- **Purposeful Meaning**: Page transitions slide with slight fade to maintain spatial continuity; upload zone pulses subtly on drag-over to confirm drop target; images fade up sequentially in gallery to create rhythm; modal scales from clicked image position to maintain context
- **Hierarchy of Movement**: Primary actions (extract button) have satisfying press animation with scale + shadow; secondary elements (image cards) respond to hover with subtle lift; background elements remain still to avoid distraction

## Component Selection

- **Components**: 
  - Card (shadcn) with glassmorphism backdrop-blur for upload zone and image cards
  - Button (shadcn) with custom gradient styling for primary CTAs
  - Dialog (shadcn) for full-size image preview modal
  - Progress (shadcn) for extraction progress indicator
  - Toast (sonner) for success/error notifications
  - Tabs (shadcn) if implementing navigation between Home/Extract/Results
  - Badge (shadcn) for image metadata (dimensions, page number)
  
- **Customizations**: 
  - Custom file upload zone with animated border gradient on hover/drag
  - Custom masonry grid layout using CSS Grid with auto-fill
  - Custom image viewer with zoom and pan controls
  - Custom loading spinner with orbital animation

- **States**: 
  - Buttons: Default (gradient + shadow), Hover (brighten + lift), Active (press down + darken), Loading (spinning icon + disabled), Disabled (reduced opacity + no interaction)
  - Upload Zone: Default (dashed border), Hover (solid accent border), Drag Over (filled accent background + scale), Error (red border pulse)
  - Image Cards: Default (glass card), Hover (lift + glow), Loading (skeleton shimmer)

- **Icon Selection**: 
  - Upload: UploadSimple (Phosphor) for upload zone
  - Download: Download (Phosphor) for download buttons
  - Image: Image (Phosphor) for empty states
  - Check: CheckCircle (Phosphor) for success states
  - Warning: Warning (Phosphor) for error states
  - Spinner: CircleNotch (Phosphor) for loading states
  - Expand: ArrowsOut (Phosphor) for image viewer
  - Close: X (Phosphor) for modal close

- **Spacing**: 
  - Container padding: px-6 md:px-12
  - Section gaps: gap-8 md:gap-16
  - Card padding: p-6 md:p-8
  - Button padding: px-6 py-3
  - Grid gaps: gap-4 (gallery)

- **Mobile**: 
  - Stack hero content vertically on mobile
  - Single column gallery grid on mobile, 2-3 columns on tablet, 4-5 on desktop
  - Full-screen modal on mobile, centered dialog on desktop
  - Bottom sheet for download options on mobile
  - Touch-friendly target sizes (min 44px) for all interactive elements
