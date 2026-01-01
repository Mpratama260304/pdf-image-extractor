import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { findAdminByCredentials, verifyPassword, findAdminById } from '../services/auth.js';
import {
  listExtractions,
  getExtractionById,
  deleteExtraction,
  updateShareLink,
  regenerateShareToken,
  getAdminStats,
  bulkDeleteExtractions,
  bulkUpdateExpiry,
  getBulkInfo,
  createShareLink,
} from '../services/extraction.js';
import { runCleanupNow } from '../services/cleanup.js';
import {
  getSettings,
  updateSettings,
  updateAdminProfile,
  updateAdminPassword,
  isEmailTaken,
  isUsernameTaken,
} from '../services/settings.js';
import {
  saveAdminLogo,
  saveFavicon,
  cleanupOldBrandingFiles,
  readBrandingFile,
  getMimeFromExtension,
} from '../services/branding.js';
import {
  loginSchema,
  adminPaginationSchema,
  extractionIdParamSchema,
  shareTokenParamSchema,
  updateShareLinkSchema,
  bulkDeleteSchema,
  bulkUpdateExpirySchema,
  updateSettingsSchema,
  updateProfileSchema,
  updatePasswordSchema,
} from './schemas.js';

// JWT payload type
interface JWTPayload {
  id: string;
  email: string;
  username: string;
}

// Request with user attached
interface AuthenticatedRequest extends FastifyRequest {
  adminUser?: JWTPayload;
}

