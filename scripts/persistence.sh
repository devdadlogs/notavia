#!/usr/bin/env bash

PERSISTENCE_SUBDIRS="app qdrant ollama whisper postgres redis backups"
LEGACY_VOLUME_KEYS="notavia_data qdrant_data ollama_data whisper_data postgres_data redis_data"
LEGACY_TARGET_DIRS="app qdrant ollama whisper postgres redis"

read_env_value() {
    local key="$1" file="$2" value=""
    [ -f "$file" ] || return 0
    value="$(sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1)"
    case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    printf '%s' "$value"
}

resolve_data_dir() {
    local root_dir="$1" env_file="$2" configured="${NOTAVIA_DATA_DIR:-}"
    [ -n "$configured" ] || configured="$(read_env_value NOTAVIA_DATA_DIR "$env_file")"
    [ -n "$configured" ] || configured="${HOME}/.notavia/data"
    case "$configured" in
        /*) ;;
        *) configured="${root_dir}/${configured}" ;;
    esac
    mkdir -p "$configured"
    (cd "$configured" && pwd -P)
}

prepare_data_dir() {
    local data_dir="$1" dir available_kb
    case "$data_dir" in
        /|/tmp|/tmp/*|/private/tmp|/private/tmp/*|/var/tmp|/var/tmp/*)
            echo "❌ 数据目录不能使用根目录或临时目录：$data_dir" >&2
            return 1
            ;;
    esac
    umask 077
    for dir in $PERSISTENCE_SUBDIRS; do
        mkdir -p "$data_dir/$dir"
    done
    chmod 700 "$data_dir" "$data_dir/backups" 2>/dev/null || true
    if [ ! -w "$data_dir/app" ]; then
        echo "❌ 数据目录不可写：$data_dir" >&2
        return 1
    fi
    available_kb="$(df -Pk "$data_dir" | awk 'NR==2 {print $4}')"
    if [ -n "$available_kb" ] && [ "$available_kb" -lt 5242880 ]; then
        echo "⚠️  数据磁盘剩余空间不足 5GB，本地模型可能无法下载。" >&2
    fi
}

verify_docker_mount_access() {
    local data_dir="$1"
    if ! docker run --rm -v "$data_dir:/probe" alpine:3.22 sh -c 'touch /probe/.notavia-write-test && rm /probe/.notavia-write-test' >/dev/null; then
        echo "❌ Docker 无法读写数据目录：$data_dir" >&2
        echo "   macOS 用户请在 Docker Desktop 的文件共享设置中允许该目录。" >&2
        return 1
    fi
}

project_name() {
    local root_dir="$1" name="${COMPOSE_PROJECT_NAME:-}"
    [ -n "$name" ] || name="$(read_env_value COMPOSE_PROJECT_NAME "$root_dir/.env")"
    [ -n "$name" ] || name="$(basename "$root_dir" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
    printf '%s' "$name"
}

find_legacy_volume() {
    local project="$1" key="$2" found=""
    found="$(docker volume ls \
        --filter "label=com.docker.compose.project=$project" \
        --filter "label=com.docker.compose.volume=$key" \
        --format '{{.Name}}' | head -n 1)"
    if [ -z "$found" ] && docker volume inspect "${project}_${key}" >/dev/null 2>&1; then
        found="${project}_${key}"
    fi
    printf '%s' "$found"
}

directory_is_empty() {
    [ -z "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]
}

legacy_data_requires_migration() {
    local root_dir="$1" data_dir="$2" project volume
    project="$(project_name "$root_dir")"
    volume="$(find_legacy_volume "$project" notavia_data)"
    [ -n "$volume" ] && directory_is_empty "$data_dir/app"
}

migrate_legacy_volumes() {
    local root_dir="$1" data_dir="$2" project key target volume found=0 index=1
    project="$(project_name "$root_dir")"

    for key in $LEGACY_VOLUME_KEYS; do
        target="$(printf '%s\n' $LEGACY_TARGET_DIRS | sed -n "${index}p")"
        volume="$(find_legacy_volume "$project" "$key")"
        if [ -n "$volume" ]; then
            found=1
            if ! directory_is_empty "$data_dir/$target"; then
                echo "❌ 目标目录已有数据，迁移已取消：$data_dir/$target" >&2
                return 1
            fi
        fi
        index=$((index + 1))
    done
    if [ "$found" -eq 0 ]; then
        echo "❌ 没有找到项目 $project 的旧 Docker 命名卷。" >&2
        return 1
    fi

    echo "⏸️  正在停止服务，准备只读复制旧数据..."
    docker compose stop
    index=1
    for key in $LEGACY_VOLUME_KEYS; do
        target="$(printf '%s\n' $LEGACY_TARGET_DIRS | sed -n "${index}p")"
        volume="$(find_legacy_volume "$project" "$key")"
        if [ -n "$volume" ]; then
            echo "   $volume → $data_dir/$target"
            if ! docker run --rm \
                -v "$volume:/source:ro" \
                -v "$data_dir/$target:/target" \
                alpine:3.22 sh -c 'cp -a /source/. /target/'; then
                docker compose start
                echo "❌ 旧卷复制失败，服务已重新启动；旧命名卷没有被删除。" >&2
                return 1
            fi
        fi
        index=$((index + 1))
    done
    echo "✅ 旧数据复制完成。旧命名卷仍然保留，可用于回退。"
}

backup_data() {
    local data_dir="$1" label="${2:-notavia}" timestamp archive
    timestamp="$(date '+%Y%m%d-%H%M%S')"
    archive="$data_dir/backups/${label}-${timestamp}.tar.gz"
    echo "⏸️  正在停止服务，创建一致性备份..."
    docker compose stop
    if ! docker run --rm \
        -v "$data_dir:/data:ro" \
        -v "$data_dir/backups:/backup" \
        alpine:3.22 tar czf "/backup/$(basename "$archive")" -C /data app qdrant ollama whisper postgres redis; then
        docker compose start
        echo "❌ 备份失败，服务已重新启动。" >&2
        return 1
    fi
    docker compose start
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$archive" > "$archive.sha256"
    else
        sha256sum "$archive" > "$archive.sha256"
    fi
    echo "✅ 备份完成：$archive"
}

validate_backup_archive() {
    local archive="$1"
    [ -f "$archive" ] || { echo "❌ 找不到备份文件：$archive" >&2; return 1; }
    if tar tzf "$archive" | grep -E '(^/|(^|/)\.\.(/|$))' >/dev/null; then
        echo "❌ 备份包包含不安全路径，拒绝恢复。" >&2
        return 1
    fi
    if ! tar tzf "$archive" | grep -E '^app(/|$)' >/dev/null; then
        echo "❌ 备份包缺少 app 数据目录。" >&2
        return 1
    fi
}

restore_data() {
    local data_dir="$1" archive="$2" answer dir archive_dir staging_dir
    archive_dir="$(cd "$(dirname "$archive")" 2>/dev/null && pwd -P)" || {
        echo "❌ 找不到备份文件所在目录：$(dirname "$archive")" >&2
        return 1
    }
    archive="$archive_dir/$(basename "$archive")"
    validate_backup_archive "$archive"
    echo "⚠️  恢复会替换当前应用数据：$data_dir"
    printf '请输入 RESTORE 继续：'
    read -r answer
    [ "$answer" = "RESTORE" ] || { echo "已取消恢复。"; return 1; }

    staging_dir="$data_dir/.restore-staging"
    mkdir -p "$staging_dir"
    docker run --rm -v "$staging_dir:/staging" alpine:3.22 sh -c 'find /staging -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
    if ! docker run --rm \
        -v "$staging_dir:/staging" \
        -v "$archive:/backup.tar.gz:ro" \
        alpine:3.22 sh -c 'tar xzf /backup.tar.gz -C /staging && test -d /staging/app && ! find /staging -type l -print -quit | grep -q .'; then
        echo "❌ 备份包无法完整解压或包含符号链接，当前数据没有改动。" >&2
        return 1
    fi

    backup_data "$data_dir" "pre-restore"
    docker compose stop
    for dir in app qdrant ollama whisper postgres redis; do
        if ! docker run --rm \
            -v "$data_dir/$dir:/target" \
            -v "$staging_dir/$dir:/source:ro" \
            alpine:3.22 sh -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && if [ -d /source ]; then cp -a /source/. /target/; fi'; then
            echo "❌ 恢复过程中写入失败。服务保持停止，请使用 backups 中的 pre-restore 备份重试。" >&2
            return 1
        fi
    done
    docker run --rm -v "$staging_dir:/staging" alpine:3.22 sh -c 'find /staging -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
    rmdir "$staging_dir" 2>/dev/null || true
    docker compose start
    echo "✅ 数据恢复完成。恢复前的自动备份保存在 $data_dir/backups。"
}
