import { useState, useRef } from 'react'
import { UploadSimple, FilePdf, Warning } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  isProcessing: boolean
}

export function UploadZone({ onFileSelect, isProcessing }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'File harus berformat PDF' }
    }
    
    if (file.size === 0) {
      return { valid: false, error: 'File kosong atau rusak' }
    }
    
    const maxSize = 200 * 1024 * 1024
    if (file.size > maxSize) {
      return { 
        valid: false, 
        error: `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimal 200MB` 
      }
    }
    
    return { valid: true }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setValidationError(null)

    const file = e.dataTransfer.files[0]
    if (file) {
      const validation = validateFile(file)
      if (!validation.valid) {
        setValidationError(validation.error || 'File tidak valid')
        toast.error(validation.error || 'File tidak valid')
        return
      }
      
      setSelectedFile(file)
      onFileSelect(file)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null)
    const file = e.target.files?.[0]
    
    if (file) {
      const validation = validateFile(file)
      if (!validation.valid) {
        setValidationError(validation.error || 'File tidak valid')
        toast.error(validation.error || 'File tidak valid')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }
      
      setSelectedFile(file)
      onFileSelect(file)
    }
  }

  const handleClick = () => {
    if (!isProcessing) {
      setValidationError(null)
      fileInputRef.current?.click()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'relative min-h-[400px] flex items-center justify-center rounded-2xl transition-all duration-300 cursor-pointer',
        isDragging
          ? 'glass-effect gradient-border scale-105'
          : 'glass-effect hover:scale-[1.02]',
        isProcessing && 'opacity-50 cursor-not-allowed',
        validationError && 'border-destructive/50'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileChange}
        className="hidden"
        disabled={isProcessing}
      />

      <AnimatePresence mode="wait">
        {validationError ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center p-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-destructive/20 mb-6"
            >
              <Warning weight="fill" className="w-10 h-10 text-destructive" />
            </motion.div>
            <h3 className="text-xl font-semibold mb-2 text-destructive">File Tidak Valid</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {validationError}
            </p>
            <p className="text-accent text-sm font-medium">
              Click untuk pilih file lain
            </p>
          </motion.div>
        ) : selectedFile && !isProcessing ? (
          <motion.div
            key="selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center p-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/20 mb-6"
            >
              <FilePdf weight="duotone" className="w-10 h-10 text-primary" />
            </motion.div>
            <h3 className="text-xl font-semibold mb-2">{selectedFile.name}</h3>
            <p className="text-muted-foreground text-sm">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <p className="text-accent text-sm mt-4 font-medium">
              Click to change file
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center p-8"
          >
            <motion.div
              animate={{
                y: isDragging ? -10 : [0, -8, 0],
              }}
              transition={{
                duration: 2,
                repeat: isDragging ? 0 : Infinity,
                ease: 'easeInOut',
              }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/20 mb-6"
            >
              <UploadSimple weight="bold" className="w-10 h-10 text-primary" />
            </motion.div>
            <h3 className="text-2xl font-semibold mb-2">
              {isDragging ? 'Drop your PDF here' : 'Upload PDF File'}
            </h3>
            <p className="text-muted-foreground">
              Drag and drop or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Supports PDF files up to 200MB
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
