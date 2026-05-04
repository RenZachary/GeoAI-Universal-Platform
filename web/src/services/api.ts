import axios from 'axios'
import { useConfigStore } from '@/stores/config'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to add fingerprint header
api.interceptors.request.use((config) => {
  const configStore = useConfigStore()
  if (configStore.fingerprint) {
    config.headers['X-Browser-Fingerprint'] = configStore.fingerprint
  }
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export default api
