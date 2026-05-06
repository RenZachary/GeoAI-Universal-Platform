# Base URL Configuration Guide

## Overview

This guide explains how to configure the base URL for the GeoAI-UP frontend application. The base URL allows you to deploy the application under a subdirectory path (e.g., `http://localhost:5173/geo-ai` instead of `http://localhost:5173/`).

## Configuration

### Environment Variables

The base URL is configured through the `VITE_BASE_URL` environment variable in your `.env` file:

```env
# Application Base URL (for deployment under subdirectory)
VITE_BASE_URL=/geo-ai
```

**Default value:** `/` (root path)

### Available Configuration Files

- `.env` - Current environment configuration
- `.env.example` - Template with all available options

## Usage Examples

### Development (Root Path)
```env
VITE_BASE_URL=/
```
Application will be accessible at: `http://localhost:5173/`

### Development (Subdirectory)
```env
VITE_BASE_URL=/geo-ai
```
Application will be accessible at: `http://localhost:5173/geo-ai`

### Production Deployment
```env
VITE_BASE_URL=/my-app
```
Application will be accessible at: `https://yourdomain.com/my-app`

## Important Notes

1. **Leading Slash Required**: Always include the leading slash (`/`) in the base URL
2. **No Trailing Slash**: Do not include a trailing slash (use `/geo-ai`, not `/geo-ai/`)
3. **API Configuration**: The backend API URL is configured separately via `VITE_API_BASE_URL`
4. **Router Integration**: The Vue Router automatically adapts to the configured base URL
5. **Asset Paths**: All static assets and routes will be relative to the configured base URL

## Testing

After changing the base URL:

1. Restart the development server:
   ```bash
   npm run dev
   ```

2. Access the application at the new path:
   - If `VITE_BASE_URL=/geo-ai`, visit `http://localhost:5173/geo-ai`

## Build for Production

When building for production with a custom base URL:

```bash
npm run build
```

The built files will be configured to work correctly under the specified base URL path.

## Troubleshooting

### Issue: Assets not loading
- Verify that `VITE_BASE_URL` has a leading slash
- Check that there's no trailing slash
- Clear browser cache and restart the dev server

### Issue: Routes not working
- Ensure the base URL matches your deployment path exactly
- Verify that your web server is configured to serve the app from the correct subdirectory

### Issue: API requests failing
- Remember that `VITE_BASE_URL` only affects the frontend app path
- API requests use `VITE_API_BASE_URL` which is independent
- Check that your proxy configuration in `vite.config.ts` is correct
