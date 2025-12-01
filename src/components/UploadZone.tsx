import { useState, useRef } from 'react'
import { UploadSimple, FilePdf } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  isProcessing: boolean
}

export function UploadZone({ onFileSelect, isProcessing }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
      onFileSelect(file)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      onFileSelect(file)
    }
  }

  const handleClick = () => {
    if (!isProcessing) {
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
        isProcessing && 'opacity-50 cursor-not-allowed'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
        disabled={isProcessing}
      />

      <AnimatePresence mode="wait">
        {selectedFile && !isProcessing ? (
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
