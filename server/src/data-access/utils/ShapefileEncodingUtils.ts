/**
 * Shapefile Encoding Utilities
 * Shared utilities for handling character encoding in Shapefile DBF files
 */

export interface FeatureWithProperties {
  properties?: Record<string, any> | null;
}

/**
 * Supported encodings for Shapefile DBF files
 * Ordered by priority for auto-detection
 */
export const SUPPORTED_ENCODINGS = ['GBK', 'GB2312', 'UTF-8', 'windows-1252'] as const;

export type SupportedEncoding = typeof SUPPORTED_ENCODINGS[number];

/**
 * Check if a string contains mojibake (encoding corruption)
 * Specifically detects GBK/GB2312 bytes misinterpreted as UTF-8
 */
function detectMojibake(value: string): boolean {
  // When GBK-encoded Chinese text is misinterpreted as UTF-8,
  // it creates unusual character combinations that are rare in normal Chinese text.
  
  // Strategy: Check for non-CJK characters mixed with CJK
  // Real Chinese text should only contain:
  // - CJK Unified Ideographs (U+4E00-U+9FFF)
  // - CJK punctuation and symbols (U+3000-U+303F, U+FF00-U+FFEF)
  // - Basic Latin (U+0020-U+007E) for numbers, letters, etc.
  
  let nonCjkCount = 0;
  let cjkCount = 0;
  
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    
    // Skip ASCII characters (common in Chinese text)
    if (code >= 0x0020 && code <= 0x007E) continue;
    
    // Count CJK characters
    if ((code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified Ideographs
        (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Extension A
        (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
        (code >= 0x3000 && code <= 0x303F) ||  // CJK punctuation
        (code >= 0xFF00 && code <= 0xFFEF)) {   // Full-width forms
      cjkCount++;
    } else {
      // Non-CJK, non-ASCII character - suspicious
      nonCjkCount++;
    }
  }
  
  const totalChars = cjkCount + nonCjkCount;
  
  // If more than 10% of non-ASCII chars are non-CJK, likely mojibake
  if (totalChars > 0 && nonCjkCount / totalChars > 0.1) {
    return true;
  }
  
  return false;
}

/**
 * Validate if string properties are properly encoded
 * Checks for common signs of encoding errors
 * 
 * @param features - Array of GeoJSON features to validate
 * @returns true if encoding appears valid, false if garbled text detected
 */
export function validateStringEncoding(features: FeatureWithProperties[]): boolean {
  if (features.length === 0 || !features[0].properties) {
    return true; // No properties to check
  }
  
  // Sample first few features for performance
  const sampleSize = Math.min(10, features.length);
  let totalStrings = 0;
  let suspiciousStrings = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    const props = features[i].properties;
    if (!props) continue;
    
    Object.values(props).forEach(value => {
      if (typeof value === 'string' && value.length > 0) {
        totalStrings++;
        
        // Check for signs of encoding errors:
        // 1. Replacement character (U+FFFD)
        // 2. Mojibake patterns (GBK/GB2312 misinterpreted as UTF-8)
        // 3. Unusual control characters in text fields
        
        const hasReplacementChar = value.includes('\ufffd');
        const isMojibake = detectMojibake(value);
        
        // Check for excessive non-printable characters (except common whitespace)
        // Count control characters by checking char codes directly
        let nonPrintableCount = 0;
        for (let j = 0; j < value.length; j++) {
          const code = value.charCodeAt(j);
          // Control chars: 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F (excluding tab 0x09, newline 0x0A, CR 0x0D)
          if ((code >= 0x00 && code <= 0x08) || code === 0x0B || code === 0x0C || (code >= 0x0E && code <= 0x1F)) {
            nonPrintableCount++;
          }
        }
        const hasExcessiveControlChars = nonPrintableCount > value.length * 0.1; // More than 10%
        
        if (hasReplacementChar || isMojibake || hasExcessiveControlChars) {
          suspiciousStrings++;
        }
      }
    });
  }
  
  // If more than 20% of strings are suspicious, consider encoding invalid
  const suspicionRate = totalStrings > 0 ? suspiciousStrings / totalStrings : 0;
  const isValid = suspicionRate < 0.2;
  
  return isValid;
}

/**
 * Try multiple encodings to load a Shapefile with correct character encoding
 * 
 * @param openFunction - Function to open shapefile with encoding parameter
 * @param shapefilePath - Path to shapefile (without .shp extension)
 * @param logCallback - Optional callback for logging encoding attempts
 * @returns GeoJSON FeatureCollection with correctly encoded properties
 */
export async function tryMultipleEncodings<T extends FeatureWithProperties>(
  openFunction: (encoding: string) => Promise<{ read(): Promise<{ done: boolean; value?: T }> }>,
  shapefilePath: string,
  logCallback?: (message: string) => void
): Promise<T[]> {
  const log = logCallback || console.log;
  
  for (const encoding of SUPPORTED_ENCODINGS) {
    try {
      log(`Trying encoding: ${encoding} for ${shapefilePath}`);
      
      const source = await openFunction(encoding);
      const features: T[] = [];
      let result;
      
      while (!(result = await source.read()).done) {
        if (result.value) {
          features.push(result.value);
        }
      }
      
      // Validate encoding quality
      if (features.length > 0 && features[0].properties) {
        const isValid = validateStringEncoding(features);
        
        if (isValid) {
          log(`Successfully loaded with encoding: ${encoding}`);
          return features;
        } else {
          const sampleSize = Math.min(10, features.length);
          let totalStrings = 0;
          let suspiciousStrings = 0;
          
          for (let i = 0; i < sampleSize; i++) {
            const props = features[i].properties;
            if (!props) continue;
            
            Object.values(props).forEach(value => {
              if (typeof value === 'string' && value.length > 0) {
                totalStrings++;
                const hasReplacementChar = value.includes('\ufffd');
                const hasMojibake = /[\xc0-\xff][\x80-\xbf]/.test(value) && 
                                   !/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]/.test(value);
                if (hasReplacementChar || hasMojibake) {
                  suspiciousStrings++;
                }
              }
            });
          }
          
          const suspicionRate = totalStrings > 0 ? suspiciousStrings / totalStrings : 0;
          log(`Encoding ${encoding} produced invalid text (suspicion rate: ${(suspicionRate * 100).toFixed(1)}%), trying next...`);
        }
      }
    } catch (error) {
      log(`Failed with encoding ${encoding}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Fallback: use default encoding (windows-1252)
  log('All encodings failed, using default windows-1252');
  const source = await openFunction('windows-1252');
  
  const features: T[] = [];
  let result;
  
  while (!(result = await source.read()).done) {
    if (result.value) {
      features.push(result.value);
    }
  }
  
  return features;
}
