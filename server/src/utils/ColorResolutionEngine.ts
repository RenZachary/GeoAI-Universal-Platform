/**
 * Color Resolution Engine
 * Centralizes all color parsing logic for visualization renderers
 * Supports Chinese color names, hex colors, CSS colors, and predefined ramps
 */

export interface ColorConfig {
  // Chinese color word mappings to ramp names
  zh: Record<string, string>;
  
  // Predefined color ramps (ColorBrewer-style)
  ramps: Record<string, string[]>;
  
  // CSS color name to hex mapping
  cssColors: Record<string, string>;
}

// Default color configuration
const DEFAULT_COLOR_CONFIG: ColorConfig = {
  // Chinese color words mapped to ramp names
  zh: {
    '红色': 'reds',
    '绿色': 'greens',
    '蓝色': 'blues',
    '橙色': 'oranges',
    '紫色': 'purples',
    '黄色': 'ylorbr',
    '灰色': 'greys'
  },
  
  // Predefined color ramps (from ColorBrewer and other sources)
  ramps: {
    reds: [
      '#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', 
      '#ef3b2c', '#cb181d', '#a50f15', '#67000d'
    ],
    greens: [
      '#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476',
      '#41ab5d', '#238b45', '#006d2c', '#00441b'
    ],
    blues: [
      '#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6',
      '#4292c6', '#2171b5', '#08519c', '#08306b'
    ],
    oranges: [
      '#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c',
      '#f16913', '#d94801', '#a63603', '#7f2704'
    ],
    purples: [
      '#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8',
      '#807dba', '#6a51a3', '#54278f', '#3f007d'
    ],
    ylorbr: [
      '#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929',
      '#ec7014', '#cc4c02', '#993404', '#662506'
    ],
    greys: [
      '#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696',
      '#737373', '#525252', '#252525', '#000000'
    ],
    viridis: [
      '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
      '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'
    ]
  },
  
  // Common CSS color names
  cssColors: {
    'red': '#ff0000',
    'green': '#00ff00',
    'blue': '#0000ff',
    'yellow': '#ffff00',
    'orange': '#ffa500',
    'purple': '#800080',
    'pink': '#ffc0cb',
    'cyan': '#00ffff',
    'magenta': '#ff00ff',
    'lime': '#00ff00',
    'navy': '#000080',
    'teal': '#008080',
    'maroon': '#800000',
    'olive': '#808000',
    'silver': '#c0c0c0',
    'gray': '#808080',
    'grey': '#808080',
    'black': '#000000',
    'white': '#ffffff',
    'brown': '#a52a2a',
    'coral': '#ff7f50',
    'crimson': '#dc143c',
    'gold': '#ffd700',
    'indigo': '#4b0082',
    'ivory': '#fffff0',
    'khaki': '#f0e68c',
    'lavender': '#e6e6fa',
    'linen': '#faf0e6',
    'mint': '#98ff98',
    'plum': '#dda0dd',
    'salmon': '#fa8072',
    'sienna': '#a0522d',
    'tan': '#d2b48c',
    'tomato': '#ff6347',
    'turquoise': '#40e0d0',
    'violet': '#ee82ee'
  }
};

export class ColorResolutionEngine {
  private config: ColorConfig;
  
  constructor(config?: Partial<ColorConfig>) {
    // Merge provided config with defaults
    this.config = {
      ...DEFAULT_COLOR_CONFIG,
      ...config,
      ramps: { ...DEFAULT_COLOR_CONFIG.ramps, ...config?.ramps },
      cssColors: { ...DEFAULT_COLOR_CONFIG.cssColors, ...config?.cssColors },
      zh: { ...DEFAULT_COLOR_CONFIG.zh, ...config?.zh }
    };
  }
  
  /**
   * Resolve a color specification to a hex color code
   * @param color - Can be: hex code (#RRGGBB), CSS color name, Chinese color word, or ramp name
   * @returns Hex color code (e.g., #ff0000)
   */
  async resolveColor(color: string): Promise<string> {
    if (!color || typeof color !== 'string') {
      throw new Error('Color parameter is required and must be a string');
    }
    
    const trimmed = color.trim();
    
    // 1. Check if it's already a valid hex color
    if (this.isValidHexColor(trimmed)) {
      return trimmed.toLowerCase();
    }
    
    // 2. Check CSS color names (case-insensitive)
    const lowerColor = trimmed.toLowerCase();
    if (this.config.cssColors[lowerColor]) {
      return this.config.cssColors[lowerColor];
    }
    
    // 3. Check Chinese color words
    if (this.config.zh[trimmed]) {
      // Chinese color words map to ramps, return first color of ramp
      const rampName = this.config.zh[trimmed];
      const ramp = this.config.ramps[rampName];
      if (ramp && ramp.length > 0) {
        return ramp[Math.floor(ramp.length / 2)]; // Return middle color
      }
    }
    
    // 4. Check if it's a ramp name (return middle color as representative)
    if (this.config.ramps[lowerColor]) {
      const ramp = this.config.ramps[lowerColor];
      if (ramp && ramp.length > 0) {
        return ramp[Math.floor(ramp.length / 2)];
      }
    }
    
    throw new Error(`Unable to resolve color: "${color}". Use hex (#RRGGBB), CSS color name, or predefined ramp name.`);
  }
  
  /**
   * Resolve a color ramp to an array of hex colors
   * @param rampName - Name of the color ramp (e.g., 'reds', 'viridis')
   * @param numColors - Number of colors to extract from the ramp
   * @returns Array of hex color codes
   */
  async resolveColorRamp(rampName: string, numColors: number): Promise<string[]> {
    if (!rampName || typeof rampName !== 'string') {
      throw new Error('Ramp name is required and must be a string');
    }
    
    if (numColors < 2 || numColors > 20) {
      throw new Error('Number of colors must be between 2 and 20');
    }
    
    const lowerRampName = rampName.trim().toLowerCase();
    const ramp = this.config.ramps[lowerRampName];
    
    if (!ramp) {
      throw new Error(`Color ramp not found: "${rampName}". Available ramps: ${Object.keys(this.config.ramps).join(', ')}`);
    }
    
    // Sample colors evenly from the ramp
    const result: string[] = [];
    for (let i = 0; i < numColors; i++) {
      const index = Math.round((i / (numColors - 1)) * (ramp.length - 1));
      result.push(ramp[index]);
    }
    
    return result;
  }
  
  /**
   * Resolve a color scheme by name and count
   * Alias for resolveColorRamp for consistency
   */
  async resolveColorScheme(schemeName: string, count: number): Promise<string[]> {
    return this.resolveColorRamp(schemeName, count);
  }
  
  /**
   * Get list of available color ramps
   */
  getAvailableRamps(): string[] {
    return Object.keys(this.config.ramps);
  }
  
  /**
   * Get list of available CSS color names
   */
  getAvailableCssColors(): string[] {
    return Object.keys(this.config.cssColors);
  }
  
  /**
   * Validate if a string is a valid hex color
   */
  private isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }
}

// Export singleton instance for convenience
export const colorEngine = new ColorResolutionEngine();
