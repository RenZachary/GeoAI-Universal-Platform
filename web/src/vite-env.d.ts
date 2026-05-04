/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_TITLE: string
  readonly VITE_APP_VERSION: string
  readonly VITE_DEFAULT_LANGUAGE: string
  readonly VITE_SUPPORTED_LANGUAGES: string
  readonly VITE_DEFAULT_THEME: string
  readonly VITE_DEFAULT_MAP_CENTER: string
  readonly VITE_DEFAULT_MAP_ZOOM: string
  readonly VITE_DEFAULT_BASEMAP: string
  readonly VITE_AVAILABLE_BASEMAPS: string
  readonly VITE_MAX_FILE_SIZE: string
  readonly VITE_ALLOWED_FILE_TYPES: string
  readonly VITE_ENABLE_PLUGIN_UPLOAD: string
  readonly VITE_ENABLE_CUSTOM_THEMES: string
  readonly VITE_ENABLE_ANALYTICS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
