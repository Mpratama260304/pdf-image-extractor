import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Hero } from '@/components/Hero'
import { UploadZone } from '@/components/UploadZone'
import { ProcessingView } from '@/components/ProcessingView'
import { ImageGallery } from '@/components/ImageGallery'
import { ErrorView } from '@/components/ErrorView'
import { extractImagesFromPDF, PDFExtractionError, type DiagnosticInfo } from '@/lib/pdf-extractor'
import { CheckCircle, ArrowLeft } from '@phosphor-icons/react'
import type { ExtractionResult } from '@/lib/pdf-extractor'

type ViewState = 'hero' | 'upload' | 'processing' | 'results' | 'error'

function App() {
  const [view, setView] = useState<ViewState>('hero')
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [errorInfo, setErrorInfo] = useState<{
    code: string
    message: string
    diagnostic?: DiagnosticInfo
  } | null>(null)

  const handleGetStarted = () => {
    setView('upload')
  }

  const handleFileSelect = async (file: File) => {
    setCurrentFile(file)
    setIsProcessing(true)
    setView('processing')
    setProgress(0)
    setStatus('Starting extraction...')
    setErrorInfo(null)

    try {
      const result = await extractImagesFromPDF(file, (prog, stat) => {
        setProgress(prog)
        setStatus(stat)
      })

      if (result.images.length === 0) {
        toast.error('No images found in PDF')
        setView('upload')
        return
      }

      setExtractionResult(result)
      
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle weight="fill" className="w-5 h-5 text-green-500" />
          <span>Extracted {result.images.length} images!</span>
        </div>
      )
      
      setTimeout(() => {
        setView('results')
      }, 500)
    } catch (error) {
      console.error('Extraction error:', error)
      
      if (error instanceof PDFExtractionError) {
        setErrorInfo({
          code: error.code,
          message: error.message,
          diagnostic: error.diagnostic
        })
        setView('error')
        toast.error(error.message)
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        setErrorInfo({
          code: 'UNKNOWN_ERROR',
          message: errorMessage,
          diagnostic: undefined
        })
        setView('error')
        toast.error('Failed to extract images from PDF')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStartOver = () => {
    setView('upload')
    setExtractionResult(null)
    setCurrentFile(null)
    setProgress(0)
    setStatus('')
    setErrorInfo(null)
  }

  const handleBackToHero = () => {
    setView('hero')
    setExtractionResult(null)
    setCurrentFile(null)
    setProgress(0)
    setStatus('')
    setErrorInfo(null)
  }

  const handleRetryAfterError = () => {
    setView('upload')
    setCurrentFile(null)
    setErrorInfo(null)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" theme="dark" />

      <nav className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
              PE
            </div>
            <span className="font-bold text-lg">PDF Extractor</span>
          </div>

          {view !== 'hero' && (
            <Button variant="ghost" size="sm" onClick={handleBackToHero}>
              <ArrowLeft weight="bold" className="w-4 h-4 mr-2" />
              Home
            </Button>
          )}
        </div>
      </nav>

      <div className="pt-16">
        <AnimatePresence mode="wait">
          {view === 'hero' && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Hero onGetStarted={handleGetStarted} />
            </motion.div>
          )}

          {view === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 md:px-12 py-12"
            >
              <div className="max-w-3xl w-full space-y-8">
                <div className="text-center">
                  <h2 className="text-4xl font-bold mb-3">Upload Your PDF</h2>
                  <p className="text-muted-foreground text-lg">
                    Select a PDF file to extract all embedded images
                  </p>
                </div>
                <UploadZone onFileSelect={handleFileSelect} isProcessing={isProcessing} />
              </div>
            </motion.div>
          )}

          {view === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 md:px-12"
            >
              <ProcessingView progress={progress} status={status} />
            </motion.div>
          )}

          {view === 'results' && extractionResult && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ImageGallery
                images={extractionResult.images}
                pdfName={extractionResult.pdfName}
                onStartOver={handleStartOver}
              />
            </motion.div>
          )}

          {view === 'error' && errorInfo && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ErrorView
                errorCode={errorInfo.code}
                errorMessage={errorInfo.message}
                diagnostic={errorInfo.diagnostic}
                onRetry={handleRetryAfterError}
                onBack={handleBackToHero}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default App