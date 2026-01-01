import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Hero } from '@/components/Hero';
import { UploadZone } from '@/components/UploadZone';
import { ProcessingView } from '@/components/ProcessingView';
import { ServerResultsView } from '@/components/ServerResultsView';
import { ErrorView } from '@/components/ErrorView';
import { uploadPDF, getExtractionStatus, ApiError, type RequestDiagnostic } from '@/lib/api-client';
import type { ExtractionResponse } from '@/lib/api-types';
import { CheckCircle, ArrowLeft } from '@phosphor-icons/react';

type ViewState = 'hero' | 'upload' | 'processing' | 'results' | 'error';

// Polling function for async extraction
async function pollExtractionStatus(
  extractionId: string,
  onProgress: (progress: number, status: string) => void,
  maxAttempts = 120, // 10 minutes with 5s interval
  intervalMs = 5000
): Promise<ExtractionResponse | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await getExtractionStatus(extractionId);
      
      // Update progress based on attempt
      const progressPercent = Math.min((attempt / maxAttempts) * 100, 95);
      onProgress(progressPercent, `Processing PDF... (${Math.floor(attempt * intervalMs / 1000)}s)`);
      
      if (result.status === 'completed') {
        return result;
      }
      
      if (result.status === 'failed') {
        throw new Error(result.errorMessage || 'Extraction failed');
      }
      
      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      // Don't retry on non-recoverable errors
      if (error instanceof ApiError && error.diagnostic.status >= 400 && error.diagnostic.status < 500) {
        throw error;
      }
      // Network errors - retry
      console.warn(`Poll attempt ${attempt + 1} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  throw new Error('Extraction timeout - processing took too long');
}

export function HomePage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('hero');
  const [extractionResult, setExtractionResult] = useState<ExtractionResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [errorInfo, setErrorInfo] = useState<{
    code: string;
    message: string;
    diagnostic?: RequestDiagnostic;
  } | null>(null);

  const handleGetStarted = () => {
    setView('upload');
  };

  const handleFileSelect = async (file: File) => {
    setCurrentFile(file);
    setIsProcessing(true);
    setView('processing');
    setProgress(0);
    setStatus('Uploading PDF to server...');
    setErrorInfo(null);

    try {
      // Start upload progress
      let progressValue = 0;
      const progressInterval = setInterval(() => {
        progressValue = Math.min(progressValue + 2, 40);
        setProgress(progressValue);
      }, 100);

      setStatus('Uploading PDF...');
      
      const result = await uploadPDF(file);
      
      clearInterval(progressInterval);
      setProgress(50);
      
      // Handle async processing (status 202)
      if (result.status === 'processing') {
        setStatus('Processing PDF on server...');
        
        // Poll for completion
        const pollResult = await pollExtractionStatus(result.extractionId, (p, s) => {
          setProgress(50 + Math.floor(p * 0.5)); // 50-100%
          setStatus(s);
        });
        
        if (pollResult) {
          setExtractionResult(pollResult);
          setProgress(100);
          setStatus('Extraction complete!');
          
          if (pollResult.imageCount === 0) {
            toast.error('No images found in PDF');
            setView('upload');
            return;
          }
          
          toast.success(
            <div className="flex items-center gap-2">
              <CheckCircle weight="fill" className="w-5 h-5 text-green-500" />
              <span>Extracted {pollResult.imageCount} images!</span>
            </div>
          );
          
          setTimeout(() => {
            setView('results');
          }, 500);
          return;
        }
      }
      
      // Handle immediate completion (cached or fast extraction)
      setProgress(100);
      setStatus('Extraction complete!');

      if (result.imageCount === 0) {
        toast.error('No images found in PDF');
        setView('upload');
        return;
      }

      setExtractionResult(result);
      
      toast.success(
        <div className="flex items-center gap-2">
          <CheckCircle weight="fill" className="w-5 h-5 text-green-500" />
          <span>Extracted {result.imageCount} images!</span>
        </div>
      );
      
      setTimeout(() => {
        setView('results');
      }, 500);
    } catch (error) {
      console.error('Extraction error:', error);
      
      // Handle ApiError with diagnostic info
      if (error instanceof ApiError) {
        setErrorInfo({
          code: error.diagnostic.errorType.toUpperCase(),
          message: error.userMessage,
          diagnostic: error.diagnostic,
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setErrorInfo({
          code: 'SERVER_ERROR',
          message: errorMessage,
        });
      }
      setView('error');
      toast.error('Failed to extract images from PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartOver = () => {
    setView('upload');
    setExtractionResult(null);
    setCurrentFile(null);
    setProgress(0);
    setStatus('');
    setErrorInfo(null);
  };

  const handleBackToHero = () => {
    setView('hero');
    setExtractionResult(null);
    setCurrentFile(null);
    setProgress(0);
    setStatus('');
    setErrorInfo(null);
  };

  const handleRetryAfterError = () => {
    setView('upload');
    setCurrentFile(null);
    setErrorInfo(null);
  };

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
              <ServerResultsView
                extraction={extractionResult}
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
  );
}
