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

  const response = await api.post('/api/upload/single', formData, {
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
 * If files include shapefile components (.shp, .shx, .dbf, .prj), upload them together
 */
export async function uploadMultipleFiles(
  files: File[],
  onProgress?: (fileName: string, progress: UploadProgress) => void
): Promise<any> {
  console.log('[fileUpload] uploadMultipleFiles called with', files.length, 'files')
  console.log('[fileUpload] Files:', files.map(f => f.name))
  
  // Check if this is a shapefile upload
  const hasShapefile = files.some(f => f.name.toLowerCase().endsWith('.shp'))
  console.log('[fileUpload] Has shapefile:', hasShapefile)
  
  if (hasShapefile) {
    console.log('[fileUpload] Uploading shapefile components together to /api/upload/multiple')
    // Upload all shapefile components together
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    
    const response = await api.post('/api/upload/multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    console.log('[fileUpload] Shapefile upload successful')
    return response.data
  } else {
    console.log('[fileUpload] Uploading individual files separately')
    // Upload individual files separately
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
}
