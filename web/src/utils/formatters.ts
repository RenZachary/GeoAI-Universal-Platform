/**
 * Common formatting utilities for the application
 */

/**
 * Format file size in bytes to human-readable string
 * Supports B, KB, MB, GB
 * 
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g., "1.5 MB", "256 KB")
 */
export function formatFileSize(bytes: number): string {
  // Handle invalid values
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) {
    return 'N/A'
  }
  
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Format date string to locale date and time
 * 
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string (e.g., "2024/1/15 14:30")
 */
export function formatDate(dateString: string | Date): string {
  if (!dateString) return 'N/A'
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
  if (isNaN(date.getTime())) return 'N/A'
  
  return date.toLocaleString()
}

/**
 * Format date to short format (date only)
 * 
 * @param dateString - ISO date string or Date object
 * @returns Formatted date string (e.g., "2024/1/15")
 */
export function formatDateShort(dateString: string | Date): string {
  if (!dateString) return 'N/A'
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
  if (isNaN(date.getTime())) return 'N/A'
  
  return date.toLocaleDateString()
}

/**
 * Format date with time (HH:mm)
 * 
 * @param dateString - ISO date string or Date object
 * @returns Formatted datetime string (e.g., "2024/1/15 14:30")
 */
export function formatDateTime(dateString: string | Date): string {
  if (!dateString) return 'N/A'
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
  if (isNaN(date.getTime())) return 'N/A'
  
  const datePart = date.toLocaleDateString()
  const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  
  return `${datePart} ${timePart}`
}
