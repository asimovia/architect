#!/usr/bin/env bash
# meshctl.sh — control the MeshKore daemon on this machine.
#   start | stop | restart | status | logs | install | uninstall
# ----------------------------------------------------------------------------
# Put this file in the daemon's install home — the folder that holds
# `.meshkore/scripts/daemon.py` (conventionally ~/meshkore-server):
#
#   curl -fsSL https://architect.meshkore.com/reference/cluster/scripts/meshctl.sh \
#     -o "$HOME_DIR/meshctl.sh" && chmod +x "$HOME_DIR/meshctl.sh"
#
# Every path below is relative to the folder this script lives in, so the
# home can be called anything. The daemon notices the file and advertises
# `"<home>/meshctl.sh" start|stop` in /health.home, which the Architect shows
# when it cannot reach the daemon.
#
# Platforms: macOS (launchd) and Linux (systemd --user). Windows: run
# `py -3 <home>\.meshkore\scripts\daemon.py --root <home>` instead.
#
#   start      start it in its own session (survives closing the terminal);
#              if installed as a service, start the service instead
#   stop       drain running agent turns, stop it, sweep orphaned agents
#   restart    stop + start
#   status     up/down, port, resident or not, running agents
#   logs       follow the log
#   install    make it resident: started at login, restarted if it dies
#   uninstall  remove the service again (the daemon then runs only by hand)
#
# Docs: https://meshkore.com/reference/agents/daemon.md
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON="$HERE/.meshkore/scripts/daemon.py"
RUNTIME="$HERE/.meshkore/.runtime"
TOKEN_FILE="$HERE/.meshkore/credentials/portal-token"
LOG_DIR="$RUNTIME/logs"
LOG_FILE="$LOG_DIR/daemon.out"
PY="${PY:-python3}"
GRACE="${GRACE:-60}"          # seconds a graceful /shutdown may take to drain

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM=macos ;;
  Linux)  PLATFORM=linux ;;
  *) echo "meshctl.sh supports macOS and Linux. On Windows run:" >&2
     echo "  py -3 <home>\\.meshkore\\scripts\\daemon.py --root <home>" >&2
     exit 2 ;;
esac

# macOS: a launchd agent. Its log goes to /tmp and it has no WorkingDirectory
# on purpose — launchd exits 78 when it cannot open the log or chdir, and
# ~/Documents (TCC) is off-limits to launchd agents.
LABEL="com.meshkore.daemon"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LAUNCHD_LOG="/tmp/meshkore-daemon.log"
DOMAIN="gui/$(id -u)"
# Linux: a systemd user unit (+ linger, so it starts at boot without a login).
UNIT="meshkore-daemon"
UNIT_FILE="$HOME/.config/systemd/user/$UNIT.service"

die() { echo "$*" >&2; exit 1; }
[ -f "$DAEMON" ] || die "no daemon at $DAEMON — put meshctl.sh in the folder that holds .meshkore/scripts/daemon.py"

service_file() { if [ "$PLATFORM" = macos ]; then echo "$PLIST"; else echo "$UNIT_FILE"; fi; }
# Installed = a service file exists AND it runs THIS home's daemon. The label
# is per machine, so a file pointing at another home is not ours to drive.
installed()       { [ -f "$(service_file)" ] && grep -qF "$DAEMON" "$(service_file)"; }
foreign_service() { [ -f "$(service_file)" ] && ! grep -qF "$DAEMON" "$(service_file)"; }
service_loaded() {
  if [ "$PLATFORM" = macos ]; then launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1
  else systemctl --user is-active --quiet "$UNIT" 2>/dev/null; fi
}

# Full-path pattern → matches only THIS home's daemon, never another one.
daemon_pids() { pgrep -f "$DAEMON" 2>/dev/null || true; }

