#!/usr/bin/env bash
# 仅启动 Next 前端开发服务（页面 + /api，与 pnpm dev 等价）。
# 用法：
#   bash scripts/start-frontend.sh           # 直接启动
#   bash scripts/start-frontend.sh --clean   # 先删除 .next 再启动（缓解缓存损坏 / lock 冲突）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CLEAN=0
for a in "$@"; do
  if [[ "$a" == "--clean" ]]; then CLEAN=1; fi
done

if [[ "$CLEAN" -eq 1 ]]; then
  echo "==> 清理 .next"
  rm -rf .next
fi

if [[ ! -f .env.local ]]; then
  echo "提示: 未找到 .env.local，部分功能可能不可用。可从 .env.example 复制。"
fi

if [[ -f .next/dev/lock ]]; then
  echo "警告: 存在 .next/dev/lock，说明可能仍有其它 next dev 在跑。"
  echo "      若报错「Unable to acquire lock」，请先结束其它终端里的 pnpm dev，或改用: $0 --clean"
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -i :3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "提示: 端口 3000 已被占用，Next 会自动改用其它端口（见启动日志里的 Local URL）。"
  fi
fi

echo "==> 启动 Next 开发服务（pnpm dev）"
exec pnpm dev
