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

# Find the next-server worker. Try multiple strategies because Next.js 16's
# worker cmdline doesn't always contain "next-server" or "4001".
NEXT_PID=""
NEXT_PID_HOW=""
# 1) whoever is listening on :4001 (most reliable)
if [ -z "$NEXT_PID" ]; then
  CAND=$(fuser 4001/tcp 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' | head -1)
  if [ -n "$CAND" ]; then NEXT_PID="$CAND"; NEXT_PID_HOW="fuser 4001/tcp"; fi
fi
# 2) ss with listening socket on :4001
if [ -z "$NEXT_PID" ]; then
  CAND=$(ss -ltnp 2>/dev/null | awk '/:4001 /' | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "$CAND" ]; then NEXT_PID="$CAND"; NEXT_PID_HOW="ss -ltnp :4001"; fi
fi
# 3) lsof -iTCP:4001
if [ -z "$NEXT_PID" ]; then
  CAND=$(lsof -iTCP:4001 -sTCP:LISTEN -t 2>/dev/null | head -1)
  if [ -n "$CAND" ]; then NEXT_PID="$CAND"; NEXT_PID_HOW="lsof -iTCP:4001"; fi
fi
# 4) pm2 child of jobhq-dev (highest-CPU non-bash descendant)
if [ -z "$NEXT_PID" ]; then
  PM2_PID=$(pm2 jlist 2>/dev/null | grep -oP '"name":"jobhq-dev"[^}]*"pid":\K[0-9]+' | head -1)
  if [ -n "$PM2_PID" ]; then
    CAND=$(pgrep -P "$PM2_PID" -o 2>/dev/null)
    [ -n "$CAND" ] && CAND=$(pgrep -P "$CAND" -o 2>/dev/null || echo "$CAND")
    if [ -n "$CAND" ]; then NEXT_PID="$CAND"; NEXT_PID_HOW="pm2 child of jobhq-dev ($PM2_PID)"; fi
  fi
fi
# 5) legacy pgrep fallback
if [ -z "$NEXT_PID" ]; then
  CAND=$(pgrep -f 'next-server.*4001' | head -1)
  if [ -n "$CAND" ]; then NEXT_PID="$CAND"; NEXT_PID_HOW="pgrep next-server 4001"; fi
fi

echo
echo "=== next-server pid: ${NEXT_PID:-NOT FOUND} (via ${NEXT_PID_HOW:-none}) ==="
if [ -n "${NEXT_PID:-}" ]; then
  echo "--- cmdline ---"
  tr '\0' ' ' < /proc/"$NEXT_PID"/cmdline 2>&1; echo
  echo
  echo "--- per-thread CPU + wchan (where each thread is blocked in kernel) ---"
  ps -L -p "$NEXT_PID" -o pid,tid,pcpu,stat,wchan,comm 2>&1 | head -30
  echo
  echo "--- top -H (per-thread CPU snapshot) ---"
  top -H -b -n 1 -p "$NEXT_PID" 2>&1 | tail -30
  echo
  echo "--- /proc/$NEXT_PID/status (threads, RSS, voluntary/involuntary ctxt switches) ---"
  grep -E '^(Threads|VmRSS|voluntary_ctxt|nonvoluntary_ctxt|State):' /proc/"$NEXT_PID"/status 2>&1
  echo
  echo "--- /proc/$NEXT_PID/wchan (main thread blocked syscall) ---"
  cat /proc/"$NEXT_PID"/wchan 2>&1; echo
  echo
  echo "--- /proc/$NEXT_PID/stack (kernel stack of main thread, may need sudo) ---"
  cat /proc/"$NEXT_PID"/stack 2>&1 | head -15
  echo
  echo "--- per-thread kernel stacks (top 5 threads) ---"
  for tid in $(ls /proc/"$NEXT_PID"/task/ 2>/dev/null | head -5); do
    echo "[tid=$tid]"
    cat /proc/"$NEXT_PID"/task/"$tid"/wchan 2>&1; echo
    cat /proc/"$NEXT_PID"/task/"$tid"/stack 2>&1 | head -8
    echo
  done
  echo
  echo "--- open fds count by type ---"
  ls /proc/"$NEXT_PID"/fd 2>/dev/null | wc -l | awk '{print "total fds: "$1}'
  ls -la /proc/"$NEXT_PID"/fd 2>/dev/null | awk '{print $NF}' | grep -oE '\.(db|db-wal|db-shm)$|socket|pipe|anon_inode|/dev/null' | sort | uniq -c | sort -rn | head -10
  echo
  echo "=== probe + strace concurrent: trigger /login while attaching strace ==="
  echo "--- launching curl /login in background (max-time 35s) ---"
  ( time curl -sS -o /tmp/diag-login-body.txt -w 'HTTP=%{http_code} TIME_TOTAL=%{time_total} TIME_CONNECT=%{time_connect} TIME_FIRSTBYTE=%{time_starttransfer}\n' --max-time 35 http://127.0.0.1:4001/login ) > /tmp/diag-login.out 2>&1 &
  CURL_PID=$!
  sleep 0.5
  echo "--- strace -c -p $NEXT_PID for 10s (during the /login probe) ---"
  echo "(needs ptrace_scope=0 or sudo; if EPERM, run: sudo bash $0)"
  timeout 10 strace -c -f -p "$NEXT_PID" 2>&1 | tail -40
  echo
  echo "--- strace -e read,write,epoll_wait,futex,fdatasync -tt for 5s (timed) ---"
  timeout 5 strace -f -e trace=read,write,epoll_wait,futex,fdatasync -tt -p "$NEXT_PID" 2>&1 | tail -40
  wait "$CURL_PID" 2>/dev/null
  echo
  echo "--- /login probe result ---"
  cat /tmp/diag-login.out 2>&1
  echo "--- /login response body (first 200 chars) ---"
  head -c 200 /tmp/diag-login-body.txt 2>&1; echo
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
echo "=== next steps if stall persists ==="
cat <<'HINT'
1. CPU profile via SIGUSR2 (writes cpu-profile-<ts>.cpuprofile to cwd):
     PID=$(pgrep -f 'next-server' | head -1) && kill -USR2 "$PID"
   Then load the .cpuprofile file in Chrome DevTools → Performance → Load profile.

2. Live JS inspect via Node inspector (already enabled on 127.0.0.1:9229):
     # from your laptop:
     ssh -N -L 9229:127.0.0.1:9229 <host>
     # then open chrome://inspect → "Open dedicated DevTools for Node"

3. strace main thread (needs ptrace_scope=0 OR sudo):
     # one-shot (resets on reboot):
     echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
     # or run this script with sudo:
     sudo bash scripts/diag-stuck.sh

4. Tail middleware request log to see what URL is in flight:
     pm2 logs jobhq-dev --lines 200 --nostream | grep '\[req\]' | tail -20
HINT

echo
echo "=== END ($(date -Iseconds)) ==="
echo "Output written to: $out"
