import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  SignOut, 
  Images, 
  HardDrive, 
  Link as LinkIcon, 
  Trash, 
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  XCircle,
  Copy,
  Broom,
  ArrowsClockwise,
  Funnel,
  SortAscending,
  CaretDown,
  X,
  Eye,
  Calendar,
  DownloadSimple,
  ArrowSquareOut,
  Warning,
  FileX,
  Timer,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getAdminStats, 
  getAdminExtractions, 
  deleteAdminExtraction,
  runCleanup,
  updateShareLink,
  bulkDeleteExtractions,
  getBulkInfo,
  getZipDownloadUrl,
  createShareLinkForExtraction,
} from '@/lib/api-client';
import type { AdminStats, AdminExtraction, PaginatedResponse } from '@/lib/api-types';
import { toast } from 'sonner';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">
          <CheckCircle weight="fill" className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    case 'processing':
      return (
        <Badge variant="default" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
          <Clock weight="fill" className="w-3 h-3 mr-1" />
          Processing
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive">
          <XCircle weight="fill" className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary">
          <Timer weight="fill" className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock weight="fill" className="w-3 h-3 mr-1" />
          {status}
        </Badge>
      );
  }
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';
type DateRangeFilter = '24h' | '7d' | '30d' | 'all';
type SortOption = 'newest' | 'oldest' | 'largest' | 'mostImages';
type PageSize = 10 | 25 | 50;

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [extractions, setExtractions] = useState<PaginatedResponse<AdminExtraction> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkInfo, setBulkInfo] = useState<{ totalSize: number; totalImages: number } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // Detail drawer state
  const [selectedExtraction, setSelectedExtraction] = useState<AdminExtraction | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/admin/login', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);
  
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [statsData, extractionsData] = await Promise.all([
        getAdminStats(),
        getAdminExtractions({ 
          page, 
          search: search || undefined, 
          limit: pageSize,
          status: statusFilter === 'all' ? undefined : statusFilter,
          dateRange,
          sort: sortBy,
        }),
      ]);
      setStats(statsData);
      setExtractions(extractionsData);
      // Clear selection when data changes
      setSelectedIds(new Set());
      setBulkInfo(null);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, pageSize, statusFilter, dateRange, sortBy]);
  
  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);
  
  // Fetch bulk info when selection changes
  useEffect(() => {
    if (selectedIds.size > 0) {
      getBulkInfo(Array.from(selectedIds)).then(setBulkInfo).catch(() => setBulkInfo(null));
    } else {
      setBulkInfo(null);
    }
  }, [selectedIds]);
  
  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
    toast.success('Logged out successfully');
  };
  
  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await deleteAdminExtraction(id);
      toast.success('Extraction deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete extraction');
    } finally {
      setDeletingId(null);
    }
  };
  
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      setIsBulkDeleting(true);
      const result = await bulkDeleteExtractions(Array.from(selectedIds));
      toast.success(`Deleted ${result.deleted} extraction(s)`);
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} deletion(s) failed`);
      }
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      toast.error('Bulk delete failed');
    } finally {
      setIsBulkDeleting(false);
    }
  };
  
  const handleCleanup = async () => {
    try {
      setIsCleaningUp(true);
      const { deletedCount } = await runCleanup();
      toast.success(`Cleanup complete. Deleted ${deletedCount} expired extractions.`);
      fetchData();
    } catch (error) {
      toast.error('Cleanup failed');
    } finally {
      setIsCleaningUp(false);
    }
  };
  
  // Helper to get share token from extraction (top-level or from shareLinks)
  const getShareToken = (extraction: AdminExtraction): string | null => {
    // Prefer top-level shareToken
    if (extraction.shareToken) return extraction.shareToken;
    // Fallback to first share link
    const firstLink = extraction.shareLinks?.[0];
    return firstLink?.token ?? null;
  };
  
  // Helper to build share URL safely
  const buildShareUrl = (token: string | null): string | null => {
    if (!token) return null;
    try {
      return new URL(`/s/${token}`, window.location.origin).toString();
    } catch {
      return null;
    }
  };
  
  const handleCopyLink = async (token: string | null) => {
    // Guard against undefined/null token
    if (!token) {
      toast.error('Share token missing - create a share link first');
      return;
    }
    
    try {
      const url = buildShareUrl(token);
      
      // Guard against malformed URLs
      if (!url || url.includes('undefined') || url.includes('null')) {
        toast.error('Invalid share URL - refresh or create new share link');
        return;
      }
      
      await navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    } catch {
      toast.error('Failed to copy');
    }
  };
  
  const handleCreateShareLink = async (extractionId: string) => {
    try {
      const result = await createShareLinkForExtraction(extractionId);
      toast.success('Share link created!');
      // Copy the new link
      await handleCopyLink(result.token);
      // Refresh data to update the UI
      fetchData();
    } catch (error) {
      toast.error('Failed to create share link');
    }
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };
  
  const handleTogglePublic = async (token: string, currentPublic: boolean) => {
    try {
      await updateShareLink(token, { isPublic: !currentPublic });
      toast.success(`Share link is now ${!currentPublic ? 'public' : 'private'}`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update share link');
    }
  };
  
  const handleRegenerateToken = async (token: string) => {
    try {
      const result = await updateShareLink(token, { regenerateToken: true });
      toast.success('Share link token regenerated');
      // Use the new token from result
      handleCopyLink(result.token);
      fetchData();
    } catch (error) {
      toast.error('Failed to regenerate token');
    }
  };
  
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  const selectAll = () => {
    if (!extractions) return;
    if (selectedIds.size === extractions.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(extractions.items.map(e => e.id)));
    }
  };
  
  const openDetailDrawer = (extraction: AdminExtraction) => {
    setSelectedExtraction(extraction);
    setIsDrawerOpen(true);
  };
  
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDateRange('all');
    setSortBy('newest');
    setPage(1);
  };
  
  const hasActiveFilters = search || statusFilter !== 'all' || dateRange !== 'all' || sortBy !== 'newest';
  
  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="sticky top-0 z-50 glass-effect border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
                PE
              </div>
              <span className="font-bold text-lg">PDF Extractor</span>
            </Link>
            <Badge variant="outline">Admin</Badge>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.username}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <SignOut weight="bold" className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8"
        >
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Images weight="duotone" className="w-5 h-5 text-primary" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.totalExtractions ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle weight="duotone" className="w-5 h-5 text-green-500" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.completedExtractions ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle weight="duotone" className="w-5 h-5 text-red-500" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.failedExtractions ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <HardDrive weight="duotone" className="w-5 h-5 text-accent" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{formatFileSize(stats?.storageUsedBytes ?? 0)}</p>
                )}
                <p className="text-xs text-muted-foreground">Storage</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Clock weight="duotone" className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.extractionsLast24h ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Last 24h</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <LinkIcon weight="duotone" className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.totalShareLinks ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground">Links</p>
              </div>
            </div>
          </div>
        </motion.div>
        
        {/* Top Largest Extractions */}
        {stats?.topLargestExtractions && stats.topLargestExtractions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Top 5 Largest Extractions</h3>
            <div className="flex flex-wrap gap-2">
              {stats.topLargestExtractions.map((ext) => (
                <Badge key={ext.id} variant="secondary" className="text-xs py-1 px-2">
                  {ext.originalFilename.slice(0, 20)}{ext.originalFilename.length > 20 ? '...' : ''} • {formatFileSize(ext.sizeBytes)}
                </Badge>
              ))}
            </div>
          </motion.div>
        )}
        
        {/* Search, Filters & Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-4 mb-6"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search by filename or SHA256..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <Funnel weight="bold" className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={dateRange} onValueChange={(v) => { setDateRange(v as DateRangeFilter); setPage(1); }}>
                <SelectTrigger className="w-[130px]">
                  <Calendar weight="bold" className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortOption); setPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SortAscending weight="bold" className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="largest">Largest Size</SelectItem>
                  <SelectItem value="mostImages">Most Images</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v) as PageSize); setPage(1); }}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
              
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X weight="bold" className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowsClockwise weight="bold" className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleCleanup} disabled={isCleaningUp}>
              <Broom weight="bold" className="w-4 h-4 mr-2" />
              {isCleaningUp ? 'Cleaning...' : 'Cleanup Expired'}
            </Button>
            
            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 ml-4 pl-4 border-l">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                  {bulkInfo && ` (${formatFileSize(bulkInfo.totalSize)}, ${bulkInfo.totalImages} images)`}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isBulkDeleting}>
                      <Trash weight="bold" className="w-4 h-4 mr-2" />
                      Delete Selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedIds.size} Extractions?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {selectedIds.size} extraction(s)
                        {bulkInfo && `, freeing up ${formatFileSize(bulkInfo.totalSize)} and removing ${bulkInfo.totalImages} images`}.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleBulkDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  <X weight="bold" className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </motion.div>
        
        {/* Extractions Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border bg-card overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left p-4 w-10">
                    <Checkbox
                      checked={extractions?.items.length ? selectedIds.size === extractions.items.length : false}
                      onCheckedChange={selectAll}
                    />
                  </th>
                  <th className="text-left p-4 font-medium">Filename</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Images</th>
                  <th className="text-left p-4 font-medium">Size</th>
                  <th className="text-left p-4 font-medium">Created</th>
                  <th className="text-left p-4 font-medium">Share Link</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-4"><Skeleton className="h-5 w-5" /></td>
                      <td className="p-4"><Skeleton className="h-5 w-48" /></td>
                      <td className="p-4"><Skeleton className="h-5 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-5 w-12" /></td>
                      <td className="p-4"><Skeleton className="h-5 w-16" /></td>
                      <td className="p-4"><Skeleton className="h-5 w-32" /></td>
                      <td className="p-4"><Skeleton className="h-5 w-24" /></td>
                      <td className="p-4"><Skeleton className="h-8 w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : extractions?.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <FileX weight="duotone" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No extractions found</p>
                      {hasActiveFilters && (
                        <Button variant="link" onClick={clearFilters} className="mt-2">
                          Clear filters
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  extractions?.items.map((extraction) => (
                    <tr 
                      key={extraction.id} 
                      className={`border-b hover:bg-muted/30 transition-colors cursor-pointer ${selectedIds.has(extraction.id) ? 'bg-muted/20' : ''}`}
                      onClick={() => openDetailDrawer(extraction)}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(extraction.id)}
                          onCheckedChange={() => toggleSelection(extraction.id)}
                        />
                      </td>
                      <td className="p-4">
                        <p className="font-medium truncate max-w-[200px]" title={extraction.originalFilename}>
                          {extraction.originalFilename}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={extraction.sha256}>
                          {extraction.sha256.slice(0, 12)}...
                        </p>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={extraction.status} />
                      </td>
                      <td className="p-4">{extraction.imageCount}</td>
                      <td className="p-4">{formatFileSize(extraction.sizeBytes)}</td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {formatDate(extraction.createdAt)}
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const token = getShareToken(extraction);
                          if (token) {
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyLink(token)}
                              >
                                <Copy weight="bold" className="w-4 h-4 mr-2" />
                                Copy
                              </Button>
                            );
                          } else if (extraction.status === 'completed') {
                            return (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCreateShareLink(extraction.id)}
                              >
                                <LinkIcon weight="bold" className="w-4 h-4 mr-2" />
                                Create Link
                              </Button>
                            );
                          } else {
                            return <span className="text-muted-foreground text-sm">—</span>;
                          }
                        })()}
                      </td>
                      <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <CaretDown weight="bold" className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDetailDrawer(extraction)}>
                              <Eye weight="bold" className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {(() => {
                              const token = getShareToken(extraction);
                              if (token) {
                                const shareUrl = buildShareUrl(token);
                                return (
                                  <>
                                    <DropdownMenuItem onClick={() => handleCopyLink(token)}>
                                      <Copy weight="bold" className="w-4 h-4 mr-2" />
                                      Copy Share Link
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => shareUrl && window.open(shareUrl, '_blank')}>
                                      <ArrowSquareOut weight="bold" className="w-4 h-4 mr-2" />
                                      Open in New Tab
                                    </DropdownMenuItem>
                                  </>
                                );
                              } else if (extraction.status === 'completed') {
                                return (
                                  <DropdownMenuItem onClick={() => handleCreateShareLink(extraction.id)}>
                                    <LinkIcon weight="bold" className="w-4 h-4 mr-2" />
                                    Create Share Link
                                  </DropdownMenuItem>
                                );
                              }
                              return null;
                            })()}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(extraction.id)}
                            >
                              <Trash weight="bold" className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {extractions && extractions.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * extractions.limit) + 1} - {Math.min(page * extractions.limit, extractions.total)} of {extractions.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <CaretLeft weight="bold" className="w-4 h-4" />
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {page} of {extractions.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(extractions.totalPages, p + 1))}
                  disabled={page === extractions.totalPages}
                >
                  <CaretRight weight="bold" className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      
      {/* Detail Drawer */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedExtraction && (
            <>
              <SheetHeader>
                <SheetTitle className="truncate pr-8">{selectedExtraction.originalFilename}</SheetTitle>
                <SheetDescription>
                  <StatusBadge status={selectedExtraction.status} />
                </SheetDescription>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                {/* Metadata */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Details</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Size</p>
                      <p className="font-medium">{formatFileSize(selectedExtraction.sizeBytes)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Images</p>
                      <p className="font-medium">{selectedExtraction.imageCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pages</p>
                      <p className="font-medium">{selectedExtraction.pageCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-medium">{formatDate(selectedExtraction.createdAt)}</p>
                    </div>
                    {selectedExtraction.expiresAt && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Expires</p>
                        <p className="font-medium">{formatDate(selectedExtraction.expiresAt)}</p>
                      </div>
                    )}
                  </div>
                  <div className="pt-2">
                    <p className="text-muted-foreground text-xs mb-1">SHA-256</p>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all">{selectedExtraction.sha256}</p>
                  </div>
                </div>
                
                {/* Error message if failed */}
                {selectedExtraction.status === 'failed' && selectedExtraction.errorMessage && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                    <div className="flex items-start gap-2">
                      <Warning weight="fill" className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-destructive">Extraction Failed</p>
                        <p className="text-sm text-destructive/80 mt-1">{selectedExtraction.errorMessage}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Share Links */}
                {selectedExtraction.shareLinks.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Share Links</h4>
                    {selectedExtraction.shareLinks.map((link) => {
                      const shareUrl = buildShareUrl(link.token);
                      return (
                        <div key={link.token} className="rounded-lg border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge variant={link.isPublic ? 'default' : 'secondary'}>
                              {link.isPublic ? 'Public' : 'Private'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {link.accessCount} view(s)
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {shareUrl || `/s/${link.token}`}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleCopyLink(link.token)}>
                              <Copy weight="bold" className="w-3 h-3 mr-1" />
                              Copy Link
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => shareUrl && window.open(shareUrl, '_blank')}>
                              <ArrowSquareOut weight="bold" className="w-3 h-3 mr-1" />
                              Open
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleTogglePublic(link.token, link.isPublic)}
                            >
                              {link.isPublic ? 'Make Private' : 'Make Public'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleRegenerateToken(link.token)}
                            >
                              <ArrowsClockwise weight="bold" className="w-3 h-3 mr-1" />
                              Regenerate
                            </Button>
                          </div>
                          {link.lastAccessedAt && (
                            <p className="text-xs text-muted-foreground">
                              Last accessed: {formatDate(link.lastAccessedAt)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : selectedExtraction.status === 'completed' ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Share Links</h4>
                    <div className="rounded-lg border border-dashed p-4 text-center">
                      <p className="text-sm text-muted-foreground mb-3">No share links yet</p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleCreateShareLink(selectedExtraction.id)}
                      >
                        <LinkIcon weight="bold" className="w-4 h-4 mr-2" />
                        Create Share Link
                      </Button>
                    </div>
                  </div>
                ) : null}
                
                {/* Quick Actions */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const token = getShareToken(selectedExtraction);
                      if (token) {
                        return (
                          <Button 
                            variant="outline" 
                            onClick={() => window.open(getZipDownloadUrl(token), '_blank')}
                          >
                            <DownloadSimple weight="bold" className="w-4 h-4 mr-2" />
                            Download ZIP
                          </Button>
                        );
                      }
                      return null;
                    })()}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive">
                          <Trash weight="bold" className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Extraction</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{selectedExtraction.originalFilename}"? 
                            This will permanently delete {selectedExtraction.imageCount} image(s) ({formatFileSize(selectedExtraction.sizeBytes)}) and all share links.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              handleDelete(selectedExtraction.id);
                              setIsDrawerOpen(false);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
