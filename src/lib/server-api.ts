export interface ServerExtractionRequest {
  file: File
  sessionId: string
}

export interface ServerExtractionResult {
  success: boolean
  images?: {
    data: string
    format: string
    width: number
    height: number
    pageNumber: number
  }[]
  error?: string
  diagnostic?: {
    sessionId: string
    originalFilename: string
    fileSize: number
    pageCount: number
    extractedImageCount: number
    attempts: {
      method: string
      success: boolean
      error?: string
      timestamp: number
      duration?: number
    }[]
    timestamp: number
    duration: number
    errorCode?: string
    errorMessage?: string
  }
}

export async function uploadForServerExtraction(
  file: File,
  sessionId: string
): Promise<ServerExtractionResult> {
  const formData = new FormData()
  formData.append('pdf', file, file.name)
  formData.append('sessionId', sessionId)

  const response = await fetch('/api/extract-images', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Server returned ${response.status}: ${errorText}`)
  }

  return await response.json()
}