export async function adminRoutes(fastify: FastifyInstance) {
  // Authentication middleware
  const authenticate = async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const token = (request as any).cookies?.auth_token;
      
      if (!token) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }
      
      const decoded = (fastify as any).jwt.verify(token) as JWTPayload;
      
      // Verify user still exists
      const admin = await findAdminById(decoded.id);
      if (!admin) {
        return reply.status(401).send({
          success: false,
          error: 'User not found',
        });
      }
      
      request.adminUser = decoded;
    } catch (error) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid or expired token',
      });
    }
  };
  
  // POST /api/admin/login
  fastify.post('/api/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);
      
      const admin = await findAdminByCredentials(body.emailOrUsername);
      
      if (!admin) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid credentials',
        });
      }
      
      const passwordValid = await verifyPassword(admin.passwordHash, body.password);
      
      if (!passwordValid) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid credentials',
        });
      }
      
      // Generate JWT
      const token = fastify.jwt.sign({
        id: admin.id,
        email: admin.email,
        username: admin.username,
      });
      
      // Set HTTP-only cookie
      reply.setCookie('auth_token', token, {
        httpOnly: true,
        secure: env.IS_PRODUCTION,
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });
      
      return reply.send({
        success: true,
        data: {
          user: {
            id: admin.id,
            email: admin.email,
            username: admin.username,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        });
      }
      
      console.error('Login error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Login failed',
      });
    }
  });
  
  // POST /api/admin/logout
  fastify.post('/api/admin/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('auth_token', { path: '/' });
    
    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  });
  
  // GET /api/admin/me - Get current user
  fastify.get('/api/admin/me', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!authRequest.adminUser) {
      return reply.status(401).send({
        success: false,
        error: 'Not authenticated',
      });
    }
    
    return reply.send({
      success: true,
      data: {
        user: authRequest.adminUser,
      },
    });
  });
  
  // GET /api/admin/stats - Get dashboard statistics
  fastify.get('/api/admin/stats', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await getAdminStats();
      
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Stats error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch stats',
      });
    }
  });
  
  // GET /api/admin/extractions - List all extractions with filters
  fastify.get('/api/admin/extractions', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = adminPaginationSchema.parse(request.query);
      
      const result = await listExtractions(query);
      
      return reply.send({
        success: true,
        data: {
          items: result.extractions.map((ext) => {
            // Get the best share link: prefer public, non-expired, newest
            const bestShare = ext.shareLinks.find(l => l.isPublic && (!l.expiresAt || l.expiresAt > new Date()))
              ?? ext.shareLinks.find(l => !l.expiresAt || l.expiresAt > new Date())
              ?? ext.shareLinks[0]
              ?? null;
            
            return {
              id: ext.id,
              originalFilename: ext.originalFilename,
              sizeBytes: ext.sizeBytes,
              sha256: ext.sha256,
              pageCount: ext.pageCount,
              imageCount: ext.imageCount,
              status: ext.status,
              errorMessage: ext.errorMessage,
              createdAt: ext.createdAt.toISOString(),
              expiresAt: ext.expiresAt?.toISOString() || null,
              // Top-level share token for easy access (null if no share link exists)
              shareToken: bestShare?.token ?? null,
              shareLinks: ext.shareLinks.map((link) => ({
                token: link.token,
                sharePath: `/s/${link.token}`,
                isPublic: link.isPublic,
                accessCount: link.accessCount,
                lastAccessedAt: link.lastAccessedAt?.toISOString() || null,
                expiresAt: link.expiresAt?.toISOString() || null,
              })),
            };
          }),
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid query parameters',
        });
      }
      
      console.error('List extractions error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list extractions',
      });
    }
  });
  
  // GET /api/admin/extractions/:id - Get extraction details
  fastify.get('/api/admin/extractions/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = extractionIdParamSchema.parse(request.params);
      
      const extraction = await getExtractionById(params.id);
      
      if (!extraction) {
        return reply.status(404).send({
          success: false,
          error: 'Extraction not found',
        });
      }
      
      return reply.send({
        success: true,
        data: {
          id: extraction.id,
          originalFilename: extraction.originalFilename,
          sizeBytes: extraction.sizeBytes,
          sha256: extraction.sha256,
          pageCount: extraction.pageCount,
          imageCount: extraction.imageCount,
          status: extraction.status,
          errorMessage: extraction.errorMessage,
          createdAt: extraction.createdAt.toISOString(),
          expiresAt: extraction.expiresAt?.toISOString() || null,
          images: extraction.images.map((img) => ({
            id: img.id,
            filename: img.filename,
            width: img.width,
            height: img.height,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            pageNumber: img.pageNumber,
          })),
          shareLinks: extraction.shareLinks.map((link) => ({
            id: link.id,
            token: link.token,
            sharePath: `/s/${link.token}`,
            isPublic: link.isPublic,
            accessCount: link.accessCount,
            lastAccessedAt: link.lastAccessedAt?.toISOString() || null,
            expiresAt: link.expiresAt?.toISOString() || null,
            createdAt: link.createdAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid parameters',
        });
      }
      
      console.error('Get extraction error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get extraction',
      });
    }
  });
  
  // DELETE /api/admin/extractions/:id - Delete extraction
  fastify.delete('/api/admin/extractions/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = extractionIdParamSchema.parse(request.params);
      
      const deleted = await deleteExtraction(params.id);
      
      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: 'Extraction not found',
        });
      }
      
      return reply.send({
        success: true,
        message: 'Extraction deleted successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid parameters',
        });
      }
      
      console.error('Delete extraction error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete extraction',
      });
    }
  });
  
  // PATCH /api/admin/shares/:token - Update share link
  fastify.patch('/api/admin/shares/:token', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = shareTokenParamSchema.parse(request.params);
      const body = updateShareLinkSchema.parse(request.body);
      
      let token = params.token;
      
      // Regenerate token if requested
      if (body.regenerateToken) {
        const updated = await regenerateShareToken(params.token);
        token = updated.token;
      }
      
      // Update other fields
      const updates: Parameters<typeof updateShareLink>[1] = {};
      
      if (body.isPublic !== undefined) {
        updates.isPublic = body.isPublic;
      }
      
      if (body.expiresAt !== undefined) {
        updates.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      }
      
      if (Object.keys(updates).length > 0) {
        await updateShareLink(token, updates);
      }
      
      return reply.send({
        success: true,
        data: {
          token,
          sharePath: `/s/${token}`,
        },
        message: 'Share link updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
        });
      }
      
      console.error('Update share link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update share link',
      });
    }
  });
  
  // POST /api/admin/cleanup - Run cleanup now
  fastify.post('/api/admin/cleanup', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const deletedCount = await runCleanupNow();
      
      return reply.send({
        success: true,
        data: { deletedCount },
        message: `Cleanup complete. Deleted ${deletedCount} expired extractions.`,
      });
    } catch (error) {
      console.error('Cleanup error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Cleanup failed',
      });
    }
  });
  
  // POST /api/admin/extractions/:id/shares - Create a share link for an extraction
  fastify.post('/api/admin/extractions/:id/shares', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = extractionIdParamSchema.parse(request.params);
      
      // Check extraction exists
      const extraction = await getExtractionById(params.id);
      if (!extraction) {
        return reply.status(404).send({
          success: false,
          error: 'Extraction not found',
        });
      }
      
      // Create share link
      const shareLink = await createShareLink(params.id, true);
      
      return reply.send({
        success: true,
        data: {
          token: shareLink.token,
          sharePath: `/s/${shareLink.token}`,
          isPublic: shareLink.isPublic,
        },
        message: 'Share link created successfully',
      });
    } catch (error) {
      console.error('Create share link error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create share link',
      });
    }
  });
  
  // POST /api/admin/extractions/bulk-delete - Bulk delete extractions
  fastify.post('/api/admin/extractions/bulk-delete', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = bulkDeleteSchema.parse(request.body);
      
      const result = await bulkDeleteExtractions(body.ids);
      
      return reply.send({
        success: true,
        data: result,
        message: `Deleted ${result.deleted} extraction(s)${result.failed.length > 0 ? `, ${result.failed.length} failed` : ''}`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
        });
      }
      
      console.error('Bulk delete error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Bulk delete failed',
      });
    }
  });
  
  // POST /api/admin/extractions/bulk-expiry - Bulk update expiry
  fastify.post('/api/admin/extractions/bulk-expiry', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = bulkUpdateExpirySchema.parse(request.body);
      
      const result = await bulkUpdateExpiry(body.ids, body.expiresAt ? new Date(body.expiresAt) : null);
      
      return reply.send({
        success: true,
        data: result,
        message: `Updated expiry for ${result.updated} extraction(s)`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
        });
      }
      
      console.error('Bulk expiry update error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Bulk expiry update failed',
      });
    }
  });
  
  // POST /api/admin/extractions/bulk-info - Get info for bulk operations
  fastify.post('/api/admin/extractions/bulk-info', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = bulkDeleteSchema.parse(request.body);
      
      const info = await getBulkInfo(body.ids);
      
      return reply.send({
        success: true,
        data: info,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
        });
      }
      
      console.error('Bulk info error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get bulk info',
      });
    }
  });

  // =====================
  // Settings Routes
  // =====================

  // Allowed file types for uploads
  const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  const ALLOWED_FAVICON_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];

  // GET /api/admin/settings - Get site settings
  fastify.get('/api/admin/settings', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await getSettings();
      
      return reply.send({
        success: true,
        data: {
          siteTitle: settings.siteTitle,
          siteDescription: settings.siteDescription,
          adminLogoKey: settings.adminLogoKey,
          faviconKey: settings.faviconKey,
          adminLogoUrl: settings.adminLogoKey ? '/branding/admin-logo' : null,
          faviconUrl: settings.faviconKey ? '/favicon.ico' : null,
          allowedLogoTypes: ALLOWED_LOGO_TYPES,
          allowedFaviconTypes: ALLOWED_FAVICON_TYPES,
          maxLogoSizeMB: env.ADMIN_LOGO_MAX_SIZE_MB,
          maxFaviconSizeMB: env.FAVICON_MAX_SIZE_MB,
          updatedAt: settings.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Get settings error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get settings',
      });
    }
  });

  // PATCH /api/admin/settings - Update site settings
  fastify.patch('/api/admin/settings', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = updateSettingsSchema.parse(request.body);
      
      const settings = await updateSettings(body);
      
      return reply.send({
        success: true,
        data: {
          siteTitle: settings.siteTitle,
          siteDescription: settings.siteDescription,
          adminLogoKey: settings.adminLogoKey,
          faviconKey: settings.faviconKey,
          updatedAt: settings.updatedAt.toISOString(),
        },
        message: 'Settings updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid settings data',
        });
      }
      
      console.error('Update settings error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update settings',
      });
    }
  });

  // POST /api/admin/settings/admin-logo - Upload admin logo
  // Rate limited: 10 uploads per 15 minutes per IP
  fastify.post('/api/admin/settings/admin-logo', { 
    preHandler: authenticate,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: 'No file uploaded',
        });
      }
      
      const buffer = await data.toBuffer();
      
      // Check file size (configurable via env, default 2MB for logos)
      if (buffer.length > env.ADMIN_LOGO_MAX_SIZE_BYTES) {
        return reply.status(400).send({
          success: false,
          error: `File too large. Maximum size is ${env.ADMIN_LOGO_MAX_SIZE_MB}MB`,
        });
      }
      
      const result = await saveAdminLogo(buffer, data.mimetype, data.filename);
      
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
        });
      }
      
      // Get current settings to cleanup old logo
      const currentSettings = await getSettings();
      if (currentSettings.adminLogoKey && currentSettings.adminLogoKey !== result.key) {
        await cleanupOldBrandingFiles(currentSettings.adminLogoKey);
      }
      
      // Update settings with new logo key
      const settings = await updateSettings({ adminLogoKey: result.key });
      
      return reply.send({
        success: true,
        data: {
          adminLogoKey: settings.adminLogoKey,
          logoUrl: `/branding/admin-logo`,
        },
        message: 'Logo uploaded successfully',
      });
    } catch (error) {
      console.error('Upload logo error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to upload logo',
      });
    }
  });

  // DELETE /api/admin/settings/admin-logo - Remove admin logo
  fastify.delete('/api/admin/settings/admin-logo', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentSettings = await getSettings();
      
      if (currentSettings.adminLogoKey) {
        await cleanupOldBrandingFiles(currentSettings.adminLogoKey);
      }
      
      await updateSettings({ adminLogoKey: null });
      
      return reply.send({
        success: true,
        message: 'Logo removed successfully',
      });
    } catch (error) {
      console.error('Remove logo error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to remove logo',
      });
    }
  });

  // POST /api/admin/settings/favicon - Upload favicon
  // Rate limited: 10 uploads per 15 minutes per IP
  fastify.post('/api/admin/settings/favicon', { 
    preHandler: authenticate,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: 'No file uploaded',
        });
      }
      
      const buffer = await data.toBuffer();
      
      // Check file size (configurable via env, default 1MB for favicons)
      if (buffer.length > env.FAVICON_MAX_SIZE_BYTES) {
        return reply.status(400).send({
          success: false,
          error: `File too large. Maximum size is ${env.FAVICON_MAX_SIZE_MB}MB`,
        });
      }
      
      const result = await saveFavicon(buffer, data.mimetype, data.filename);
      
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
        });
      }
      
      // Get current settings to cleanup old favicon
      const currentSettings = await getSettings();
      if (currentSettings.faviconKey && currentSettings.faviconKey !== result.key) {
        await cleanupOldBrandingFiles(currentSettings.faviconKey);
      }
      
      // Update settings with new favicon key
      const settings = await updateSettings({ faviconKey: result.key });
      
      return reply.send({
        success: true,
        data: {
          faviconKey: settings.faviconKey,
          generatedFiles: result.generatedFiles,
          faviconUrl: `/favicon.ico`,
        },
        message: 'Favicon uploaded successfully',
      });
    } catch (error) {
      console.error('Upload favicon error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to upload favicon',
      });
    }
  });

  // DELETE /api/admin/settings/favicon - Remove favicon
  fastify.delete('/api/admin/settings/favicon', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentSettings = await getSettings();
      
      if (currentSettings.faviconKey) {
        await cleanupOldBrandingFiles(currentSettings.faviconKey);
      }
      
      await updateSettings({ faviconKey: null });
      
      return reply.send({
        success: true,
        message: 'Favicon removed successfully',
      });
    } catch (error) {
      console.error('Remove favicon error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to remove favicon',
      });
    }
  });

  // =====================
  // Profile Routes
  // =====================

  // PATCH /api/admin/profile - Update admin profile (email/username)
  fastify.patch('/api/admin/profile', { preHandler: authenticate }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = updateProfileSchema.parse(request.body);
      const adminId = request.adminUser!.id;
      
      // Check if email is taken by another user
      if (body.email) {
        const emailTaken = await isEmailTaken(body.email, adminId);
        if (emailTaken) {
          return reply.status(400).send({
            success: false,
            error: 'Email is already in use',
          });
        }
      }
      
      // Check if username is taken by another user
      if (body.username) {
        const usernameTaken = await isUsernameTaken(body.username, adminId);
        if (usernameTaken) {
          return reply.status(400).send({
            success: false,
            error: 'Username is already in use',
          });
        }
      }
      
      const updatedAdmin = await updateAdminProfile(adminId, body);
      
      // Generate new JWT with updated info
      const token = fastify.jwt.sign({
        id: updatedAdmin.id,
        email: updatedAdmin.email,
        username: updatedAdmin.username,
      });
      
      // Set updated cookie
      reply.setCookie('auth_token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      
      return reply.send({
        success: true,
        data: {
          user: {
            id: updatedAdmin.id,
            email: updatedAdmin.email,
            username: updatedAdmin.username,
          },
        },
        message: 'Profile updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid profile data',
        });
      }
      
      console.error('Update profile error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update profile',
      });
    }
  });

  // PATCH /api/admin/profile/password - Update admin password
  fastify.patch('/api/admin/profile/password', { preHandler: authenticate }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const body = updatePasswordSchema.parse(request.body);
      const adminId = request.adminUser!.id;
      
      const result = await updateAdminPassword(adminId, body.currentPassword, body.newPassword);
      
      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
        });
      }
      
      return reply.send({
        success: true,
        message: 'Password updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: error.errors[0]?.message || 'Invalid password data',
        });
      }
      
      console.error('Update password error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update password',
      });
    }
  });
}