# Agent subprocesses the daemon spawned — identified ONLY by the
# MESHKORE_CONV env marker, so your own interactive CLI is never touched.
agent_pids() {
  if [ "$PLATFORM" = macos ]; then
    ps eww -o pid=,command= 2>/dev/null | grep "MESHKORE_CONV=" | grep -v " grep " | awk '{print $1}' || true
  else
    grep -l "MESHKORE_CONV=" /proc/[0-9]*/environ 2>/dev/null | awk -F/ '{print $3}' || true
  fi
}

live_port() {
  local pid="$1" port=""
  if command -v lsof >/dev/null 2>&1; then
    port="$(lsof -nP -iTCP -sTCP:LISTEN -a -p "$pid" 2>/dev/null \
            | grep -oE '(127\.0\.0\.1|\*|localhost):[0-9]+' | grep -oE '[0-9]+$' | head -1 || true)"
  fi
  if [ -z "$port" ] && command -v ss >/dev/null 2>&1; then
    port="$(ss -ltnpH 2>/dev/null | grep "pid=$pid," | awk '{print $4}' | grep -oE '[0-9]+$' | head -1 || true)"
  fi
  if [ -z "$port" ]; then
    port="$(ps -o command= -p "$pid" 2>/dev/null | grep -oE -- '--port[ =]+[0-9]+' | grep -oE '[0-9]+' | head -1 || true)"
  fi
  echo "$port"
}

cmd_status() {
  local pids pid port n agents
  pids="$(daemon_pids)"
  if [ -n "$pids" ]; then
    pid="$(echo "$pids" | head -1)"; port="$(live_port "$pid")"
    echo "daemon:   UP (pid $pid, port ${port:-?})"
    if [ -n "$port" ]; then
      if curl -s -m 3 "https://daemon.meshkore.com:$port/health" >/dev/null 2>&1; then
        echo "tls:      ok (https://daemon.meshkore.com:$port — the browser can reach it)"
      elif curl -sk -m 3 "https://localhost:$port/health" >/dev/null 2>&1; then
        echo "tls:      PROBLEM — answers over https only with -k: the certificate is expired"
        echo "          or does not match. The browser will refuse it. Refresh .meshkore/scripts/tls/."
      else
        echo "tls:      off — plain http only. The HTTPS Architect cannot call it; add .meshkore/scripts/tls/."
      fi
    fi
  else
    echo "daemon:   DOWN"
  fi
  if installed; then
    if [ "$PLATFORM" = macos ]; then
      if service_loaded; then echo "resident: yes ($LABEL, launchd keeps it alive)"
      else echo "resident: installed but not loaded — run: $0 start"; fi
    else
      if service_loaded; then echo "resident: yes ($UNIT, systemd --user keeps it alive)"
      else echo "resident: installed but not active — run: $0 start"; fi
    fi
  elif foreign_service; then
    echo "resident: no — $(service_file) runs a daemon from another folder"
  else
    echo "resident: no — run: $0 install"
  fi
  agents="$(agent_pids)"
  n="$(printf '%s' "$agents" | grep -c . || true)"
  echo "agents:   $n running"
}

start_plain() {
  mkdir -p "$LOG_DIR"
  local port_arg=""
  [ -n "${PORT:-}" ] && port_arg="--port $PORT"
  # Its OWN session (setsid), not just nohup: closing the terminal or the
  # VS Code window that ran this does not take the daemon with it.
  nohup "$PY" -c 'import os, sys; os.setsid(); os.execv(sys.executable, [sys.executable] + sys.argv[1:])' \
    "$DAEMON" --root "$HERE" $port_arg >>"$LOG_FILE" 2>&1 </dev/null &
  disown 2>/dev/null || true
  sleep 3
  if [ -n "$(daemon_pids)" ]; then echo "started (pid $(daemon_pids | head -1)) — logs: $LOG_FILE"
  else echo "FAILED to start — last log lines:"; tail -n 20 "$LOG_FILE" 2>/dev/null || true; return 1; fi
}

