#!/bin/sh

# =============================================================================
# Docker Entrypoint Script
# =============================================================================
# Handles graceful shutdown for:
#   - Next.js application server
#   - Reminder daemon background process
# =============================================================================

set -e

# Configuration
GRACEFUL_TIMEOUT=${GRACEFUL_TIMEOUT:-30}

# Track PIDs for cleanup
NEXTJS_PID=""
DAEMON_PID=""

# Cleanup function - called on shutdown
cleanup() {
  echo ""
  echo "==> Shutting down gracefully..."

  # Stop accepting new connections (send SIGTERM to Next.js)
  if [ -n "$NEXTJS_PID" ] && kill -0 "$NEXTJS_PID" 2>/dev/null; then
    echo "  - Sending SIGTERM to Next.js server (PID: $NEXTJS_PID)"
    kill -TERM "$NEXTJS_PID" 2>/dev/null || true
  fi

  # Stop the reminder daemon
  if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo "  - Stopping reminder daemon (PID: $DAEMON_PID)"
    kill -TERM "$DAEMON_PID" 2>/dev/null || true
  fi

  # Wait for processes to finish with timeout
  echo "  - Waiting up to ${GRACEFUL_TIMEOUT}s for processes to finish..."

  TIMEOUT=$GRACEFUL_TIMEOUT
  while [ $TIMEOUT -gt 0 ]; do
    # Check if both processes are done
    NEXTJS_RUNNING=0
    DAEMON_RUNNING=0

    if [ -n "$NEXTJS_PID" ] && kill -0 "$NEXTJS_PID" 2>/dev/null; then
      NEXTJS_RUNNING=1
    fi

    if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
      DAEMON_RUNNING=1
    fi

    # Both stopped - we're done
    if [ $NEXTJS_RUNNING -eq 0 ] && [ $DAEMON_RUNNING -eq 0 ]; then
      echo "  - All processes stopped cleanly"
      exit 0
    fi

    sleep 1
    TIMEOUT=$((TIMEOUT - 1))
  done

  # Timeout reached - force kill
  echo "  - Timeout reached, forcing shutdown..."

  if [ -n "$NEXTJS_PID" ] && kill -0 "$NEXTJS_PID" 2>/dev/null; then
    echo "  - Force killing Next.js server"
    kill -KILL "$NEXTJS_PID" 2>/dev/null || true
  fi

  if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo "  - Force killing reminder daemon"
    kill -KILL "$DAEMON_PID" 2>/dev/null || true
  fi

  exit 1
}

# Register signal handlers
trap cleanup SIGTERM SIGINT

# =============================================================================
# Startup
# =============================================================================

echo "==> Running database migrations..."
node_modules/.bin/prisma migrate deploy

echo "==> Running seed..."
node_modules/.bin/prisma db seed

echo "==> Starting appointment reminder daemon..."
node_modules/.bin/tsx src/scripts/reminder-daemon.ts &
DAEMON_PID=$!

echo "==> Starting application..."
node_modules/.bin/next start &
NEXTJS_PID=$!

echo "==> Application started"
echo "  - Next.js PID: $NEXTJS_PID"
echo "  - Reminder daemon PID: $DAEMON_PID"
echo "  - Graceful shutdown timeout: ${GRACEFUL_TIMEOUT}s"

# Wait for Next.js to finish (this keeps the container running)
wait $NEXTJS_PID
NEXTJS_EXIT_CODE=$?

echo "==> Next.js exited with code: $NEXTJS_EXIT_CODE"

# Stop the daemon before exiting
if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
  echo "  - Stopping reminder daemon..."
  kill -TERM "$DAEMON_PID" 2>/dev/null || true

  # Brief wait for daemon to stop
  for i in 1 2 3 4 5; do
    if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  # Force kill if still running
  if kill -0 "$DAEMON_PID" 2>/dev/null; then
    kill -KILL "$DAEMON_PID" 2>/dev/null || true
  fi
fi

exit $NEXTJS_EXIT_CODE