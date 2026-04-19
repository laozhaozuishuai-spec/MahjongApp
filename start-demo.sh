#!/usr/bin/env bash
# 一键试玩：HTTP 静态页 + WebSocket 中继同一端口（Ctrl+C 结束）
# 端口被占用时可覆盖，例如：RELAY_PORT=31988 bash start-demo.sh
set -e
cd "$(dirname "$0")"
RELAY_PORT="${RELAY_PORT:-31987}"
export PORT="$RELAY_PORT"
echo "请在浏览器打开: http://127.0.0.1:${RELAY_PORT}/ （联机地址默认与页面同源）"
exec node server/index.js
