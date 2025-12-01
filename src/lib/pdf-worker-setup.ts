import * as pdfjsLib from 'pdfjs-dist'

const FALLBACK_ASSET_PATH = '/assets/pdf.worker.min.js'

let workerInitialized = false
let workerInitError: Error | null = null
let workerMode: 'worker' | 'no-worker' = 'no-worker'
let resolvedWorkerUrl: string | null = null

if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''
}

async function tryFetchWorker(url: string, timeout = 4000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal })
    clearTimeout(id)
    return res && res.ok
  } catch (e) {
    return false
  }
}

export async function initializePDFWorker(): Promise<{ success: boolean; error?: Error; mode: 'worker' | 'no-worker' }> {
  if (workerInitialized) {
    return { success: true, mode: workerMode }
  }

  const okFallback = await tryFetchWorker(FALLBACK_ASSET_PATH)
  if (okFallback) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = FALLBACK_ASSET_PATH
    workerInitialized = true
    workerMode = 'worker'
    resolvedWorkerUrl = FALLBACK_ASSET_PATH
    return { success: true, mode: 'worker' }
  }

  try {
    const cdnUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.449/pdf.worker.min.mjs`
    const okCdn = await tryFetchWorker(cdnUrl, 3000)
    if (okCdn) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrl
      workerInitialized = true
      workerMode = 'worker'
      resolvedWorkerUrl = cdnUrl
      return { success: true, mode: 'worker' }
    }
  } catch (e) {
  }

  workerInitialized = true
  workerMode = 'no-worker'
  workerInitError = new Error('Could not initialize pdf.worker: worker asset not reachable; will use disableWorker fallback')
  return { success: false, error: workerInitError, mode: 'no-worker' }
}

export function isWorkerInitialized(): boolean {
  return workerInitialized
}

export function getWorkerError(): Error | null {
  return workerInitError
}

export function getWorkerMode(): 'worker' | 'no-worker' {
  return workerMode
}

export function getResolvedWorkerUrl(): string | null {
  return resolvedWorkerUrl
}
