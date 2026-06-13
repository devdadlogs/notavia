#!/bin/bash

# --- NovaNote Frontend Startup Script ---
echo "🚀 正在检查并启动前端服务 (NovaNote Web)..."

# 1. 确保进入前端目录
cd "$(dirname "$0")/apps/web" || exit 1

# 2. 检查 Node.js/pnpm 环境
if command -v pnpm &> /dev/null; then
    echo "✨ 检测到 pnpm，正在使用 pnpm 启动前端..."
    pnpm dev
elif command -v npm &> /dev/null; then
    echo "⚠️ 未检测到 pnpm，正在使用 npm 启动前端..."
    npm run dev
else
    echo "❌ 错误: 未检测到 Node.js 环境，请先安装 Node.js (https://nodejs.org/)"
    exit 1
fi
