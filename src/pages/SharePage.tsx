import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Images, Calendar, HardDrive, Link as LinkIcon, Copy, Check, ArrowLeft, Eye } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { getShareLink, getZipDownloadUrl } from '@/lib/api-client';
import type { ShareLinkData, ImageData } from '@/lib/api-types';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [shareData, setShareData] = useState<ShareLinkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    async function fetchShare() {
      if (!token) {
        setError('Invalid share link');
        setIsLoading(false);
        return;
      }
      
      try {
        const data = await getShareLink(token);
        setShareData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load share');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchShare();
  }, [token]);
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };
  
  const handleDownloadZip = () => {
    if (!token) return;
    window.location.href = getZipDownloadUrl(token);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-48 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  if (error || !shareData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <LinkIcon weight="bold" className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">Share Link Not Found</h1>
          <p className="text-muted-foreground max-w-md">
            {error || 'This share link may have expired or been deleted.'}
          </p>
          <Button asChild>
            <Link to="/">
              <ArrowLeft weight="bold" className="w-4 h-4 mr-2" />
              Go Home
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  
  const { extraction, images, downloadZipUrl, accessCount } = shareData;
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="sticky top-0 z-50 glass-effect border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
              PE
            </div>
            <span className="font-bold text-lg">PDF Extractor</span>
          </Link>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <Check weight="bold" className="w-4 h-4 mr-2" />
              ) : (
                <Copy weight="bold" className="w-4 h-4 mr-2" />
              )}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            <Button size="sm" onClick={handleDownloadZip}>
              <Download weight="bold" className="w-4 h-4 mr-2" />
              Download ZIP
            </Button>
          </div>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* File Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2 truncate" title={extraction.originalFilename}>
            {extraction.originalFilename}
          </h1>
          <p className="text-muted-foreground">
            Shared PDF extraction • {images.length} images extracted
          </p>
        </motion.div>
        
        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Images weight="duotone" className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{extraction.imageCount}</p>
                <p className="text-xs text-muted-foreground">Images</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                <HardDrive weight="duotone" className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatFileSize(extraction.sizeBytes)}</p>
                <p className="text-xs text-muted-foreground">Original Size</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Calendar weight="duotone" className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium">{formatDate(extraction.createdAt)}</p>
                <p className="text-xs text-muted-foreground">Uploaded</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Eye weight="duotone" className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{accessCount}</p>
                <p className="text-xs text-muted-foreground">Views</p>
              </div>
            </div>
          </div>
        </motion.div>
        
        {/* Download Button (Mobile) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="md:hidden mb-6"
        >
          <Button className="w-full" size="lg" onClick={handleDownloadZip}>
            <Download weight="bold" className="w-5 h-5 mr-2" />
            Download All as ZIP
          </Button>
        </motion.div>
        
        {/* Image Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xl font-semibold mb-4">Extracted Images</h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {images.map((image, index) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(index * 0.02, 0.5) }}
                className="group relative aspect-square rounded-xl overflow-hidden border bg-card cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                onClick={() => setSelectedImage(image)}
              >
                <img
                  src={image.url}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-sm font-medium truncate">{image.filename}</p>
                  <p className="text-white/70 text-xs">Page {image.pageNumber}</p>
                </div>
                <Badge
                  variant="secondary"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {image.width}×{image.height}
                </Badge>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
      
      {/* Image Preview Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          {selectedImage && (
            <div className="space-y-4">
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
                <Button asChild>
                  <a href={selectedImage.url} download={selectedImage.filename}>
                    <Download weight="bold" className="w-4 h-4 mr-2" />
                    Download
                  </a>
                </Button>
              </div>
              <div className="rounded-lg overflow-hidden bg-muted">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.filename}
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
