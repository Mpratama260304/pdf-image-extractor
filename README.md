# PDF Image Extractor

A full-stack PDF image extraction application with server-side processing, persistent storage, and public share links. Built with React, TypeScript, Fastify, and Prisma.

## ✨ Features

- 🖼️ **Server-side PDF image extraction** - Reliable Node.js processing with `pdfjs-dist` and `@napi-rs/canvas`
- 🔗 **Public share links** - Share extracted images via URL (like Google Drive/Mediafire)
- 💾 **Persistent storage** - Images and ZIP files saved on server
- 👤 **Admin panel** - Manage extractions, view stats, delete files
- 📦 **ZIP downloads** - Download all images as a ZIP archive
- 🔒 **Secure** - Password hashing, JWT auth, rate limiting
- 🧹 **Auto cleanup** - Scheduled deletion of expired extractions
- 📱 **Responsive UI** - Works on desktop and mobile
- ⚡ **Async processing** - Uploads return immediately (202), frontend polls for completion
- 🛡️ **Robust error handling** - Never fails with "Unexpected token '<'" JSON parse errors

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
# Clone and install dependencies
git clone <repo-url>
cd pdf-image-extractor

# Install all dependencies (root + server)
npm run setup

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your settings (especially JWT_SECRET!)

# Start development servers
npm run dev
```

The app will be running at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Production Build

```bash
# Build both frontend and server
npm run build

# Start production server (serves both API and static files)
npm start
```

## 🚀 Deployment (Railway/Render/Cloud)

### Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ **Yes** | Authentication secret (min 32 chars) |
| `ADMIN_EMAIL` | Recommended | Admin login email |
| `ADMIN_USERNAME` | Recommended | Admin login username |
| `ADMIN_PASSWORD` | Recommended | Admin login password (min 8 chars) |
| `DATABASE_URL` | No | Database URL (defaults to SQLite) |
| `STORAGE_DIR` | No | File storage path (defaults to `/data/storage`) |
| `PORT` | No | Server port (auto-set by Railway/Render) |

### Generate JWT_SECRET

```bash
# Generate a secure 96-character hex string
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**⚠️ JWT_SECRET must be at least 32 characters!**

### Deploy to Railway

