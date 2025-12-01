# PDF.js Worker File

This directory should contain `pdf.worker.min.js` which is automatically copied from `pdfjs-dist` package during build.

## How it works

1. The Vite config includes a custom plugin (`copyPdfWorker`) that runs during build
2. It copies `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to `public/assets/pdf.worker.min.js`
3. The PDF worker setup (`src/lib/pdf-worker-setup.ts`) tries to load the worker from `/assets/pdf.worker.min.js`
4. If the worker cannot be loaded, the app falls back to `disableWorker: true` mode which processes PDFs in the main thread

## Fallback Strategy

The extraction system uses multiple fallback strategies in order:

1. **Try local worker** (`/assets/pdf.worker.min.js`)
2. **Try CDN worker** (cdnjs.cloudflare.com - as last resort)
3. **Use disableWorker mode** (main thread processing - always works but slower)

## Why disableWorker?

When `disableWorker: true` is set, PDF.js processes the PDF entirely in the browser's main thread without requiring a separate worker file. This is:
- ✅ More reliable (no external dependencies)
- ✅ Works offline and in restricted environments
- ✅ No CORS or CSP issues
- ⚠️ Slightly slower for large PDFs
- ⚠️ May block UI during heavy processing (but we use progress indicators)

The implementation prioritizes **reliability over performance** - it's better to process PDFs slowly than to fail completely.
