import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Package, Copy, Check, Link as LinkIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getZipDownloadUrl } from '@/lib/api-client';
import type { ExtractionResponse, ImageData } from '@/lib/api-types';

interface ServerResultsViewProps {
  extraction: ExtractionResponse;
  onStartOver: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ServerResultsView({ extraction, onStartOver }: ServerResultsViewProps) {
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [copied, setCopied] = useState(false);
  
  const { images, shareToken, sharePath, originalFilename } = extraction;
  
  // Construct absolute share URL using current origin (works in dev and prod)
  const publicUrl = `${window.location.origin}${sharePath}`;
  
  const handleDownloadAll = () => {
    window.location.href = getZipDownloadUrl(shareToken);
    toast.success('Download started!');
  };

  const handleDownloadSingle = (image: ImageData) => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.filename;
    link.click();
    toast.success('Image downloaded!');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success('Share link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const shouldReduceAnimations = images.length > 100;

  return (
    <div className="min-h-screen px-6 md:px-12 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-4xl font-bold mb-2">Extracted Images</h2>
            <p className="text-muted-foreground">
              {images.length} {images.length === 1 ? 'image' : 'images'} from{' '}
              <span className="text-foreground font-medium">{originalFilename}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="lg"
            >
              {copied ? (
                <Check weight="bold" className="w-5 h-5 mr-2" />
              ) : (
                <LinkIcon weight="bold" className="w-5 h-5 mr-2" />
              )}
              {copied ? 'Copied!' : 'Copy Share Link'}
            </Button>
            <Button
              onClick={handleDownloadAll}
              size="lg"
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
            >
              <Package weight="bold" className="w-5 h-5 mr-2" />
              Download All as ZIP
            </Button>
            <Button onClick={onStartOver} variant="outline" size="lg">
              Upload New PDF
            </Button>
          </div>
        </div>

        {/* Share Link Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 p-4 rounded-xl border bg-card"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <LinkIcon weight="duotone" className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">Your share link is ready!</p>
              <p className="text-sm text-muted-foreground truncate">{publicUrl}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <>
                  <Check weight="bold" className="w-4 h-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy weight="bold" className="w-4 h-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map((image, index) => (
            <ImageCard
              key={image.id}
              image={image}
              index={index}
              onClick={() => setSelectedImage(image)}
              onDownload={() => handleDownloadSingle(image)}
              shouldAnimate={!shouldReduceAnimations}
            />
          ))}
        </div>
      </motion.div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">{selectedImage.filename}</h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span>{selectedImage.width} × {selectedImage.height}px</span>
                    <span>•</span>
                    <span>Page {selectedImage.pageNumber}</span>
                    <span>•</span>
                    <span>{formatFileSize(selectedImage.sizeBytes)}</span>
                  </div>
                </div>
                <Button onClick={() => handleDownloadSingle(selectedImage)}>
                  <Download weight="bold" className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
              <div className="rounded-lg overflow-hidden bg-muted">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.filename}
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
              </div>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ImageCardProps {
  image: ImageData;
  index: number;
  onClick: () => void;
  onDownload: () => void;
  shouldAnimate: boolean;
}

function ImageCard({ image, index, onClick, onDownload, shouldAnimate }: ImageCardProps) {
  const animationProps = shouldAnimate
    ? {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: Math.min(index * 0.02, 0.5) },
      }
    : {};

  return (
    <motion.div {...animationProps}>
      <div 
        className="group relative rounded-xl overflow-hidden border bg-card cursor-pointer transition-all duration-300 hover:ring-2 hover:ring-primary hover:shadow-lg"
        onClick={onClick}
      >
        <div className="aspect-square overflow-hidden bg-muted">
          <img
            src={image.url}
            alt={image.filename}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-medium truncate text-sm">{image.filename}</p>
              <p className="text-white/70 text-xs">
                {image.width}×{image.height} • Page {image.pageNumber}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
            >
              <Download weight="bold" className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Badge
          variant="secondary"
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Page {image.pageNumber}
        </Badge>
      </div>
    </motion.div>
  );
}
