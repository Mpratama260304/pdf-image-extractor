import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import cors from '@fastify/cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { randomBytes } from 'crypto';

import { env, generateSecureSecret, writeSecretFile, readSecretFile, ensureDir } from './config/env.js';
import prisma from './lib/prisma.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { startCleanupScheduler, stopCleanupScheduler } from './services/cleanup.js';
import { adminExists, createAdmin } from './services/auth.js';
import { getSettings } from './services/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: env.IS_DEVELOPMENT ? 'info' : 'warn',
  },
});

// Ensure storage directory exists
function ensureStorageDir() {
  const storageDir = env.STORAGE_DIR;
  const extractionsDir = join(storageDir, 'extractions');
  const brandingDir = join(storageDir, 'branding');
  
  if (!existsSync(storageDir)) {
    mkdirSync(storageDir, { recursive: true });
    console.log(`Created storage directory: ${storageDir}`);
  }
  
  if (!existsSync(extractionsDir)) {
    mkdirSync(extractionsDir, { recursive: true });
    console.log(`Created extractions directory: ${extractionsDir}`);
  }
  
  if (!existsSync(brandingDir)) {
    mkdirSync(brandingDir, { recursive: true });
    console.log(`Created branding directory: ${brandingDir}`);
  }
}

// Seed admin user from environment variables or create default
async function seedAdminUser() {
  const hasAdmin = await adminExists();
  
  if (hasAdmin) {
    // Admin already exists, nothing to do
    return;
  }
  
  // Try to use environment variables first
  if (env.ADMIN_EMAIL && env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
    console.log('Seeding initial admin user from environment...');
    
    try {
      const admin = await createAdmin(env.ADMIN_EMAIL, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
      console.log(`✓ Admin user created: ${admin.email} (${admin.username})`);
    } catch (error) {
      console.error('Failed to seed admin user:', error);
    }
    return;
  }
  
  // No env vars provided - create default admin with random password
  console.log('');
  console.log('='.repeat(70));
  console.log('Creating default admin user...');
  console.log('='.repeat(70));
  
  const defaultEmail = 'admin@local';
  const defaultUsername = 'admin';
  
  // Check if we already have a persisted initial password
  let initialPassword = readSecretFile('admin_initial_password.txt');
  let isNewPassword = false;
  
  if (!initialPassword) {
    // Generate a new secure password
    initialPassword = generateSecureSecret(16); // 32 hex chars = strong password
    isNewPassword = true;
  }
  
  try {
    const admin = await createAdmin(defaultEmail, defaultUsername, initialPassword);
    
    // Persist the password to /data/secrets
    if (isNewPassword) {
      const saved = writeSecretFile('admin_initial_password.txt', initialPassword);
      if (saved) {
        console.log('');
        console.log('✓ Default admin user created:');
        console.log(`   Email:    ${admin.email}`);
        console.log(`   Username: ${admin.username}`);
        console.log('');
        console.log('   Initial password saved to: /data/secrets/admin_initial_password.txt');
        console.log('   ⚠️  Please change this password after first login!');
        console.log('');
      } else {
        // Couldn't persist - print password once (security tradeoff for usability)
        console.log('');
        console.log('✓ Default admin user created:');
        console.log(`   Email:    ${admin.email}`);
        console.log(`   Username: ${admin.username}`);
        console.log(`   Password: ${initialPassword}`);
        console.log('');
        console.warn('   ⚠️  WARNING: Could not persist password to /data/secrets/');
        console.warn('      Please save this password and change it after login!');
        console.log('');
      }
    } else {
      console.log('');
      console.log('✓ Admin user restored from persisted credentials');
      console.log(`   Email:    ${admin.email}`);
      console.log(`   Username: ${admin.username}`);
      console.log('   Password: see /data/secrets/admin_initial_password.txt');
      console.log('');
    }
  } catch (error) {
    console.error('Failed to create default admin user:', error);
  }
  
  console.log('='.repeat(70));
  console.log('');
}

async function buildServer() {
  // ==========================================================================
  // PART B & C: Request ID generation and global error handling
  // ==========================================================================
  
  // Add request ID to all requests
  fastify.addHook('onRequest', async (request, reply) => {
    const requestId = request.headers['x-request-id'] as string || 
      `req_${Date.now()}_${randomBytes(4).toString('hex')}`;
    request.requestId = requestId;
    reply.header('x-request-id', requestId);
  });
  
  // Type for Fastify errors with additional properties
  interface FastifyError extends Error {
    statusCode?: number;
    code?: string;
    validation?: unknown;
  }
  
  // Global error handler - ensure all errors return JSON for /api routes
  fastify.setErrorHandler(async (err: FastifyError, request, reply) => {
    const requestId = request.requestId || 'unknown';
    const isApiRoute = request.url.startsWith('/api/');
    
    // Log error with request context
    console.error(`[${requestId}] Error:`, {
      url: request.url,
      method: request.method,
      error: err.message,
      stack: err.stack,
    });
    
    // Always return JSON for API routes
    if (isApiRoute) {
      let statusCode = err.statusCode || 500;
      let errorCode = 'INTERNAL_ERROR';
      let errorMessage = err.message || 'An unexpected error occurred';
      
      // Handle specific error types
      if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
        statusCode = 413;
        errorCode = 'FILE_TOO_LARGE';
        errorMessage = `File size exceeds maximum of ${env.MAX_FILE_SIZE_MB}MB`;
      } else if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        statusCode = 413;
        errorCode = 'PAYLOAD_TOO_LARGE';
        errorMessage = `Request body exceeds maximum size`;
      } else if (err.validation) {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        errorMessage = err.message;
      } else if (statusCode === 429) {
        errorCode = 'RATE_LIMITED';
        errorMessage = 'Too many requests. Please try again later.';
      } else if (statusCode >= 500) {
        errorCode = 'SERVER_ERROR';
        // Don't expose internal error details in production
        if (!env.IS_DEVELOPMENT) {
          errorMessage = 'An internal server error occurred';
        }
      }
      
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
          requestId,
        },
      });
    }
    
    // For non-API routes, use default error handling
    return reply.status(err.statusCode || 500).send(err.message);
  });
  
  // Register plugins
  await fastify.register(cors, {
    origin: env.IS_DEVELOPMENT ? true : false,
    credentials: true,
  });
  
  await fastify.register(cookie, {
    secret: env.JWT_SECRET,
  });
  
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'auth_token',
      signed: false,
    },
  });
  
  await fastify.register(multipart, {
    limits: {
      fileSize: env.MAX_FILE_SIZE_BYTES,
      files: 1,
    },
  });
  
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (request: any) => {
      return request.ip;
    },
  });
  
  // Register API routes
  await fastify.register(publicRoutes);
  await fastify.register(adminRoutes);
  
  // Serve static files in production
  // Frontend dist is at repo root /dist, not server/dist
  // __dirname is server/dist, so go up 2 levels to repo root, then into dist
  const distPath = join(__dirname, '../../dist');
  
  if (existsSync(distPath)) {
    // Register static file serving for the dist folder
    await fastify.register(staticFiles, {
      root: distPath,
      prefix: '/',
      wildcard: true,  // Enable wildcard to serve nested assets
      serve: true,
    });
    
    // Read index.html template once at startup
    const indexHtmlPath = join(distPath, 'index.html');
    let indexHtmlTemplate = '';
    if (existsSync(indexHtmlPath)) {
      indexHtmlTemplate = readFileSync(indexHtmlPath, 'utf-8');
    }
    
    // Helper function to inject metadata into HTML
    async function getInjectedHtml(): Promise<string> {
      if (!indexHtmlTemplate) return '';
      
      try {
        const settings = await getSettings();
        let html = indexHtmlTemplate;
        
        // Inject site title
        html = html.replace(
          /<title>[^<]*<\/title>/,
          `<title>${escapeHtml(settings.siteTitle)}</title>`
        );
        
        // Inject meta description
        const descriptionMeta = `<meta name="description" content="${escapeHtml(settings.siteDescription)}">`;
        if (html.includes('<meta name="description"')) {
          html = html.replace(/<meta name="description"[^>]*>/, descriptionMeta);
        } else {
          html = html.replace('</head>', `    ${descriptionMeta}\n</head>`);
        }
        
        // Inject favicon links if custom favicon exists
        if (settings.faviconKey) {
          const faviconLinks = `
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/branding/favicon-favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/branding/favicon-favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`;
          
          // Remove existing favicon links and add new ones
          html = html.replace(/<link[^>]*rel=["'](?:icon|apple-touch-icon|shortcut icon)["'][^>]*>\s*/gi, '');
          html = html.replace('</head>', `${faviconLinks}\n</head>`);
        }
        
        // Inject Open Graph tags
        const ogTags = `
    <meta property="og:title" content="${escapeHtml(settings.siteTitle)}">
    <meta property="og:description" content="${escapeHtml(settings.siteDescription)}">
    <meta property="og:type" content="website">`;
        
        // Remove existing OG tags and add new ones
        html = html.replace(/<meta property="og:(title|description|type)"[^>]*>\s*/gi, '');
        html = html.replace('</head>', `${ogTags}\n</head>`);
        
        return html;
      } catch (error) {
        console.error('Error injecting metadata:', error);
        return indexHtmlTemplate;
      }
    }
    
    // Helper to escape HTML entities
    function escapeHtml(text: string): string {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
    
    // SPA fallback - serve index.html for all non-API and non-asset routes
    fastify.setNotFoundHandler(async (request, reply: any) => {
      const requestId = request.requestId || 'unknown';
      
      // Don't serve index.html for API routes - return JSON 404
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'API route not found',
            requestId,
          },
        });
      }
      
      // Don't serve index.html for asset requests (they should 404 if not found)
      if (request.url.startsWith('/assets/')) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Asset not found',
            requestId,
          },
        });
      }
      
      // Don't serve index.html for branding routes (they have their own handlers)
      if (request.url.startsWith('/branding/')) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Branding file not found',
            requestId,
          },
        });
      }
      
      // SPA fallback: serve index.html with injected metadata
      const html = await getInjectedHtml();
      if (!html) {
        return reply.sendFile('index.html');
      }
      
      reply.type('text/html').send(html);
    });
    
    console.log(`Serving static files from: ${distPath}`);
  } else {
    console.warn(`Static files directory not found: ${distPath}`);
    console.warn('Run "npm run build" to build the frontend.');
  }
  
  // Health check endpoint
  fastify.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  }));
  
  return fastify;
}

async function start() {
  try {
    ensureStorageDir();
    
    // Connect to database
    await prisma.$connect();
    console.log('Connected to database');
    
    // Seed admin user
    await seedAdminUser();
    
    // Build and start server
    await buildServer();
    
    await fastify.listen({
      port: env.PORT,
      host: env.HOST,
    });
    
    console.log(`Server running at http://${env.HOST}:${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    
    // Start cleanup scheduler
    startCleanupScheduler();
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  stopCleanupScheduler();
  
  await fastify.close();
  await prisma.$disconnect();
  
  console.log('Server shut down successfully');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
