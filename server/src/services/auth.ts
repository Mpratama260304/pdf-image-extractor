import * as argon2 from 'argon2';
import prisma from '../lib/prisma.js';

/**
 * Hash a password using Argon2
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Find admin by email or username
 */
export async function findAdminByCredentials(emailOrUsername: string) {
  return prisma.adminUser.findFirst({
    where: {
      OR: [
        { email: emailOrUsername },
        { username: emailOrUsername },
      ],
    },
  });
}

/**
 * Find admin by ID
 */
export async function findAdminById(id: string) {
  return prisma.adminUser.findUnique({
    where: { id },
  });
}

/**
 * Create a new admin user
 */
export async function createAdmin(
  email: string,
  username: string,
  password: string
) {
  const passwordHash = await hashPassword(password);
  
  return prisma.adminUser.create({
    data: {
      email,
      username,
      passwordHash,
    },
  });
}

/**
 * Check if any admin exists
 */
export async function adminExists(): Promise<boolean> {
  const count = await prisma.adminUser.count();
  return count > 0;
}
