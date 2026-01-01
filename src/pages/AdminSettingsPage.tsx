import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Gear,
  User,
  Lock,
  Image as ImageIcon,
  Globe,
  Upload,
  Trash,
  Check,
  X,
  Warning,
  Eye,
  EyeSlash,
  FloppyDisk,
  SpinnerGap,
  IdentificationCard,
  Palette,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useAuth } from '@/contexts/AuthContext';
import {
  getAdminSettings,
  updateAdminSettings,
  uploadAdminLogo,
  removeAdminLogo,
  uploadFavicon,
  removeFavicon,
  updateAdminProfile,
  updateAdminPassword,
} from '@/lib/api-client';
import type { SiteSettings } from '@/lib/api-types';
import { toast } from 'sonner';

export function AdminSettingsPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();
  
  // Settings state
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  
  // Site metadata form
  const [siteTitle, setSiteTitle] = useState('');
  const [siteDescription, setSiteDescription] = useState('');
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  
  // Profile form
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  
  // File upload state
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  
  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/admin/login', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);
  
  // Load settings and user data
  useEffect(() => {
    if (isAuthenticated) {
      loadSettings();
    }
  }, [isAuthenticated]);
  
  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setUsername(user.username);
    }
  }, [user]);
  
  async function loadSettings() {
    try {
      setIsLoadingSettings(true);
      const data = await getAdminSettings();
      setSettings(data);
      setSiteTitle(data.siteTitle);
      setSiteDescription(data.siteDescription);
    } catch (error) {
      toast.error('Failed to load settings');
      console.error('Load settings error:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  }
  
  // Site Metadata handlers
  async function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      setIsSavingMetadata(true);
      const updated = await updateAdminSettings({ siteTitle, siteDescription });
      setSettings(updated);
      toast.success('Site metadata updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update metadata');
    } finally {
      setIsSavingMetadata(false);
    }
  }
  
  // Profile handlers
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      setIsSavingProfile(true);
      const result = await updateAdminProfile({ email, username });
      await refreshUser();
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  }
  
  // Password handlers
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 10) {
      toast.error('Password must be at least 10 characters');
      return;
    }
    
    try {
      setIsSavingPassword(true);
      await updateAdminPassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update password');
    } finally {
      setIsSavingPassword(false);
    }
  }
  
  // Logo handlers
  function handleLogoClick() {
    logoInputRef.current?.click();
  }
  
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type using settings from API
    const validTypes = settings?.allowedLogoTypes || ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Use PNG, JPEG, WebP, or SVG');
      return;
    }
    
    // Validate file size from settings
    const maxSizeBytes = (settings?.maxLogoSizeMB || 2) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error(`File too large. Maximum size is ${settings?.maxLogoSizeMB || 2}MB`);
      return;
    }
    
    try {
      setIsUploadingLogo(true);
      const result = await uploadAdminLogo(file);
      await loadSettings();
      toast.success('Logo uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload logo');
    } finally {
      setIsUploadingLogo(false);
      // Reset input
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  }
  
  async function handleRemoveLogo() {
    try {
      await removeAdminLogo();
      await loadSettings();
      toast.success('Logo removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove logo');
    }
  }
  
  // Favicon handlers
  function handleFaviconClick() {
    faviconInputRef.current?.click();
  }
  
  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type using settings from API
    const validTypes = settings?.allowedFaviconTypes || ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Use PNG, JPEG, WebP, SVG, or ICO');
      return;
    }
    
    // Validate file size from settings
    const maxSizeBytes = (settings?.maxFaviconSizeMB || 1) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error(`File too large. Maximum size is ${settings?.maxFaviconSizeMB || 1}MB`);
      return;
    }
    
    try {
      setIsUploadingFavicon(true);
      const result = await uploadFavicon(file);
      await loadSettings();
      toast.success(`Favicon uploaded (${result.generatedFiles?.length || 0} sizes generated)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload favicon');
    } finally {
      setIsUploadingFavicon(false);
      // Reset input
      if (faviconInputRef.current) {
        faviconInputRef.current.value = '';
      }
    }
  }
  
  async function handleRemoveFavicon() {
    try {
      await removeFavicon();
      await loadSettings();
      toast.success('Favicon removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove favicon');
    }
  }
  
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SpinnerGap className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return null;
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft weight="bold" className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">
              {user?.username}
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Gear weight="fill" className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="text-muted-foreground">Manage your profile, branding, and site settings</p>
            </div>
          </div>
          
          <div className="space-y-8">
            {/* Profile Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <IdentificationCard weight="fill" className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Update your account information</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="admin"
                        pattern="^[a-zA-Z0-9_-]+$"
                        title="Username can only contain letters, numbers, underscores, and hyphens"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={isSavingProfile}>
                      {isSavingProfile ? (
                        <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FloppyDisk weight="bold" className="w-4 h-4 mr-2" />
                      )}
                      Save Profile
                    </Button>
                  </div>
                </form>
                
                <Separator className="my-6" />
                
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock weight="bold" className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Change Password</span>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showCurrentPassword ? (
                            <EyeSlash weight="bold" className="w-4 h-4" />
                          ) : (
                            <Eye weight="bold" className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password (min 10 chars)"
                            minLength={10}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showNewPassword ? (
                              <EyeSlash weight="bold" className="w-4 h-4" />
                            ) : (
                              <Eye weight="bold" className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary" disabled={isSavingPassword}>
                      {isSavingPassword ? (
                        <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Lock weight="bold" className="w-4 h-4 mr-2" />
                      )}
                      Change Password
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            
            {/* Site Metadata Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Globe weight="fill" className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle>Site Metadata</CardTitle>
                    <CardDescription>Configure the site title and description</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingSettings ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : (
                  <form onSubmit={handleSaveMetadata} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="siteTitle">Site Title</Label>
                      <Input
                        id="siteTitle"
                        type="text"
                        value={siteTitle}
                        onChange={(e) => setSiteTitle(e.target.value)}
                        placeholder="PDF Image Extractor"
                        maxLength={100}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Displayed in browser tab and search results
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="siteDescription">Site Description</Label>
                      <Textarea
                        id="siteDescription"
                        value={siteDescription}
                        onChange={(e) => setSiteDescription(e.target.value)}
                        placeholder="Extract images from PDF files easily"
                        maxLength={500}
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Used for SEO and social media previews
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={isSavingMetadata}>
                        {isSavingMetadata ? (
                          <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FloppyDisk weight="bold" className="w-4 h-4 mr-2" />
                        )}
                        Save Metadata
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
            
            {/* Branding Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Palette weight="fill" className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <CardTitle>Branding</CardTitle>
                    <CardDescription>Upload your logo and favicon</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingSettings ? (
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Skeleton className="h-40" />
                    <Skeleton className="h-40" />
                  </div>
                ) : (
                  <div className="grid gap-6 sm:grid-cols-2">
                    {/* Admin Logo */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <ImageIcon weight="bold" className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Admin Logo</span>
                      </div>
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-32 h-32 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
                          {settings?.adminLogoKey ? (
                            <img
                              src={`/branding/admin-logo?t=${Date.now()}`}
                              alt="Admin Logo"
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <ImageIcon weight="thin" className="w-12 h-12 text-muted-foreground/50" />
                          )}
                        </div>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleLogoClick}
                            disabled={isUploadingLogo}
                          >
                            {isUploadingLogo ? (
                              <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Upload weight="bold" className="w-4 h-4 mr-2" />
                            )}
                            Upload
                          </Button>
                          {settings?.adminLogoKey && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="text-destructive">
                                  <Trash weight="bold" className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Logo?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the admin logo. You can upload a new one later.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleRemoveLogo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          PNG, JPEG, WebP, or SVG<br />Max {settings?.maxLogoSizeMB || 2}MB, 500px width
                        </p>
                      </div>
                    </div>
                    
                    {/* Favicon */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Globe weight="bold" className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">Favicon</span>
                      </div>
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-32 h-32 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30 overflow-hidden">
                          {settings?.faviconKey ? (
                            <img
                              src={`/favicon.ico?t=${Date.now()}`}
                              alt="Favicon"
                              className="w-16 h-16 object-contain"
                            />
                          ) : (
                            <Globe weight="thin" className="w-12 h-12 text-muted-foreground/50" />
                          )}
                        </div>
                        <input
                          ref={faviconInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
                          onChange={handleFaviconUpload}
                          className="hidden"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleFaviconClick}
                            disabled={isUploadingFavicon}
                          >
                            {isUploadingFavicon ? (
                              <SpinnerGap className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Upload weight="bold" className="w-4 h-4 mr-2" />
                            )}
                            Upload
                          </Button>
                          {settings?.faviconKey && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="text-destructive">
                                  <Trash weight="bold" className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Favicon?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the custom favicon. The browser will use its default icon.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={handleRemoveFavicon} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          PNG, JPEG, SVG, or ICO<br />Max {settings?.maxFaviconSizeMB || 1}MB, auto-generates all sizes
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