cmd_start() {
  if [ -n "$(daemon_pids)" ]; then
    echo "already running (pid $(daemon_pids | tr '\n' ' '))"; cmd_status; return 0
  fi
  if installed; then
    if [ "$PLATFORM" = macos ]; then
      service_loaded || launchctl bootstrap "$DOMAIN" "$PLIST"
      launchctl kickstart "$DOMAIN/$LABEL" 2>/dev/null || true
    else
      systemctl --user start "$UNIT"
    fi
    sleep 4
    if [ -z "$(daemon_pids)" ]; then
      echo "FAILED to start the service — recent log:"; print_service_log 20; return 1
    fi
    echo "started by the service (pid $(daemon_pids | head -1))"
  else
    start_plain
  fi
  cmd_status
}

cmd_stop() {
  local pids pid port token i agents n
  # A resident daemon comes straight back (KeepAlive / Restart=always) —
  # take it out of the service manager first. `start` puts it back.
  if installed && service_loaded; then
    if [ "$PLATFORM" = macos ]; then
      echo "unloading $LABEL from launchd ($0 start reloads it)"
      launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    else
      echo "stopping $UNIT ($0 start brings it back)"
      systemctl --user stop "$UNIT" 2>/dev/null || true
    fi
    sleep 2
  fi
  pids="$(daemon_pids)"
  if [ -n "$pids" ]; then
    pid="$(echo "$pids" | head -1)"; port="$(live_port "$pid")"
    if [ -n "$port" ] && [ -f "$TOKEN_FILE" ]; then
      token="$(cat "$TOKEN_FILE")"
      echo "graceful shutdown on port $port (drains running turns, up to ${GRACE}s)"
      curl -sk -m 15 -X POST "https://127.0.0.1:$port/shutdown" -H "Authorization: Bearer $token" >/dev/null 2>&1 \
        || curl -s -m 15 -X POST "http://127.0.0.1:$port/shutdown" -H "Authorization: Bearer $token" >/dev/null 2>&1 || true
      for ((i=0; i<GRACE; i++)); do
        [ -z "$(daemon_pids)" ] && { echo "  daemon exited cleanly"; break; }
        sleep 1
      done
    fi
    if [ -n "$(daemon_pids)" ]; then
      echo "  still alive → SIGTERM"; pkill -TERM -f "$DAEMON" 2>/dev/null || true; sleep 3
      if [ -n "$(daemon_pids)" ]; then echo "  still alive → SIGKILL"; pkill -KILL -f "$DAEMON" 2>/dev/null || true; fi
    fi
  else
    echo "daemon not running"
  fi
  # Agents are swept only when THIS home had a daemon to stop, so running
  # `stop` against a home that was already down never touches anything.
  [ -n "$pids" ] || { echo "stopped."; return 0; }
  agents="$(agent_pids)"
  n="$(printf '%s' "$agents" | grep -c . || true)"
  if [ "$n" -gt 0 ]; then
    echo "sweeping $n orphaned agent process(es)"
    for p in $agents; do kill -TERM "$p" 2>/dev/null || true; done
    sleep 3
    for p in $(agent_pids); do kill -KILL "$p" 2>/dev/null || true; done
  fi
  echo "stopped."
}

cmd_restart() { cmd_stop; cmd_start; }

print_service_log() {
  local n="${1:-80}"
  if [ "$PLATFORM" = macos ]; then tail -n "$n" "$LAUNCHD_LOG" 2>/dev/null || true
  else journalctl --user -u "$UNIT" -n "$n" --no-pager 2>/dev/null || true; fi
}

cmd_logs() {
  if installed; then
    if [ "$PLATFORM" = macos ]; then tail -n 80 -f "$LAUNCHD_LOG"
    else journalctl --user -u "$UNIT" -n 80 -f; fi
  else
    tail -n 80 -f "$LOG_FILE"
  fi
}

handover_running() {
  if [ -n "$(daemon_pids)" ]; then
    echo "handing the running daemon over to the service…"
    pkill -TERM -f "$DAEMON" 2>/dev/null || true
    local i; for ((i=0; i<30; i++)); do [ -z "$(daemon_pids)" ] && break; sleep 1; done
  fi
}

