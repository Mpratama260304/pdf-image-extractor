import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../../.env') });

// Detect Railway/cloud environment
const isRailway = !!process.env.RAILWAY_STATIC_URL || !!process.env.RAILWAY_PUBLIC_DOMAIN;
const isRender = !!process.env.RENDER;
const isProduction = process.env.NODE_ENV === 'production';
const isCloudEnvironment = isRailway || isRender || isProduction;

// Helper to generate a random secret (for dev only)
function generateDevSecret(): string {
  return crypto.randomBytes(48).toString('hex');
}

// Handle JWT_SECRET with clear error messages
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  
  if (secret && secret.length >= 32) {
    return secret;
  }
  
  // In production/cloud: HARD FAIL with clear instructions
  if (isCloudEnvironment) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ FATAL: JWT_SECRET environment variable is missing or invalid');
    console.error('='.repeat(70));
    console.error('\nJWT_SECRET is REQUIRED for production deployments.');
    console.error('It must be at least 32 characters long.\n');
    console.error('📋 HOW TO FIX:\n');
    
    if (isRailway) {
      console.error('   Railway:');
      console.error('   1. Go to your Railway project dashboard');
      console.error('   2. Click on your service → Variables tab');
      console.error('   3. Add: JWT_SECRET = <your-secret-here>\n');
    } else if (isRender) {
      console.error('   Render:');
      console.error('   1. Go to your Render dashboard');
      console.error('   2. Click on your service → Environment tab');
      console.error('   3. Add: JWT_SECRET = <your-secret-here>\n');
    } else {
      console.error('   Set the JWT_SECRET environment variable in your deployment platform.\n');
    }
    
    console.error('🔑 Generate a secure secret with:');
    console.error('   node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    console.error('   Example (DO NOT USE THIS - generate your own!):');
    console.error('   JWT_SECRET=' + generateDevSecret().substring(0, 20) + '...\n');
    console.error('='.repeat(70) + '\n');
    
    // Exit cleanly with code 1 (no restart loop)
    process.exit(1);
  }
  
  // In development: Auto-generate with warning
  const devSecret = generateDevSecret();
  console.warn('\n' + '⚠'.repeat(35));
  console.warn('⚠️  WARNING: JWT_SECRET not set - using auto-generated secret');
  console.warn('   This is ONLY safe for local development!');
  console.warn('   Sessions will be invalidated on server restart.');
  console.warn('   For production, set JWT_SECRET in your .env file or environment.');
  console.warn('⚠'.repeat(35) + '\n');
  
  return devSecret;
}

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().default('file:./dev.db'),
  
  // Admin credentials (for seeding)
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  
  // JWT - handled separately with getJwtSecret()
  JWT_SECRET: z.string().optional(), // Validation done in getJwtSecret()
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Storage
  STORAGE_DIR: z.string().default('./storage'),
  
  // Limits
  MAX_FILE_SIZE_MB: z.string().default('200'),
  MAX_PAGES: z.string().default('500'),
  
  // Branding upload limits (in MB)
  ADMIN_LOGO_MAX_SIZE_MB: z.string().default('2'),
  FAVICON_MAX_SIZE_MB: z.string().default('1'),
  
  // URLs
  PUBLIC_BASE_URL: z.string().url().optional(),
  
  // Cleanup
  EXTRACTION_EXPIRY_DAYS: z.string().default('7'),
  ENABLE_AUTO_CLEANUP: z.string().default('true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n' + '='.repeat(70));
  console.error('❌ Invalid environment variables:');
  console.error('='.repeat(70) + '\n');
  
  const errors = parsed.error.flatten().fieldErrors;
  for (const [field, messages] of Object.entries(errors)) {
    console.error(`  ${field}:`);
    messages?.forEach(msg => console.error(`    - ${msg}`));
  }
  
  console.error('\n📋 Required environment variables:');
  console.error('   - JWT_SECRET: Authentication secret (min 32 chars)');
  console.error('   - DATABASE_URL: Database connection string (optional, defaults to SQLite)');
  console.error('   - STORAGE_DIR: Directory for file storage (optional, defaults to ./storage)');
  console.error('\n📄 Copy .env.example to .env and configure your values.');
  console.error('   cp .env.example .env\n');
  console.error('='.repeat(70) + '\n');
  
  process.exit(1);
}

// Get JWT_SECRET (with proper validation and dev fallback)
const jwtSecret = getJwtSecret();

export const env = {
  PORT: parseInt(parsed.data.PORT, 10),
  HOST: parsed.data.HOST,
  NODE_ENV: parsed.data.NODE_ENV,
  DATABASE_URL: parsed.data.DATABASE_URL,
  ADMIN_EMAIL: parsed.data.ADMIN_EMAIL,
  ADMIN_USERNAME: parsed.data.ADMIN_USERNAME,
  ADMIN_PASSWORD: parsed.data.ADMIN_PASSWORD,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: parsed.data.JWT_EXPIRES_IN,
  STORAGE_DIR: parsed.data.STORAGE_DIR,
  MAX_FILE_SIZE_MB: parseInt(parsed.data.MAX_FILE_SIZE_MB, 10),
  MAX_PAGES: parseInt(parsed.data.MAX_PAGES, 10),
  ADMIN_LOGO_MAX_SIZE_MB: parseInt(parsed.data.ADMIN_LOGO_MAX_SIZE_MB, 10),
  FAVICON_MAX_SIZE_MB: parseInt(parsed.data.FAVICON_MAX_SIZE_MB, 10),
  PUBLIC_BASE_URL: parsed.data.PUBLIC_BASE_URL,
  EXTRACTION_EXPIRY_DAYS: parseInt(parsed.data.EXTRACTION_EXPIRY_DAYS, 10),
  ENABLE_AUTO_CLEANUP: parsed.data.ENABLE_AUTO_CLEANUP === 'true',
  
  // Derived
  MAX_FILE_SIZE_BYTES: parseInt(parsed.data.MAX_FILE_SIZE_MB, 10) * 1024 * 1024,
  ADMIN_LOGO_MAX_SIZE_BYTES: parseInt(parsed.data.ADMIN_LOGO_MAX_SIZE_MB, 10) * 1024 * 1024,
  FAVICON_MAX_SIZE_BYTES: parseInt(parsed.data.FAVICON_MAX_SIZE_MB, 10) * 1024 * 1024,
  IS_PRODUCTION: parsed.data.NODE_ENV === 'production',
  IS_DEVELOPMENT: parsed.data.NODE_ENV === 'development',
  IS_RAILWAY: isRailway,
  IS_RENDER: isRender,
};

export type Env = typeof env;
