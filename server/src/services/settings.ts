import prisma from '../lib/prisma.js';
import * as argon2 from 'argon2';

const SINGLETON_ID = 'singleton';

/**
 * Settings data structure
 */
export interface SiteSettings {
  id: string;
  siteTitle: string;
  siteDescription: string;
  adminLogoKey: string | null;
  faviconKey: string | null;
  updatedAt: Date;
}

/**
 * Get the current settings (creates default if not exists)
 */
export async function getSettings(): Promise<SiteSettings> {
  let settings = await prisma.settings.findUnique({
    where: { id: SINGLETON_ID },
  });

  if (!settings) {
    // Create default settings
    settings = await prisma.settings.create({
      data: {
        id: SINGLETON_ID,
        siteTitle: 'PDF Image Extractor',
        siteDescription: 'Extract images from PDF files easily',
      },
    });
  }

  return settings;
}

/**
 * Update site settings
 */
export async function updateSettings(data: {
  siteTitle?: string;
  siteDescription?: string;
  adminLogoKey?: string | null;
  faviconKey?: string | null;
}): Promise<SiteSettings> {
  // Ensure settings exist first
  await getSettings();

  return prisma.settings.update({
    where: { id: SINGLETON_ID },
    data: {
      ...(data.siteTitle !== undefined && { siteTitle: data.siteTitle }),
      ...(data.siteDescription !== undefined && { siteDescription: data.siteDescription }),
      ...(data.adminLogoKey !== undefined && { adminLogoKey: data.adminLogoKey }),
      ...(data.faviconKey !== undefined && { faviconKey: data.faviconKey }),
    },
  });
}

/**
 * Update admin profile (email, username)
 */
export async function updateAdminProfile(
  adminId: string,
  data: {
    email?: string;
    username?: string;
  }
) {
  return prisma.adminUser.update({
    where: { id: adminId },
    data: {
      ...(data.email !== undefined && { email: data.email }),
      ...(data.username !== undefined && { username: data.username }),
    },
    select: {
      id: true,
      email: true,
      username: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Update admin password
 */
export async function updateAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // Get current user with password hash
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
  });

  if (!admin) {
    return { success: false, error: 'Admin user not found' };
  }

  // Verify current password
  const isValid = await argon2.verify(admin.passwordHash, currentPassword);
  if (!isValid) {
    return { success: false, error: 'Current password is incorrect' };
  }

  // Hash new password
  const newPasswordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Update password
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { passwordHash: newPasswordHash },
  });

  return { success: true };
}

/**
 * Check if email is already taken by another admin
 */
export async function isEmailTaken(email: string, excludeAdminId?: string): Promise<boolean> {
  const existing = await prisma.adminUser.findFirst({
    where: {
      email,
      ...(excludeAdminId && { id: { not: excludeAdminId } }),
    },
  });
  return !!existing;
}

/**
 * Check if username is already taken by another admin
 */
export async function isUsernameTaken(username: string, excludeAdminId?: string): Promise<boolean> {
  const existing = await prisma.adminUser.findFirst({
    where: {
      username,
      ...(excludeAdminId && { id: { not: excludeAdminId } }),
    },
  });
  return !!existing;
}