install_macos() {
  local py mark real i
  py="$(command -v "$PY")" || die "$PY not found"
  mkdir -p "$(dirname "$PLIST")"
  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$py</string>
    <string>$DAEMON</string>
    <string>--root</string>
    <string>$HERE</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$PATH</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LAUNCHD_LOG</string>
  <key>StandardErrorPath</key><string>$LAUNCHD_LOG</string>
</dict></plist>
EOF
  echo "wrote $PLIST"
  handover_running
  service_loaded && launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  mark=$(wc -l <"$LAUNCHD_LOG" 2>/dev/null || echo 0)
  launchctl bootstrap "$DOMAIN" "$PLIST"
  # A launchd agent may not read ~/Documents, ~/Desktop or ~/Downloads unless
  # the Python binary has Full Disk Access. /health stays green while those
  # projects fail — so look for the denial and roll back if it is there.
  echo "checking it can read your projects (20s)…"
  sleep 20
  if tail -n +"$((mark + 1))" "$LAUNCHD_LOG" 2>/dev/null | grep -q "Operation not permitted"; then
    real="$(ps -o command= -p "$(daemon_pids | head -1)" 2>/dev/null | awk '{print $1}')"
    echo ""
    echo "macOS blocks the service from reading some of your projects (privacy / TCC)."
    echo "Rolling back to a plain start so every project keeps working."
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    for ((i=0; i<30; i++)); do [ -z "$(daemon_pids)" ] && break; sleep 1; done
    start_plain
    echo ""
    echo "To make it resident: System Settings → Privacy & Security → Full Disk Access"
    echo "→ add this interpreter, then run: $0 install"
    echo "  ${real:-$py}"
    return 1
  fi
}

install_linux() {
  local py
  py="$(command -v "$PY")" || die "$PY not found"
  command -v systemctl >/dev/null 2>&1 || die "systemctl not found — use '$0 start' (no resident service without systemd)"
  mkdir -p "$(dirname "$UNIT_FILE")"
  cat >"$UNIT_FILE" <<EOF
[Unit]
Description=MeshKore daemon ($HERE)

[Service]
ExecStart="$py" "$DAEMON" --root "$HERE"
Environment="PATH=$PATH"
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
  echo "wrote $UNIT_FILE"
  handover_running
  systemctl --user daemon-reload
  systemctl --user enable --now "$UNIT"
  # Start at boot without an open login session.
  loginctl enable-linger "$USER" 2>/dev/null \
    || echo "note: 'loginctl enable-linger $USER' failed — it will start at login, not at boot"
  sleep 4
}

cmd_install() {
  if foreign_service && [ -z "${FORCE:-}" ]; then
    die "$(service_file) already runs a daemon from another folder (one daemon per machine). Uninstall that one, or re-run with FORCE=1 to point the service here."
  fi
  if [ "$PLATFORM" = macos ]; then install_macos; else install_linux; fi
  cmd_status
}

cmd_uninstall() {
  if foreign_service && [ -z "${FORCE:-}" ]; then
    die "$(service_file) belongs to a daemon in another folder — not removing it (FORCE=1 to remove anyway)."
  fi
  if [ "$PLATFORM" = macos ]; then
    service_loaded && launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST" && echo "removed $PLIST"
  else
    systemctl --user disable --now "$UNIT" 2>/dev/null || true
    rm -f "$UNIT_FILE" && echo "removed $UNIT_FILE"
    systemctl --user daemon-reload 2>/dev/null || true
  fi
  echo "the daemon now runs only by hand: $0 start"
  cmd_status
}

case "${1:-status}" in
  start)     cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_restart ;;
  status)    cmd_status ;;
  logs)      cmd_logs ;;
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  -h|--help|help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) echo "usage: $0 {start|stop|restart|status|logs|install|uninstall}" >&2; exit 2 ;;
esac
