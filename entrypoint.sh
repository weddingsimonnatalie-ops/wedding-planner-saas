#!/bin/sh

# =============================================================================
# Docker Entrypoint Script
# =============================================================================
# Background jobs (appointment reminders, overdue payments, billing lifecycle)
# are now handled by Inngest — no daemon subprocess needed.
# =============================================================================

set -e

GRACEFUL_TIMEOUT=${GRACEFUL_TIMEOUT:-30}
NEXTJS_PID=""

cleanup() {
  echo ""
  echo "==> Shutting down gracefully..."

  if [ -n "$NEXTJS_PID" ] && kill -0 "$NEXTJS_PID" 2>/dev/null; then
    echo "  - Sending SIGTERM to Next.js server (PID: $NEXTJS_PID)"
    kill -TERM "$NEXTJS_PID" 2>/dev/null || true
  fi

  echo "  - Waiting up to ${GRACEFUL_TIMEOUT}s for Next.js to finish..."

  TIMEOUT=$GRACEFUL_TIMEOUT
  while [ $TIMEOUT -gt 0 ]; do
    if ! kill -0 "$NEXTJS_PID" 2>/dev/null; then
      echo "  - Next.js stopped cleanly"
      exit 0
    fi
    sleep 1
    TIMEOUT=$((TIMEOUT - 1))
  done

  echo "  - Timeout reached, forcing shutdown..."
  kill -KILL "$NEXTJS_PID" 2>/dev/null || true
  exit 1
}

trap cleanup SIGTERM SIGINT

# =============================================================================
# Startup
# =============================================================================

echo "==> Running database migrations..."
node_modules/.bin/prisma migrate deploy

if [ "${SKIP_SEED:-false}" = "true" ]; then
  echo "==> Skipping seed (SKIP_SEED=true)"
else
  echo "==> Running seed..."
  node_modules/.bin/prisma db seed
fi

echo "==> Starting application..."
node_modules/.bin/next start &
NEXTJS_PID=$!

echo "==> Application started (PID: $NEXTJS_PID, graceful shutdown timeout: ${GRACEFUL_TIMEOUT}s)"

wait $NEXTJS_PID
NEXTJS_EXIT_CODE=$?

echo "==> Next.js exited with code: $NEXTJS_EXIT_CODE"
exit $NEXTJS_EXIT_CODE
