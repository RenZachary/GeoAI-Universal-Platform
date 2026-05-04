import api from './api'

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

/**
 * Upload file with progress tracking
 */
export async function uploadFile(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<any> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        onProgress({
          loaded: progressEvent.loaded,
          total: progressEvent.total,
          percentage: Math.round((progressEvent.loaded / progressEvent.total) * 100)
        })
      }
    }
  })

  return response.data
}

/**
 * Upload multiple files
 */
export async function uploadMultipleFiles(
  files: File[],
  onProgress?: (fileName: string, progress: UploadProgress) => void
): Promise<any[]> {
  const results: any[] = []

  for (const file of files) {
    const result = await uploadFile(file, (progress) => {
      if (onProgress) {
        onProgress(file.name, progress)
      }
    })
    results.push(result)
  }

  return results
}
