# Base URL Configuration - Quick Test

## Testing the Base URL Configuration

### Test 1: Default Configuration (Root Path)

Current configuration in `.env`:
```env
VITE_BASE_URL=/
```

**Expected behavior:**
- Application accessible at: `http://localhost:5173/`
- All routes work normally: `/data`, `/tools`, `/templates`, etc.

**How to test:**
```bash
npm run dev
```
Visit: `http://localhost:5173/`

---

### Test 2: Subdirectory Configuration

Modify `.env`:
```env
VITE_BASE_URL=/geo-ai
```

**Expected behavior:**
- Application accessible at: `http://localhost:5173/geo-ai`
- Routes adapt automatically: `/geo-ai/data`, `/geo-ai/tools`, etc.
- Static assets load correctly from `/geo-ai/` path

**How to test:**
```bash
# 1. Update .env file
# 2. Restart dev server (important!)
npm run dev
```
Visit: `http://localhost:5173/geo-ai`

**Verify:**
1. ✅ Main page loads at `/geo-ai`
2. ✅ Navigation links include base path (e.g., `/geo-ai/data`)
3. ✅ Browser DevTools Network tab shows assets loading from `/geo-ai/assets/...`
4. ✅ API requests still go to `/api/...` (proxied to backend)
5. ✅ No 404 errors in console

---

### Test 3: Production Build

```bash
# With VITE_BASE_URL=/geo-ai
npm run build
```

**Expected output:**
- `dist/` folder contains properly configured files
- All asset paths reference `/geo-ai/` prefix
- `index.html` has correct base tag

**Deploy and test:**
Serve the `dist` folder under `/geo-ai` path on your web server.

---

## Common Issues & Solutions

### Issue: "Cannot GET /geo-ai" after changing base URL
**Solution:** You must restart the dev server after changing `.env`
```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Issue: Assets returning 404
**Check:**
- Leading slash present: `VITE_BASE_URL=/geo-ai` ✅ (not `geo-ai`)
- No trailing slash: `VITE_BASE_URL=/geo-ai` ✅ (not `/geo-ai/`)
- Server restarted after config change

### Issue: Routes not working
**Verify:**
- Router is using `createWebHistory(import.meta.env.VITE_BASE_URL || '/')`
- Base URL matches your deployment path exactly

### Issue: API calls failing
**Remember:**
- Frontend base URL (`VITE_BASE_URL`) ≠ Backend API URL (`VITE_API_BASE_URL`)
- API proxy in `vite.config.ts` handles `/api` → backend translation
- Check browser Network tab to verify API request URLs

---

## Quick Verification Checklist

After configuring base URL:

- [ ] `.env` file updated with correct `VITE_BASE_URL`
- [ ] Dev server restarted
- [ ] Application loads at expected URL
- [ ] All navigation links include base path
- [ ] Static assets (CSS, JS, images) load correctly
- [ ] No console errors related to missing resources
- [ ] API requests work properly
- [ ] Page refresh on sub-routes works (e.g., `/geo-ai/data` → refresh → still works)

---

## Reverting to Default

To return to root path deployment:

```env
VITE_BASE_URL=/
```

Then restart the dev server:
```bash
npm run dev
```

Application will be accessible at: `http://localhost:5173/`
