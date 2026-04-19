#!/usr/bin/env bash
# 一键试玩：中继 + 静态页（Ctrl+C 结束）
# 端口被占用时可覆盖，例如：RELAY_PORT=31988 HTTP_PORT=31981 bash start-demo.sh
set -e
cd "$(dirname "$0")"
RELAY_PORT="${RELAY_PORT:-31987}"
HTTP_PORT="${HTTP_PORT:-31980}"
export PORT="$RELAY_PORT"
node server/index.js &
RELAY_PID=$!
cleanup(){ kill "$RELAY_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
sleep 0.2
echo "页面请打开: http://127.0.0.1:${HTTP_PORT}/index.html"
echo "联机地址填: ws://127.0.0.1:${RELAY_PORT}"
python3 -m http.server "$HTTP_PORT"
