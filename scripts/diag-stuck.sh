#!/usr/bin/env bash
# Diagnose :4001 hang: run this WHILE the stall is happening.
# Usage: cd /home/ran/projects/jobhq-user-edition && bash scripts/diag-stuck.sh
# Output: diag-<timestamp>.txt in the current directory.
set -u
ts=$(date +%Y%m%dT%H%M%S)
out="diag-${ts}.txt"
exec > "$out" 2>&1

echo "=== ts=$ts ==="

echo
echo "=== uptime / load ==="
uptime

echo
echo "=== top snapshot (by CPU) ==="
top -b -n 1 -o %CPU | head -25

echo
echo "=== free -h ==="
free -h

echo
echo "=== iostat -x 1 3 (last sample is steady state) ==="
iostat -x 1 3 2>/dev/null | tail -25 || echo "iostat not installed"

echo
echo "=== pm2 list ==="
pm2 list

echo
echo "=== pm2 describe jobhq-dev ==="
pm2 describe jobhq-dev 2>&1 | head -40

NEXT_PID=$(pgrep -f 'next-server.*4001' | head -1)
echo
echo "=== next-server pid: ${NEXT_PID:-NOT FOUND} ==="
if [ -n "${NEXT_PID:-}" ]; then
  echo "--- per-thread CPU + wchan (where each thread is blocked in kernel) ---"
  ps -L -p "$NEXT_PID" -o pid,tid,pcpu,stat,wchan,comm 2>&1 | head -30
  echo
  echo "--- /proc/$NEXT_PID/status (threads, RSS, voluntary/involuntary ctxt switches) ---"
  grep -E '^(Threads|VmRSS|voluntary_ctxt|nonvoluntary_ctxt|State):' /proc/"$NEXT_PID"/status 2>&1
  echo
  echo "--- /proc/$NEXT_PID/wchan (main thread blocked syscall) ---"
  cat /proc/"$NEXT_PID"/wchan 2>&1; echo
  echo
  echo "--- strace -c -p $NEXT_PID for 5s (which syscalls dominate) ---"
  echo "(may need sudo; falls back to ENOPERM)"
  timeout 5 strace -c -p "$NEXT_PID" 2>&1 | tail -35
fi

echo
echo "=== open file descriptors on user-1.db ==="
lsof data/user-1.db 2>&1 | head -10
echo "--- on auth.db ---"
lsof data/auth.db 2>&1 | head -10

echo
echo "=== DB file sizes (incl. WAL) ==="
ls -la data/*.db data/*.db-wal data/*.db-shm 2>&1

echo
echo "=== curl localhost timing during stall ==="
echo "--- /login (no auth, should be fast) ---"
time curl -sS -o /dev/null -w 'HTTP=%{http_code} TIME=%{time_total}\n' --max-time 30 http://127.0.0.1:4001/login
echo "--- / (will redirect) ---"
time curl -sS -o /dev/null -w 'HTTP=%{http_code} TIME=%{time_total}\n' --max-time 30 http://127.0.0.1:4001/

echo
echo "=== sqlite write probe (if this hangs, write lock is held) ==="
timeout 5 sqlite3 data/user-1.db "SELECT COUNT(*) FROM jobs;" 2>&1
echo "--- WAL checkpoint ---"
timeout 5 sqlite3 data/user-1.db "PRAGMA wal_checkpoint(PASSIVE);" 2>&1

echo
echo "=== related processes (claude, tsx, playwright, scraper) ==="
pgrep -af 'claude|tsx|playwright|auto-eval|scraper' 2>&1 | head -20

echo
echo "=== pm2 logs jobhq-dev (last 80 lines, no stream) ==="
pm2 logs jobhq-dev --lines 80 --nostream 2>&1 | tail -80

echo
echo "=== END ($(date -Iseconds)) ==="
echo "Output written to: $out"
