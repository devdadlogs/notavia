#!/bin/bash

# --- NovaNote Backend Startup Script with Hot Reload ---
echo "🚀 正在检查并启动后端服务 (NovaNote Server)..."

# 1. 确保进入后端目录
cd "$(dirname "$0")/apps/server" || exit 1

# 2. 检查 Go 环境是否可用
if ! command -v go &> /dev/null; then
    echo "❌ 错误: 未检测到 Go 语言环境，请先安装 Go (https://go.dev/)"
    exit 1
fi

# 3. 检查并安装热重载工具 Air
GOPATH_BIN="$(go env GOPATH)/bin"
AIR_PATH="$GOPATH_BIN/air"

if [ -f "$AIR_PATH" ] || command -v air &> /dev/null; then
    echo "✨ 检测到已安装热重载工具 Air，准备启动..."
else
    echo "📦 未检测到热重载工具 Air，正在为你自动下载并安装 (可能需要几秒钟)..."
    # 使用较新版 air 的安装路径
    go install github.com/air-verse/air@latest
    if [ $? -ne 0 ]; then
        echo "⚠️ go install 失败，尝试备用地址..."
        go install github.com/cosmtrek/air@latest
    fi
fi

# 4. 再次确认 air 安装状态并运行
if [ -f "$AIR_PATH" ]; then
    echo "🔥 后端热重载服务已启动！代码修改后将自动重新编译..."
    "$AIR_PATH" -c .air.toml
elif command -v air &> /dev/null; then
    echo "🔥 后端热重载服务已启动！代码修改后将自动重新编译..."
    air -c .air.toml
else
    echo "⚠️ 自动安装 Air 失败或 GOPATH 路径未配置，退回到普通启动模式..."
    echo "🔥 后端服务启动中 (无热重载)..."
    go run cmd/server/main.go
fi
