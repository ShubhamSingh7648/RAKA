# Security and Deploy Readiness Audit (Updated 2026-02-27)

## Fixed in this pass

- `npm audit` now reports 0 vulnerabilities in both backend and frontend.
- Added backend hardening:
  - `helmet`
  - `app.disable("x-powered-by")`
  - JSON body size limit (`express.json({ limit: "512kb" })`)
- Added refresh token rate limiting (`/api/v1/auth/refresh`).
- Replaced hardcoded frontend API/socket URLs with a shared runtime config.
- Added Cloudinary signed upload integration for profile pictures.
- Reworked profile update to accept Cloudinary HTTPS URLs instead of base64 data URLs.
- Added `.env.example` and expanded deployment docs for Cloudinary/cookie config.

## Remaining risks / follow-ups

- Access token is still stored in `localStorage` (`my-project/src/context/AuthContext.tsx`).
  - This is functional but less safe than cookie-only auth for XSS risk.
- Existing real secret in local `.env` should be rotated before deployment.
- `src/config/env.ts` and `src/config/index.ts` still overlap conceptually; keep only one env system in a cleanup pass.

## Deploy checklist

- [ ] Rotate `JWT_SECRET` and set production env vars from `.env.example`
- [ ] Set `VITE_API_BASE_URL` to production backend URL
- [ ] Set `CORS_ORIGINS` to exact frontend production origin(s)
- [ ] Configure Cloudinary vars on backend
- [ ] Verify auth refresh works cross-site (Vercel frontend + Render backend)
- [ ] Run smoke test against production URLs