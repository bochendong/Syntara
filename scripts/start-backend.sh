#!/usr/bin/env bash
# 启动本机 Homebrew PostgreSQL，并执行 prisma db push（读 .env.local）。
# 用法：
#   bash scripts/start-backend.sh           # 仅准备数据库
#   bash scripts/start-backend.sh --dev    # 准备数据库后启动 next dev（含 API）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_DEV=0
for a in "$@"; do
  if [[ "$a" == "--dev" ]]; then WITH_DEV=1; fi
done

if [[ ! -f .env.local ]]; then
  echo "错误: 未找到 .env.local。请从 .env.example 复制并配置 DATABASE_URL。"
  exit 1
fi

if ! grep -qE '^DATABASE_URL=.+' .env.local; then
  echo "错误: .env.local 中未设置 DATABASE_URL。"
  echo "示例（本机 Homebrew，用户名为你的 macOS 登录名）:"
  echo "  DATABASE_URL=\"postgresql://你的用户名@localhost:5432/openmaic\""
  exit 1
fi

# Homebrew：Apple Silicon / Intel
PG_BIN=""
for d in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
  if [[ -x "$d/pg_isready" ]]; then
    PG_BIN="$d"
    break
  fi
done

if [[ -z "$PG_BIN" ]]; then
  echo "错误: 未找到 Homebrew 的 postgresql@16（pg_isready）。"
  echo "请先安装: brew install postgresql@16"
  exit 1
fi
export PATH="${PG_BIN}:${PATH}"

if command -v brew >/dev/null 2>&1; then
  echo "==> 启动 PostgreSQL (brew services start postgresql@16)"
  brew services start postgresql@16 >/dev/null 2>&1 || true
else
  echo "提示: 未找到 brew，假设 PostgreSQL 已在运行。"
fi

echo "==> 等待数据库接受连接（localhost:5432，最多 60 秒）"
ready=0
for _ in $(seq 1 60); do
  if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "错误: 数据库未就绪。可尝试: brew services restart postgresql@16"
  exit 1
fi

echo "==> 同步 Prisma 表结构 (pnpm db:push)"
pnpm db:push

echo ""
echo "数据库已就绪。"

if [[ "$WITH_DEV" -eq 1 ]]; then
  echo "==> 启动 Next 开发服务（含 /api）"
  exec pnpm dev
else
  echo "下一步: pnpm dev"
  echo "或一条命令: pnpm backend:dev"
fi
