#!/bin/sh

# =============================================================================
# Docker Entrypoint Script
# =============================================================================
# Background jobs mode is controlled by INNGEST_EVENT_KEY:
#   - Not set: reminder daemon runs as a subprocess (single-replica deployments)
#   - Set:     daemon is skipped; Inngest handles all background jobs
# =============================================================================

set -e

GRACEFUL_TIMEOUT=${GRACEFUL_TIMEOUT:-30}
NEXTJS_PID=""
DAEMON_PID=""

cleanup() {
  echo ""
  echo "==> Shutting down gracefully..."

  if [ -n "$NEXTJS_PID" ] && kill -0 "$NEXTJS_PID" 2>/dev/null; then
    echo "  - Sending SIGTERM to Next.js server (PID: $NEXTJS_PID)"
    kill -TERM "$NEXTJS_PID" 2>/dev/null || true
  fi

  if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo "  - Stopping reminder daemon (PID: $DAEMON_PID)"
    kill -TERM "$DAEMON_PID" 2>/dev/null || true
  fi

  echo "  - Waiting up to ${GRACEFUL_TIMEOUT}s for processes to finish..."

  TIMEOUT=$GRACEFUL_TIMEOUT
  while [ $TIMEOUT -gt 0 ]; do
    NEXTJS_RUNNING=0
    DAEMON_RUNNING=0
    if [ -n "$NEXTJS_PID" ] && kill -0 "$NEXTJS_PID" 2>/dev/null; then NEXTJS_RUNNING=1; fi
    if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then DAEMON_RUNNING=1; fi
    if [ $NEXTJS_RUNNING -eq 0 ] && [ $DAEMON_RUNNING -eq 0 ]; then
      echo "  - All processes stopped cleanly"
      exit 0
    fi
    sleep 1
    TIMEOUT=$((TIMEOUT - 1))
  done

  echo "  - Timeout reached, forcing shutdown..."
  [ -n "$NEXTJS_PID" ] && kill -KILL "$NEXTJS_PID" 2>/dev/null || true
  [ -n "$DAEMON_PID" ] && kill -KILL "$DAEMON_PID" 2>/dev/null || true
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

# =============================================================================
# Admin console DB grants (idempotent — safe to run on every startup)
# Gives admin_console_user write access to the two columns it needs for
# Phase 6 password reset: Account.password and User.sessionVersion.
# All other columns remain read-only for that role.
# Skips silently if the role doesn't exist (e.g. fresh install before
# admin_console_user has been created).
# =============================================================================
ADMIN_CONSOLE_DB_USER="${ADMIN_CONSOLE_DB_USER:-admin_console_user}"
echo "==> Applying admin console column grants for role: ${ADMIN_CONSOLE_DB_USER}..."
GRANTS_TMP=$(mktemp)
cat > "$GRANTS_TMP" << ENDSQL
DO \$body\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ADMIN_CONSOLE_DB_USER}') THEN
    GRANT UPDATE (password) ON "Account" TO "${ADMIN_CONSOLE_DB_USER}";
    GRANT UPDATE ("sessionVersion") ON "User" TO "${ADMIN_CONSOLE_DB_USER}";
    RAISE NOTICE 'Admin console grants applied for role %', '${ADMIN_CONSOLE_DB_USER}';
  ELSE
    RAISE NOTICE 'Role % does not exist — skipping admin console grants', '${ADMIN_CONSOLE_DB_USER}';
  END IF;
END
\$body\$;
ENDSQL
node_modules/.bin/prisma db execute --file "$GRANTS_TMP" --schema prisma/schema.prisma || echo "Warning: admin console grants failed (non-fatal)"
rm -f "$GRANTS_TMP"

if [ -z "${INNGEST_EVENT_KEY}" ]; then
  echo "==> INNGEST_EVENT_KEY not set — starting reminder daemon..."
  node_modules/.bin/tsx src/scripts/reminder-daemon.ts &
  DAEMON_PID=$!
  echo "  - Reminder daemon PID: $DAEMON_PID"
else
  echo "==> INNGEST_EVENT_KEY set — skipping daemon (Inngest handles background jobs)"
fi

echo "==> Starting application..."
node_modules/.bin/next start &
NEXTJS_PID=$!

echo "==> Application started (PID: $NEXTJS_PID, graceful shutdown timeout: ${GRACEFUL_TIMEOUT}s)"

wait $NEXTJS_PID
NEXTJS_EXIT_CODE=$?

echo "==> Next.js exited with code: $NEXTJS_EXIT_CODE"

if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
  kill -TERM "$DAEMON_PID" 2>/dev/null || true
fi

exit $NEXTJS_EXIT_CODE
