import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===========================================
// PhalaCloud/Docker Compatible Configuration
// ===========================================
// This module reads config from:
// 1. process.env (primary)
// 2. /data/secrets/* fallback files (for PhalaCloud without .env support)
// 
// NO dotenv/.env file loading - all config comes from env vars or on-disk fallback

// Base data directory (mounted volume in Docker)
const DATA_DIR = process.env.DATA_DIR || '/data';
const SECRETS_DIR = join(DATA_DIR, 'secrets');
const CONFIG_DIR = join(DATA_DIR, 'config');

// Detect cloud environments
const isRailway = !!process.env.RAILWAY_STATIC_URL || !!process.env.RAILWAY_PUBLIC_DOMAIN;
const isRender = !!process.env.RENDER;
const isPhalaCloud = !!process.env.PHALA_CLOUD || (existsSync('/data') && process.env.NODE_ENV === 'production');
const isProduction = process.env.NODE_ENV === 'production';
const isCloudEnvironment = isRailway || isRender || isPhalaCloud || isProduction;

// ===========================================
// Secret File Helpers
// ===========================================

/**
 * Ensure a directory exists
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (e) {
      // Ignore errors if directory exists or can't be created
    }
  }
}

/**
 * Read a secret from file if it exists
 */
function readSecretFile(filename: string): string | null {
  const filepath = join(SECRETS_DIR, filename);
  try {
    if (existsSync(filepath)) {
      return readFileSync(filepath, 'utf-8').trim();
    }
  } catch (e) {
    // Ignore read errors
  }
  return null;
}

/**
 * Write a secret to file with secure permissions
 */
function writeSecretFile(filename: string, content: string): boolean {
  ensureDir(SECRETS_DIR);
  const filepath = join(SECRETS_DIR, filename);
  try {
    writeFileSync(filepath, content, { mode: 0o600 });
    // Try to set permissions (may fail on some systems)
    try {
      chmodSync(filepath, 0o600);
    } catch (e) {
      // Ignore chmod errors
    }
    return true;
  } catch (e) {
    console.error(`Failed to write secret file ${filename}:`, e);
    return false;
  }
}

/**
 * Generate a cryptographically secure random string
 */
function generateSecureSecret(bytes: number = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// ===========================================
// JWT Secret with Persistent Fallback
// ===========================================

function getJwtSecret(): string {
  // 1. First check environment variable
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }

  // 2. Check persisted secret file
  const persistedSecret = readSecretFile('jwt_secret');
  if (persistedSecret && persistedSecret.length >= 32) {
    console.log('✓ JWT_SECRET loaded from /data/secrets/jwt_secret');
    return persistedSecret;
  }

  // 3. Generate and persist a new secret
  const newSecret = generateSecureSecret(48);
  const saved = writeSecretFile('jwt_secret', newSecret);
  
  if (saved) {
    console.log('');
    console.log('='.repeat(70));
    console.log('⚠️  JWT_SECRET not set; generated and persisted at /data/secrets/jwt_secret');
    console.log('='.repeat(70));
    console.log('');
    console.log('   This secret will be reused across container restarts.');
    console.log('   For better security, set JWT_SECRET environment variable explicitly.');
    console.log('');
  } else {
    // Couldn't persist - use ephemeral secret with warning
    console.warn('');
    console.warn('='.repeat(70));
    console.warn('⚠️  WARNING: JWT_SECRET auto-generated but could NOT be persisted!');
    console.warn('   Sessions will be invalidated on container restart.');
    console.warn('   Mount /data volume to persist secrets.');
    console.warn('='.repeat(70));
    console.warn('');
  }
  
  return newSecret;
}

// ===========================================
// Database URL with Defaults
// ===========================================

function getDatabaseUrl(): string {
  // Check env first
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  // Default to SQLite in /data/db for persistence
  const dbDir = join(DATA_DIR, 'db');
  ensureDir(dbDir);
  return `file:${join(dbDir, 'prod.db')}`;
}

// ===========================================
// Storage Directory with Defaults  
// ===========================================

function getStorageDir(): string {
  if (process.env.STORAGE_DIR) {
    return process.env.STORAGE_DIR;
  }
  
  // Default to /data/storage for persistence
  const storageDir = join(DATA_DIR, 'storage');
  ensureDir(storageDir);
  return storageDir;
}

// ===========================================
// Environment Schema & Parsing
// ===========================================

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database - handled separately with getDatabaseUrl()
  DATABASE_URL: z.string().optional(),
  
  // Admin credentials (for seeding) - optional, fallback handled in seeding
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  
  // JWT - handled separately with getJwtSecret()
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Storage - handled separately with getStorageDir()
  STORAGE_DIR: z.string().optional(),
  
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
  
  console.error('\n📋 Environment variables can be set via:');
  console.error('   - docker-compose.yml environment block');
  console.error('   - Platform environment variables (Railway, Render, PhalaCloud)');
  console.error('   - Files in /data/secrets/ for secrets (JWT_SECRET)');
  console.error('='.repeat(70) + '\n');
  
  process.exit(1);
}

// Get values with fallbacks
const jwtSecret = getJwtSecret();
const databaseUrl = getDatabaseUrl();
const storageDir = getStorageDir();

export const env = {
  PORT: parseInt(parsed.data.PORT, 10),
  HOST: parsed.data.HOST,
  NODE_ENV: parsed.data.NODE_ENV,
  DATABASE_URL: databaseUrl,
  ADMIN_EMAIL: parsed.data.ADMIN_EMAIL,
  ADMIN_USERNAME: parsed.data.ADMIN_USERNAME,
  ADMIN_PASSWORD: parsed.data.ADMIN_PASSWORD,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: parsed.data.JWT_EXPIRES_IN,
  STORAGE_DIR: storageDir,
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
  IS_PHALA_CLOUD: isPhalaCloud,
  
  // Directories
  DATA_DIR,
  SECRETS_DIR,
  CONFIG_DIR,
};

// Export helper functions for use elsewhere
export { generateSecureSecret, writeSecretFile, readSecretFile, ensureDir };

export type Env = typeof env;
