#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/persistence.sh
source "$ROOT_DIR/scripts/persistence.sh"

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

DATA_DIR="$(resolve_data_dir "$ROOT_DIR" "$ROOT_DIR/.env")"
prepare_data_dir "$DATA_DIR"
export NOTAVIA_DATA_DIR="$DATA_DIR"
verify_docker_mount_access "$DATA_DIR"

ACTION="${1:-}"
if [ "$ACTION" != "--migrate-volumes" ] && legacy_data_requires_migration "$ROOT_DIR" "$DATA_DIR"; then
    echo "❌ 检测到旧 Docker 命名卷，但新的宿主机数据目录还是空的。" >&2
    echo "   为避免看起来像数据丢失，请先执行：./start.sh --migrate-volumes" >&2
    exit 1
fi

case "$ACTION" in
    --migrate-volumes)
        migrate_legacy_volumes "$ROOT_DIR" "$DATA_DIR"
        ;;
    --backup)
        backup_data "$DATA_DIR"
        exit 0
        ;;
    --restore)
        [ -n "${2:-}" ] || { echo "用法：./start.sh --restore <备份文件>" >&2; exit 1; }
        restore_data "$DATA_DIR" "$2"
        exit 0
        ;;
    "") ;;
    *)
        echo "用法：./start.sh [--migrate-volumes|--backup|--restore <备份文件>]" >&2
        exit 1
        ;;
esac

echo "🚀 正在构建并启动 Notavia 全部服务..."
echo "📁 数据目录：$DATA_DIR"
echo "   删除 Docker 容器不会删除这里的数据。"
docker compose up -d --build

echo ""
echo "✅ Notavia 全部服务已启动"
echo "   Web：http://localhost:8080（如配置 WEB_PORT，请使用对应端口）"
echo "   查看状态：docker compose ps"
echo "   查看日志：docker compose logs -f"
echo "   停止服务：docker compose down"
echo "   创建备份：./start.sh --backup"
