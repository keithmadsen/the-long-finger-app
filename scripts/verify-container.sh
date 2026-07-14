#!/bin/sh
# verify-container.sh — Story 3.5 AC 2 (container-level AC 3 & 5): scripted,
# repeatable proof that the production image persists todos across
# stop/start, survives docker kill (SIGKILL), answers /health for an
# orchestrator probe, serves the strict CSP, and shuts down promptly on
# `docker stop` (SIGTERM → graceful close, well under the 10s grace period).
#
# Usage:  ./scripts/verify-container.sh [--keep]
#   --keep   leave the container + volume + image in place for inspection
#
# Deliberately NOT a CI job: Story 1.11 declined a Docker-build CI job and
# Story 3.4 owns all CI changes. Run it manually (Docker daemon must be up:
# on macOS, `open -a Docker` first) and record the run in the story notes.

set -eu

IMAGE=tlf-verify
CONTAINER=tlf-verify-run
VOLUME=tlf-verify-data
PORT="${PORT:-18080}"
BASE="http://localhost:${PORT}"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

log() { printf '\n== %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cleanup() {
  if [ "$KEEP" = 1 ]; then
    printf '\n--keep: leaving container %s, volume %s, image %s\n' "$CONTAINER" "$VOLUME" "$IMAGE"
    return
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_health() {
  # Orchestrator-probe shape (AC 5): poll GET /health until 200, with deadline.
  deadline=$(( $(date +%s) + 30 ))
  while :; do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health" 2>/dev/null)" = "200" ]; then
      return 0
    fi
    [ "$(date +%s)" -gt "$deadline" ] && fail "/health not 200 within 30s"
    sleep 0.5
  done
}

count_todos() {
  curl -s "$BASE/todos" | tr -d ' \n' | grep -o '"id"' | wc -l | tr -d ' '
}

log "docker build"
docker build -q -t "$IMAGE" . || fail "docker build failed"

log "fresh named volume + run"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker volume rm "$VOLUME" >/dev/null 2>&1 || true
docker volume create "$VOLUME" >/dev/null
docker run -d --name "$CONTAINER" -v "$VOLUME":/data -p "$PORT":8080 "$IMAGE" >/dev/null

log "wait for /health (liveness probe, AC 5)"
wait_health
echo "health: 200 OK"

log "strict CSP served by the container (AC 1 spot-check)"
CSP=$(curl -sI "$BASE/" | tr -d '\r' | grep -i '^content-security-policy:' || true)
echo "$CSP"
echo "$CSP" | grep -q "default-src 'self'" || fail "CSP missing default-src 'self'"
echo "$CSP" | grep -q "frame-ancestors 'none'" || fail "CSP missing frame-ancestors 'none'"
case "$CSP" in *upgrade-insecure-requests*) fail "CSP unexpectedly has upgrade-insecure-requests";; esac

log "create a todo (client-generated UUIDv7 id)"
TODO_ID="01920000-0000-7000-8000-00000000d0c1"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/todos" \
  -H 'content-type: application/json' \
  -d "{\"id\":\"$TODO_ID\",\"description\":\"container verification todo\"}")
[ "$STATUS" = "201" ] || fail "POST /todos returned $STATUS, wanted 201"
[ "$(count_todos)" = "1" ] || fail "expected 1 todo after create"

log "docker stop (graceful SIGTERM path) + docker start → todo persists (AC 2)"
STOP_START=$(date +%s)
docker stop "$CONTAINER" >/dev/null
STOP_SECS=$(( $(date +%s) - STOP_START ))
echo "docker stop took ${STOP_SECS}s"
[ "$STOP_SECS" -lt 10 ] || fail "docker stop took ${STOP_SECS}s — hit the grace-period kill; graceful shutdown broken"
docker start "$CONTAINER" >/dev/null
wait_health
[ "$(count_todos)" = "1" ] || fail "todo lost across stop/start"
curl -s "$BASE/todos" | grep -q "$TODO_ID" || fail "todo id missing after stop/start"
echo "todo persisted across stop/start"

log "docker kill (SIGKILL, container-level AC 3) + restart → list intact"
docker kill "$CONTAINER" >/dev/null
docker start "$CONTAINER" >/dev/null
wait_health
[ "$(count_todos)" = "1" ] || fail "todo list not intact after SIGKILL + restart"
curl -s "$BASE/todos" | grep -q "$TODO_ID" || fail "todo id missing after SIGKILL + restart"
echo "todo list intact after SIGKILL + restart"

log "ALL CHECKS PASSED"
