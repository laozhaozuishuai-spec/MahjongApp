#!/usr/bin/env bash
# 从 Flaticon「mahjong」搜索结果页抓取 CDN 地址并下载 512px PNG 到 assets/flaticon/png/
# 使用须遵守 https://www.flaticon.com/legal （免费需署名作者）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/assets/flaticon/png"
SEARCH="${1:-https://www.flaticon.com/free-icons/mahjong}"
TMP="${TMPDIR:-/tmp}/flaticon-mahjong-$$.html"
mkdir -p "$OUT"
echo "Fetching search page: $SEARCH"
curl -sL "$SEARCH" -o "$TMP"
COUNT=0
while IFS= read -r url; do
  id="${url##*/}"
  id="${id%.png}"
  u512="${url/\/128\//\/512\/}"
  dest="$OUT/${id}.png"
  if [[ -f "$dest" ]]; then
    continue
  fi
  if curl -sfL "$u512" -o "$dest" 2>/dev/null; then
    echo "  ok $id"
    COUNT=$((COUNT+1))
  elif curl -sfL "$url" -o "$dest" 2>/dev/null; then
    echo "  ok $id (128)"
    COUNT=$((COUNT+1))
  else
    echo "  fail $id" >&2
    rm -f "$dest"
  fi
done < <(grep -oE 'https://cdn-icons-png\.flaticon\.com/[0-9]+/[0-9]+/[0-9]+\.png' "$TMP" | sort -u)
rm -f "$TMP"
echo "Done. New/fetched: $COUNT files in $OUT"
