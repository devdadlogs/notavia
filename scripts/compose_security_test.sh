#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export JWT_SECRET="ci-test-secret-at-least-thirty-two-characters"
CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
export CREDENTIAL_ENCRYPTION_KEY
export DB_PASSWORD="ci-postgres-password"
export NOTAVIA_DATA_DIR="${TMPDIR:-/tmp}/notavia-compose-security"

default_json="$(docker compose config --format json)"
debug_json="$(docker compose --profile debug config --format json)"

DEFAULT_JSON="$default_json" DEBUG_JSON="$debug_json" python3 - <<'PY'
import json, os

default = json.loads(os.environ["DEFAULT_JSON"])
debug = json.loads(os.environ["DEBUG_JSON"])

published = []
for name, service in default["services"].items():
    for port in service.get("ports", []):
        published.append((name, int(port["published"]), port.get("host_ip")))
if published != [("web", 8080, None)]:
    raise SystemExit(f"default stack exposes unexpected ports: {published}")

debug_ports = debug["services"]["debug-ports"].get("ports", [])
if not debug_ports or any(port.get("host_ip") != "127.0.0.1" for port in debug_ports):
    raise SystemExit(f"debug ports must bind loopback: {debug_ports}")
print("PASS: compose network exposure")
PY
