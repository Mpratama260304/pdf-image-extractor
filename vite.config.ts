import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

function copyPdfWorker() {
  return {
    name: 'copy-pdf-worker',
    buildStart() {
      try {
        const workerSrc = join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
        const publicDir = join(projectRoot, 'public')
        const assetsDir = join(publicDir, 'assets')
        const workerDest = join(assetsDir, 'pdf.worker.min.js')
        
        if (!existsSync(publicDir)) {
          mkdirSync(publicDir, { recursive: true })
        }
        if (!existsSync(assetsDir)) {
          mkdirSync(assetsDir, { recursive: true })
        }
        
        if (existsSync(workerSrc)) {
          copyFileSync(workerSrc, workerDest)
          console.log('✓ Copied pdf.worker.min.js to public/assets/')
        } else {
          console.warn('⚠ PDF.js worker not found at', workerSrc)
        }
      } catch (err) {
        console.warn('⚠ Could not copy PDF.js worker:', err)
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    createIconImportProxy() as PluginOption,
    sparkPlugin() as PluginOption,
    copyPdfWorker() as PluginOption,
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  publicDir: 'public',
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
        }
      }
    }
  }
});
