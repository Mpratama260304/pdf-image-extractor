-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "siteTitle" TEXT NOT NULL DEFAULT 'PDF Image Extractor',
    "siteDescription" TEXT NOT NULL DEFAULT 'Extract images from PDF files easily',
    "adminLogoKey" TEXT,
    "faviconKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
