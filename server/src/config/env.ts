import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../../.env') });

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
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Storage
  STORAGE_DIR: z.string().default('./storage'),
  
  // Limits
  MAX_FILE_SIZE_MB: z.string().default('200'),
  MAX_PAGES: z.string().default('500'),
  
  // URLs
  PUBLIC_BASE_URL: z.string().url().optional(),
  
  // Cleanup
  EXTRACTION_EXPIRY_DAYS: z.string().default('7'),
  ENABLE_AUTO_CLEANUP: z.string().default('true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  PORT: parseInt(parsed.data.PORT, 10),
  HOST: parsed.data.HOST,
  NODE_ENV: parsed.data.NODE_ENV,
  DATABASE_URL: parsed.data.DATABASE_URL,
  ADMIN_EMAIL: parsed.data.ADMIN_EMAIL,
  ADMIN_USERNAME: parsed.data.ADMIN_USERNAME,
  ADMIN_PASSWORD: parsed.data.ADMIN_PASSWORD,
  JWT_SECRET: parsed.data.JWT_SECRET,
  JWT_EXPIRES_IN: parsed.data.JWT_EXPIRES_IN,
  STORAGE_DIR: parsed.data.STORAGE_DIR,
  MAX_FILE_SIZE_MB: parseInt(parsed.data.MAX_FILE_SIZE_MB, 10),
  MAX_PAGES: parseInt(parsed.data.MAX_PAGES, 10),
  PUBLIC_BASE_URL: parsed.data.PUBLIC_BASE_URL,
  EXTRACTION_EXPIRY_DAYS: parseInt(parsed.data.EXTRACTION_EXPIRY_DAYS, 10),
  ENABLE_AUTO_CLEANUP: parsed.data.ENABLE_AUTO_CLEANUP === 'true',
  
  // Derived
  MAX_FILE_SIZE_BYTES: parseInt(parsed.data.MAX_FILE_SIZE_MB, 10) * 1024 * 1024,
  IS_PRODUCTION: parsed.data.NODE_ENV === 'production',
  IS_DEVELOPMENT: parsed.data.NODE_ENV === 'development',
};

export type Env = typeof env;
