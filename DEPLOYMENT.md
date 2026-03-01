# Deployment Runbook

## 1) Environment
Set these variables before starting:

- `PORT` (default `3001`)
- `JWT_SECRET` (required, min 16 chars)
- `MONGO_URL` (required)
- `NODE_ENV` (`development` or `production`)
- `CORS_ORIGINS` (comma-separated, recommended in production)
- `COOKIE_SAMESITE` (`none` recommended for cross-site frontend/backend)
- `COOKIE_DOMAIN` (optional)
- `CLOUDINARY_CLOUD_NAME` (required for avatar uploads)
- `CLOUDINARY_API_KEY` (required for avatar uploads)
- `CLOUDINARY_API_SECRET` (required for avatar uploads)
- `CLOUDINARY_UPLOAD_FOLDER` (optional, defaults to `connecta/profile-pictures`)

Example:

```env
PORT=3001
JWT_SECRET=replace_with_a_long_random_secret
MONGO_URL=mongodb://localhost:27017/connecta
NODE_ENV=production
CORS_ORIGINS=https://your-frontend-domain.com
COOKIE_SAMESITE=none
COOKIE_DOMAIN=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=connecta/profile-pictures
```

## 2) Build and Start

```bash
npm install
npm run build
pm2 start dist/server.js --name connecta
```

## 3) Restart / Logs

```bash
pm2 restart connecta
pm2 logs connecta --lines 200
pm2 describe connecta
```

## 4) Health Checks

- HTTP root: `GET /`
- API auth route smoke: `POST /api/v1/auth/login`
- Socket namespace: `/chat` websocket connection

## 5) Smoke E2E (after backend is up)

```bash
npm run test:smoke
```

Optional custom endpoints:

```bash
BASE_URL=http://localhost:3001 SOCKET_URL=http://localhost:3001/chat npm run test:smoke
```

Frontend build env:

```bash
VITE_API_BASE_URL=https://your-backend-domain.com
```

## 6) Failure Handling

- If process crashes repeatedly:
1. Check env vars.
2. Check Mongo connectivity.
3. Check logs for `Shutdown triggered` and `SocketError`.
- If CORS errors appear:
1. Confirm frontend origin exactly exists in `CORS_ORIGINS`.
2. In production, do not rely on localhost wildcard behavior.