1. **Connect Repository**
   - Go to [Railway](https://railway.app)
   - Create new project → Deploy from GitHub repo

2. **Set Environment Variables**
   - Click on your service → **Variables** tab
   - Add required variables:
     ```
     JWT_SECRET=<your-generated-secret-here>
     ADMIN_EMAIL=admin@yourdomain.com
     ADMIN_USERNAME=admin
     ADMIN_PASSWORD=your-secure-password
     STORAGE_DIR=/data/storage
     DATABASE_URL=file:/data/db/prod.db
     ```

3. **Add Persistent Storage** (optional but recommended)
   - Click **+ New** → **Volume**
   - Mount path: `/data`
   - This persists database and extracted files across deploys

4. **Deploy**
   - Railway auto-detects Dockerfile and builds
   - Check logs for successful startup

### Deploy to Render

1. **Create Web Service**
   - Go to [Render](https://render.com)
   - New → Web Service → Connect repo
   - Environment: Docker

2. **Set Environment Variables**
   - Same variables as Railway (see above)

3. **Add Disk** (for persistence)
   - Mount path: `/data`

### Troubleshooting Deployment

**Container keeps restarting with "JWT_SECRET required":**
- Ensure JWT_SECRET is set in your platform's Variables/Environment section
- Verify it's at least 32 characters long

**Database errors:**
- Check DATABASE_URL is correctly formatted
- For SQLite: `file:/data/db/prod.db`
- For PostgreSQL: `postgresql://user:pass@host:5432/dbname`

**Files disappearing after redeploy:**
- Add a persistent volume mounted to `/data`

## 🐳 Deploy on PhalaCloud (Compose-Only)

PhalaCloud only supports `docker-compose.yml` deployment (no `.env` file loading). This app is fully compatible with zero-config deployment.

### Quick Deploy

1. **Push to GitHub** (or any Git provider)
2. **Deploy on PhalaCloud**
   - Select your repository
   - PhalaCloud will use `docker-compose.yml` automatically
   - No environment variables needed for basic deployment!

### How It Works (Zero-Config)

The app automatically handles missing configuration:

| Component | Auto-Generated | Persisted Location |
|-----------|---------------|-------------------|
| JWT Secret | ✅ 96-char hex | `/data/secrets/jwt_secret` |
| Admin User | ✅ Random password | `/data/secrets/admin_initial_password.txt` |
| Database | ✅ SQLite | `/data/db/prod.db` |
| Storage | ✅ Default | `/data/storage/` |

**On first boot:**
1. JWT secret is generated and saved to `/data/secrets/jwt_secret`
2. Default admin is created (username: `admin`, email: `admin@local`)
3. Random password is saved to `/data/secrets/admin_initial_password.txt`
4. SQLite database is initialized at `/data/db/prod.db`

**On subsequent restarts:**
- All secrets and data are loaded from the persistent `/data` volume
- Sessions remain valid (same JWT secret)
- Admin login works (same credentials)

### Retrieve Admin Password

After first deployment, get your admin password:

```bash
# Via PhalaCloud console/SSH:
cat /data/secrets/admin_initial_password.txt
```

Then login at `https://your-app.phala.cloud/admin/login` with:
- Username: `admin`
- Password: (from the file above)

**⚠️ Change your password immediately via Admin Settings!**

### Optional: Set Explicit Credentials

If you prefer explicit credentials, modify `docker-compose.yml`:

```yaml
services:
  app:
    environment:
      # Uncomment and set these:
      - JWT_SECRET=your-secure-secret-at-least-32-chars
      - ADMIN_EMAIL=admin@example.com
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=your-secure-password
```

### PhalaCloud Volume Persistence

The `docker-compose.yml` uses a named volume `app_data` mounted to `/data`:

```yaml
volumes:
  - app_data:/data
```

This persists:
- `/data/db/` - SQLite database
- `/data/storage/` - Uploaded files, extractions, branding
- `/data/secrets/` - JWT secret, admin password

## 📁 Project Structure

```
pdf-image-extractor/
├── src/                    # Frontend React app
│   ├── components/         # UI components
│   ├── contexts/           # React contexts (Auth)
│   ├── lib/                # API client, utilities
│   ├── pages/              # Route pages
│   └── App.tsx             # Main app with routing
├── server/                 # Backend Node.js server
│   ├── src/
│   │   ├── config/         # Environment config
│   │   ├── lib/            # Prisma client
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   └── index.ts        # Server entry
│   └── prisma/
│       └── schema.prisma   # Database schema
├── storage/                # Extracted files (gitignored)
└── dist/                   # Production build output
```

## 🔐 Environment Variables

```bash
# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL="file:./dev.db"

# Admin (for initial seed)
ADMIN_EMAIL=admin@example.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# JWT (REQUIRED - must be at least 32 characters!)
# Generate: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-super-secret-key-minimum-32-characters-long
JWT_EXPIRES_IN=7d

# Storage
STORAGE_DIR=./storage

# Limits
MAX_FILE_SIZE_MB=200
MAX_PAGES=500

# Public URL
PUBLIC_BASE_URL=http://localhost:3001

# Cleanup
EXTRACTION_EXPIRY_DAYS=7
ENABLE_AUTO_CLEANUP=true
```

## 📚 API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/extractions` | Upload PDF and extract images |
| GET | `/api/shares/:token` | Get share link details |
| GET | `/api/shares/:token/download.zip` | Download ZIP file |
| GET | `/api/shares/:token/images/:filename` | Get image file |
| GET | `/api/health` | Health check |

### Admin (requires auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Login with username/email + password |
| POST | `/api/admin/logout` | Logout |
| GET | `/api/admin/me` | Get current user |
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/extractions` | List extractions (paginated) |
| GET | `/api/admin/extractions/:id` | Get extraction details |
| DELETE | `/api/admin/extractions/:id` | Delete extraction |
| PATCH | `/api/admin/shares/:token` | Update share link |
| POST | `/api/admin/cleanup` | Run cleanup now |

## 🛣️ Frontend Routes

| Path | Description |
|------|-------------|
| `/` | Home page - upload PDF |
| `/s/:token` | Public share page |
| `/admin/login` | Admin login |
| `/admin` | Admin dashboard |

## 🗄️ Database Schema

```prisma
model AdminUser {
  id           String   @id
  email        String   @unique
  username     String   @unique
  passwordHash String
  createdAt    DateTime
}

model Extraction {
  id               String
  originalFilename String
  sizeBytes        Int
  sha256           String   @unique
  pageCount        Int
  imageCount       Int
  status           String   // pending, processing, completed, failed
  expiresAt        DateTime?
  images           Image[]
  shareLinks       ShareLink[]
}

model Image {
  id           String
  extractionId String
  filename     String
  width        Int
  height       Int
  mimeType     String
  sizeBytes    Int
  pageNumber   Int
}

model ShareLink {
  id           String
  extractionId String
  token        String   @unique
  isPublic     Boolean
  accessCount  Int
  expiresAt    DateTime?
}
```

## 🛠️ Scripts

```bash
npm run dev          # Start dev servers (frontend + backend)
npm run build        # Build for production
npm start            # Start production server
npm run setup        # Initial setup (install deps + db)
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed admin user
```

## 🔒 Security Features

- Password hashing with Argon2
- JWT authentication with HTTP-only cookies
- Rate limiting on uploads
- File size and page count limits
- Sanitized filenames (prevents path traversal)
- No credentials in source code

## 📄 License

MIT

## 📚 Documentation

- **[EMERGENCY_FIX_COMPLETE.md](./EMERGENCY_FIX_COMPLETE.md)** - Latest fix summary
- **[WORKER_BUNDLE_FIX.md](./WORKER_BUNDLE_FIX.md)** - Technical implementation details
- **[POST_DEPLOY_TESTS.md](./POST_DEPLOY_TESTS.md)** - Testing checklist
- **[PRD.md](./PRD.md)** - Product requirements document

## 🏗️ Architecture

### Client-Side Processing Only

All PDF processing happens in the browser:
- PDF.js with bundled Web Worker
- Automatic fallback to main thread if worker fails
- No data sent to servers
- Complete privacy

### Fallback Chain

1. Try with Web Worker (fastest)
2. Try with worker + error recovery
3. Try with worker + ignore errors
4. **Fallback to main thread** (disableWorker: true)
5. Main thread + error recovery
6. Main thread + minimal config

### Extraction Methods

1. **Embedded extraction** - Extract actual images from PDF
2. **Rasterization** - Render pages as images at high DPI

## 🎨 Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **PDF.js** - PDF parsing and rendering
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **shadcn/ui** - UI components
- **JSZip** - ZIP file generation

## 🛠️ Development

### Project Structure

```
src/
├── components/         # React components
│   ├── Hero.tsx       # Landing page
│   ├── UploadZone.tsx # File upload
│   ├── ProcessingView.tsx # Progress indicator
│   ├── ImageGallery.tsx   # Results display
│   └── ErrorView.tsx      # Error handling
├── lib/               # Core logic
│   ├── pdf-worker-setup.ts   # Worker bundling
│   ├── pdf-extractor.ts      # Main extraction logic
│   └── zip-generator.ts      # ZIP creation
└── index.css          # Theme and styles
```

### Key Files

- **`src/lib/pdf-worker-setup.ts`** - Bundles worker via Vite `?url` import
- **`src/lib/pdf-extractor.ts`** - Main extraction logic with fallbacks
- **`vite.config.ts`** - Worker bundling configuration

## 🐛 Troubleshooting

### Worker 404 Error

```bash
# Rebuild with clean cache
rm -rf dist node_modules/.vite
npm run build
```

### CSP Issues

Add to your hosting config:
```
Content-Security-Policy: 
  script-src 'self'; 
  worker-src 'self' blob:;
```

### Extraction Fails

1. Check browser console for errors
2. Download diagnostic JSON from error screen
3. Look for which methods were attempted
4. Try opening PDF in Adobe Reader and "Save As" to create clean copy

### Proxy/Gateway Errors (502, 504, HTML responses)

When deployed behind a proxy (PhalaCloud, Nginx, Cloudflare), you might see:
- **502 Bad Gateway** - Server crashed or didn't respond
- **504 Gateway Timeout** - Extraction took too long
- **"Unexpected token '<'"** - Proxy returned HTML error page

**Solutions:**

1. **Request ID tracking**: Every API request gets an `x-request-id` header. Check server logs for the matching ID.

2. **Download diagnostics**: When an error occurs, click "Download Diagnostic JSON" to get:
   - Request timestamp, URL, method
   - Response status, content-type
   - Body snippet (first 2000 chars)
   - Request ID for log correlation

3. **Async processing**: Large PDFs use async extraction:
   - Upload returns `202 Accepted` immediately
   - Frontend polls `/api/extractions/:id` every 5 seconds
   - Processing continues in background (up to 5 minutes)

4. **File size limits**: 
   - Default: 200MB (`MAX_FILE_SIZE_MB`)
   - Proxy may have lower limits - check your reverse proxy config

5. **Timeout limits**:
   - Extraction timeout: 5 minutes
   - If your proxy times out sooner, increase `proxy_read_timeout` (Nginx) or similar

## 📝 License

The Spark Template files and resources from GitHub are licensed under the terms of the MIT license, Copyright GitHub, Inc.

## 🎉 Status

✅ **Ready for production**
- Worker bundling: ✅ Active
- DisableWorker fallback: ✅ Active  
- Server dependencies: ✅ Removed
- Error handling: ✅ Comprehensive
- Diagnostics: ✅ Detailed
