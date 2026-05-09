#!/bin/bash
# Lightweight perf pulse: one-line snapshot of next-server resource state.
# Designed to run every 60s under PM2. Stays under ~100ms wall time.
#
# Output goes to ~/perf-pulse.log (one CSV-ish line per call).
# Read after a stall: tail / grep / awk to spot fd_db growth or accept_recvq>0.

set -u

LOGFILE="${PERF_PULSE_LOG:-$HOME/perf-pulse.log}"
PORT="${PERF_PULSE_PORT:-4001}"

# Resolve PID via the listening port — pgrep would also match the :3001 main-branch
# next-server, which is a different process and would mislead the metrics.
PID=$(fuser "$PORT/tcp" 2>/dev/null | tr -d ' ')
if [ -z "$PID" ] || [ ! -d "/proc/$PID" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),pid=none" >> "$LOGFILE"
  exit 0
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TOTAL_FD=$(ls /proc/$PID/fd 2>/dev/null | wc -l)
DB_FD=$(ls -l /proc/$PID/fd 2>/dev/null | grep -c '\.db')
WAL_FD=$(ls -l /proc/$PID/fd 2>/dev/null | grep -c '\.db-wal')
SOCK_FD=$(ls -l /proc/$PID/fd 2>/dev/null | grep -c 'socket:')
VMSIZE_KB=$(awk '/^VmSize:/{print $2}' /proc/$PID/status 2>/dev/null)
RSS_KB=$(awk '/^VmRSS:/{print $2}' /proc/$PID/status 2>/dev/null)
THREADS=$(awk '/^Threads:/{print $2}' /proc/$PID/status 2>/dev/null)
CPU=$(top -bn1 -p $PID 2>/dev/null | tail -1 | awk '{print $9}')
# ss output: State Recv-Q Send-Q ...
RECVQ=$(ss -lnt "sport = :$PORT" 2>/dev/null | awk 'NR==2{print $2}')
[ -z "$RECVQ" ] && RECVQ=na

printf '%s,pid=%s,fd_total=%s,fd_db=%s,fd_wal=%s,fd_sock=%s,vmsize_mb=%s,rss_mb=%s,threads=%s,cpu=%s,accept_recvq=%s\n' \
  "$TS" "$PID" "$TOTAL_FD" "$DB_FD" "$WAL_FD" "$SOCK_FD" \
  "$((${VMSIZE_KB:-0}/1024))" "$((${RSS_KB:-0}/1024))" \
  "${THREADS:-na}" "${CPU:-na}" "$RECVQ" >> "$LOGFILE"
