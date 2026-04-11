# Environment Variables

All variables are in `.env` and passed to the `app` container via `docker-compose.yml`.

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_PASSWORD` | Yes | PostgreSQL password. Used internally between containers — can be any strong random string. |
| `NEXTAUTH_SECRET` | Yes | Signs session tokens for Better Auth. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Yes | The URL the app is accessible at. **Must match the public domain** when behind Cloudflare Tunnel. Used for auth redirect validation and RSVP email links. Local: `http://192.168.x.x:3000`. Public: `https://wedding.yourdomain.com`. |
| `SEED_ADMIN_1_NAME` | Yes | Display name for first admin user (created on first run only). |
| `SEED_ADMIN_1_EMAIL` | Yes | Email for first admin. |
| `SEED_ADMIN_1_PASSWORD` | Yes | Password for first admin (stored bcrypt-hashed). |
| `SEED_ADMIN_2_*` / `SEED_ADMIN_3_*` | No | Optional second and third admin accounts (same three fields each). |
| `SMTP_HOST` | No | SMTP server hostname. If blank, emails log to console instead of sending. |
| `SMTP_PORT` | No | SMTP port. Default: `587`. |
| `SMTP_USER` | No | SMTP username / email address. |
| `SMTP_PASS` | No | SMTP password (use App Password for Gmail). |
| `SMTP_FROM` | No | From address in outgoing emails. Also the recipient for appointment reminders. |
| `EMAIL_RATE_LIMIT_MAX` | No | Max emails per user per window. Default: `50`. |
| `EMAIL_RATE_LIMIT_WINDOW_MINUTES` | No | Email rate limit window in minutes. Default: `60` (1 hour). |
| `RSVP_RATE_LIMIT_IP_MAX` | No | Max RSVP requests per IP per window. Default: `20`. |
| `RSVP_RATE_LIMIT_IP_WINDOW_SECONDS` | No | IP rate limit window in seconds. Default: `60` (1 minute). |
| `RSVP_RATE_LIMIT_TOKEN_MAX` | No | Max RSVP requests per token per window. Default: `10`. |
| `RSVP_RATE_LIMIT_TOKEN_WINDOW_SECONDS` | No | Token rate limit window in seconds. Default: `60` (1 minute). |
| `BULK_GUEST_LIMIT` | No | Max guests per bulk operation (status/meal). Default: `500`. |
| `BULK_EMAIL_LIMIT` | No | Max emails per bulk send. Default: `100`. |
| `REDIS_URL` | No | Redis connection URL for multi-instance rate limiting. If not set, falls back to in-memory. Example: `redis://localhost:6379`. |
| `GRACEFUL_TIMEOUT` | No | Graceful shutdown timeout in seconds. Default: `30`. Time to wait for in-flight requests before forcing shutdown on SIGTERM. |
| `AWS_ENDPOINT_URL` | S3 required | S3 endpoint for server-side ops (upload/delete/list). Local: `http://minio:9000` (Docker-internal). Railway: auto-injected by Railway Buckets. |
| `AWS_ACCESS_KEY_ID` | S3 required | S3 access key. Local: `minioadmin`. Railway: auto-injected. |
| `AWS_SECRET_ACCESS_KEY` | S3 required | S3 secret key. Local: `minioadmin`. Railway: auto-injected. |
| `AWS_S3_BUCKET_NAME` | S3 required | S3 bucket name. Local: `wedding-planner-uploads`. Railway: auto-injected. |
| `AWS_DEFAULT_REGION` | S3 required | S3 region. Local: `auto`. Railway: auto-injected. |
| `S3_FORCE_PATH_STYLE` | No | Set `true` for MinIO (path-style URLs). Leave unset for Railway Buckets/Tigris (virtual-hosted URLs). Default in docker-compose: `true`. |
| `S3_PUBLIC_ENDPOINT_URL` | No | Browser-accessible S3 endpoint for presigned URL generation. Overrides `AWS_ENDPOINT_URL` only for signing (not for upload/delete). Local: `http://192.168.6.249:9000`. Unset in Railway — presigned URLs use `AWS_ENDPOINT_URL` directly. |

## Stripe Billing

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret API key (`sk_test_...` or `sk_live_...`). |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret from Stripe CLI or dashboard (`whsec_...`). |
| `DATA_RETENTION_DAYS` | No | Days after cancellation before data deletion. Default: `90`. |

**No price IDs needed.** Prices are resolved at runtime via Stripe lookup keys: `monthly-gbp-1`, `monthly-euro-1`, `monthly-usd-1`. Currency is auto-detected from the `CF-IPCountry` header injected by Cloudflare (GB→GBP, eurozone→EUR, everyone else→USD). See `src/lib/billing-currency.ts`.

## Auth

| Variable | Required | Description |
|----------|----------|-------------|
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | Comma-separated additional origins trusted by Better Auth. Use in dev when accessing the app via a LAN IP that differs from `NEXTAUTH_URL` (e.g. `http://192.168.0.187:3001`). Not needed in production. |

## Free Tier

New users start on the Free Tier (no payment required). Limits:
- 30 guests maximum
- 30 suppliers maximum
- No Timeline, Music, Email sending, or File Uploads
- Upgrade to paid plan via Stripe checkout to unlock all features

**SMTP notes**: If `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are all blank, the email library returns `ok: true` but logs to console — the app does not error on missing SMTP config. This is useful during development.

**Rate limiting notes**: All rate limit settings have sensible defaults and are optional. The email rate limit applies per authenticated user (for RSVP email sending and payment reminders). The RSVP rate limit has two layers: per-IP (prevents scraping) and per-token (prevents enumeration). For multi-instance deployments, set `REDIS_URL` to share rate limit state across instances.

## Admin Console Integration

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_INTERNAL_SECRET` | Yes (if admin console is deployed) | Shared secret for admin console → SaaS internal API calls (e.g. Stripe subscription cancellation). Must match the `ADMIN_INTERNAL_SECRET` set in the admin console. Generate with `openssl rand -base64 32`. Used as a Bearer token on `POST /api/internal/cancel-subscription`. |
