/**
 * Browser Fingerprint Generator
 * Creates a unique identifier based on browser characteristics
 */

export function generateBrowserFingerprint(): string {
  const components: string[] = []
  
  // Navigator properties
  components.push(navigator.userAgent)
  components.push(navigator.language)
  components.push(String(navigator.hardwareConcurrency))
  components.push(String((navigator as any).deviceMemory || 'unknown'))
  components.push(navigator.platform)
  
  // Screen properties
  components.push(`${screen.width}x${screen.height}`)
  components.push(String(screen.colorDepth))
  components.push(String(window.devicePixelRatio))
  
  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone)
  
  // Canvas fingerprint (simple hash)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) {
    canvas.width = 200
    canvas.height = 50
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('GeoAI-UP', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('GeoAI-UP', 4, 17)
    components.push(canvas.toDataURL())
  }
  
  // Create hash from all components
  const fingerprintString = components.join('|')
  return simpleHash(fingerprintString)
}

/**
 * Simple hash function for fingerprint generation
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Initialize fingerprint in localStorage if not exists
 */
export function initializeFingerprint(): string {
  let fingerprint = localStorage.getItem('browser_fingerprint')
  
  if (!fingerprint) {
    fingerprint = generateBrowserFingerprint()
    localStorage.setItem('browser_fingerprint', fingerprint)
  }
  
  return fingerprint
}
