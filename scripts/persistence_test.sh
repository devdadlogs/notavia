#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=persistence.sh
# shellcheck disable=SC1091
source "$SCRIPT_DIR/persistence.sh"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_eq() { [ "$1" = "$2" ] || fail "expected '$2', got '$1'"; }

unset NOTAVIA_DATA_DIR
HOME="$TMP_ROOT/home"
mkdir -p "$HOME"
resolved="$(resolve_data_dir "$TMP_ROOT/repo" "$TMP_ROOT/missing.env")"
expected="$(cd "$HOME/.notavia/data" && pwd -P)"
assert_eq "$resolved" "$expected"

mkdir -p "$TMP_ROOT/repo"
printf 'NOTAVIA_DATA_DIR=../external-data\n' > "$TMP_ROOT/repo/.env"
resolved="$(resolve_data_dir "$TMP_ROOT/repo" "$TMP_ROOT/repo/.env")"
expected="$(cd "$TMP_ROOT/external-data" && pwd -P)"
assert_eq "$resolved" "$expected"

prepare_data_dir "$resolved"
for dir in $PERSISTENCE_SUBDIRS; do
    [ -d "$resolved/$dir" ] || fail "missing directory $dir"
done

if prepare_data_dir "/tmp/notavia-unsafe" >/dev/null 2>&1; then
    fail "temporary data directory should be rejected"
fi

directory_is_empty "$resolved/app" || fail "new app directory should be empty"
touch "$resolved/app/notavia.db"
if directory_is_empty "$resolved/app"; then
    fail "non-empty app directory was treated as empty"
fi

mkdir -p "$TMP_ROOT/archive/app"
printf 'database' > "$TMP_ROOT/archive/app/notavia.db"
tar czf "$TMP_ROOT/valid.tar.gz" -C "$TMP_ROOT/archive" app
validate_backup_archive "$TMP_ROOT/valid.tar.gz" || fail "valid backup was rejected"
printf 'other' > "$TMP_ROOT/archive/other.txt"
tar czf "$TMP_ROOT/invalid.tar.gz" -C "$TMP_ROOT/archive" other.txt
if validate_backup_archive "$TMP_ROOT/invalid.tar.gz" >/dev/null 2>&1; then
    fail "backup without app directory was accepted"
fi

docker() {
    if [ "$1 $2" = "volume ls" ]; then
        echo "notavia_notavia_data"
        return 0
    fi
    if [ "$1 $2" = "volume inspect" ]; then
        return 0
    fi
    return 0
}

rm -f "$resolved/app/notavia.db"
legacy_data_requires_migration "$TMP_ROOT/notavia" "$resolved" || fail "legacy volume should require migration"
touch "$resolved/app/notavia.db"
if legacy_data_requires_migration "$TMP_ROOT/notavia" "$resolved"; then
    fail "non-empty bind directory should not be treated as needing migration"
fi

echo "PASS: persistence helpers"
