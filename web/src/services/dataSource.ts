import api from './api'
import type { DataSource } from '@/types'

/**
 * List all data sources
 */
export async function listDataSources(): Promise<DataSource[]> {
  const response = await api.get('/api/data-sources')
  return response.data.dataSources || []
}

/**
 * Get a specific data source
 */
export async function getDataSource(id: string): Promise<DataSource> {
  const response = await api.get(`/api/data-sources/${id}`)
  return response.data.dataSource
}

/**
 * Delete a data source
 */
export async function deleteDataSource(id: string): Promise<void> {
  await api.delete(`/api/data-sources/${id}`)
}

/**
 * Preview data source (first N records)
 */
export async function previewDataSource(id: string, limit: number = 10): Promise<any> {
  const response = await api.get(`/api/datasources/${id}/preview`, {
    params: { limit }
  })
  return response.data
}

/**
 * Get service URL for a data source (auto-publishes if needed)
 * Returns MVT URL for vector data, WMS URL for raster data
 */
export async function getDataSourceServiceUrl(id: string): Promise<{
  serviceUrl: string
  serviceType: 'mvt' | 'wms'
}> {
  const response = await api.get(`/api/data-sources/${id}/service-url`)
  return {
    serviceUrl: response.data.serviceUrl,
    serviceType: response.data.serviceType
  }
}
