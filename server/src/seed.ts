import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../.env') });

import prisma from './lib/prisma.js';
import { adminExists, createAdmin } from './services/auth.js';

async function seed() {
  console.log('Starting database seed...');
  
  const email = process.env.ADMIN_EMAIL;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  
  if (!email || !username || !password) {
    console.error('Error: ADMIN_EMAIL, ADMIN_USERNAME, and ADMIN_PASSWORD must be set');
    console.error('Set these in your .env file or as environment variables');
    process.exit(1);
  }
  
  try {
    const hasAdmin = await adminExists();
    
    if (hasAdmin) {
      console.log('Admin user already exists. Skipping seed.');
    } else {
      const admin = await createAdmin(email, username, password);
      console.log(`Admin user created successfully:`);
      console.log(`  Email: ${admin.email}`);
      console.log(`  Username: ${admin.username}`);
    }
    
    console.log('Seed complete!');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
