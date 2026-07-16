#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker &> /dev/null; then
    echo "❌ 错误：未检测到 Docker，请先安装并启动 Docker Desktop。"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ 错误：当前 Docker 未安装 Compose 插件。"
    exit 1
fi

if [ ! -f .env ]; then
    echo "❌ 错误：未找到 .env，请先执行：cp .env.example .env"
    exit 1
fi

echo "🚀 正在构建并启动 Notavia 全部服务..."
docker compose up -d --build

echo ""
echo "✅ Notavia 全部服务已启动"
echo "   Web：http://localhost:8080（如配置 WEB_PORT，请使用对应端口）"
echo "   查看状态：docker compose ps"
echo "   查看日志：docker compose logs -f"
echo "   停止服务：docker compose down"
