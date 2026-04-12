#!/usr/bin/env bash
# Prepares an offline bundle for Ansible deployment.
# Run once on an internet-connected machine.
#
# Produces: opencode-bundle-{version}.tar.gz at the project root.
# Bundle contains: opencode-linux-x64, node_modules.tar.gz, api.json,
#                  checksums.sha256, bundle.version
#
# Usage:
#   ./fetch-binaries.sh                          # version from defaults/main.yml
#   ./fetch-binaries.sh --version 1.4.3
#   ./fetch-binaries.sh --sdk-version 2.0.41     # override ai-sdk version
#   ./fetch-binaries.sh --refresh-deps           # force rebuild of node_modules
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULTS="${SCRIPT_DIR}/roles/opencode/defaults/main.yml"
GROUP_VARS_DIR="${SCRIPT_DIR}/group_vars"

OPENCODE_BASE_URL="${OPENCODE_BASE_URL:-https://github.com/anomalyco/opencode/releases/download}"
MODELS_API_URL="${MODELS_API_URL:-https://models.dev/api.json}"

OC_VERSION=""
SDK_VERSION=""
FORCE_DEPS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v)    OC_VERSION="$2";  shift 2 ;;
    --sdk-version)   SDK_VERSION="$2"; shift 2 ;;
    --refresh-deps)  FORCE_DEPS=true;  shift ;;
    --help|-h)
      echo "Usage: $0 [--version X.Y.Z] [--sdk-version X.Y.Z] [--refresh-deps]"
      echo ""
      echo "  --version X.Y.Z     opencode version (default: from defaults/main.yml)"
      echo "  --sdk-version X.Y.Z @ai-sdk/openai-compatible version (default: auto-resolved)"
      echo "  --refresh-deps      Force rebuild of node_modules"
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$OC_VERSION" ]]; then
  [[ -f "$DEFAULTS" ]] || { echo "ERROR: $DEFAULTS not found — use --version X.Y.Z" >&2; exit 1; }
  OC_VERSION=$(grep "^opencode_version:" "$DEFAULTS" | head -1 \
    | sed 's/.*opencode_version:[[:space:]]*//' | tr -d '"' | tr -d "'" | tr -d ' ')
fi
[[ -n "$OC_VERSION" ]] || { echo "ERROR: version not found. Use --version X.Y.Z" >&2; exit 1; }

# Auto-resolve @ai-sdk/openai-compatible version from npm release dates.
resolve_sdk_version() {
  python3 - "$1" << 'PY'
import urllib.request, json, sys
oc_version = sys.argv[1]
try:
  with urllib.request.urlopen("https://registry.npmjs.org/opencode-ai") as r:
    oc_data = json.load(r)
  oc_time = oc_data.get("time", {}).get(oc_version)
  if not oc_time:
    print(f"ERROR: opencode-ai@{oc_version} not found in npm registry", file=sys.stderr)
    sys.exit(1)
  with urllib.request.urlopen("https://registry.npmjs.org/@ai-sdk/openai-compatible") as r:
    sdk_data = json.load(r)
  stable = [
    (v, t) for v, t in sdk_data.get("time", {}).items()
    if v not in ("created", "modified")
    and "beta" not in v and "alpha" not in v and "0.0.0-" not in v
    and t <= oc_time
  ]
  stable.sort(key=lambda x: x[1], reverse=True)
  if not stable:
    print("ERROR: no matching @ai-sdk/openai-compatible version found", file=sys.stderr)
    sys.exit(1)
  print(stable[0][0])
except Exception as e:
  print(f"ERROR: {e}", file=sys.stderr)
  sys.exit(1)
PY
}

if [[ -z "$SDK_VERSION" ]]; then
  echo "Resolving @ai-sdk/openai-compatible version for opencode ${OC_VERSION}..."
  SDK_VERSION=$(resolve_sdk_version "$OC_VERSION")
  echo "  → @ai-sdk/openai-compatible@${SDK_VERSION}"
fi

BUNDLE="${SCRIPT_DIR}/opencode-bundle-${OC_VERSION}.tar.gz"

# Skip if bundle already exists and --refresh-deps not set
if [[ "$FORCE_DEPS" == "false" ]] && [[ -f "$BUNDLE" ]]; then
  echo ""
  echo "Bundle already exists: $(basename "$BUNDLE") ($(du -sh "$BUNDLE" | cut -f1))"
  echo "Use --refresh-deps to rebuild."
  mkdir -p "$GROUP_VARS_DIR"
  tar -xzf "$BUNDLE" -C "$GROUP_VARS_DIR" ./all.yml --strip-components=0
  echo "Updated: group_vars/all.yml"
  exit 0
fi

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
WORK="${TMP}/bundle"
mkdir -p "$WORK"

echo ""
echo "opencode fetch-binaries"
echo "  opencode : ${OC_VERSION}"
echo "  ai-sdk   : @ai-sdk/openai-compatible@${SDK_VERSION}"
echo ""

# 1. Binary
echo "[1/3] binary    downloading..."
curl -fSL --progress-bar -o "${TMP}/opencode-linux-x64.tar.gz" \
  "${OPENCODE_BASE_URL}/v${OC_VERSION}/opencode-linux-x64.tar.gz"
tar -xzf "${TMP}/opencode-linux-x64.tar.gz" -C "$TMP"
[[ -f "${TMP}/opencode" ]] || { echo "ERROR: binary not found in archive" >&2; exit 1; }
mv "${TMP}/opencode" "${WORK}/opencode-linux-x64"
chmod 0755 "${WORK}/opencode-linux-x64"
CHECKSUM=$(sha256sum "${WORK}/opencode-linux-x64" | awk '{print $1}')
echo "[1/3] binary    ok ($("${WORK}/opencode-linux-x64" --version 2>/dev/null))"

# 2. npm deps
echo "[2/3] npm deps  installing @ai-sdk/openai-compatible@${SDK_VERSION}..."
mkdir -p "${TMP}/deps"
cd "${TMP}/deps"
echo '{"name":"opencode-deps","private":true,"dependencies":{}}' > package.json
npm install --no-bin-links --ignore-scripts --no-audit --no-fund \
  "@ai-sdk/openai-compatible@${SDK_VERSION}" 2>&1 | grep -E "^(added|npm warn)" || true
cd "$SCRIPT_DIR"
tar -czf "${WORK}/node_modules.tar.gz" -C "${TMP}/deps" node_modules
echo "[2/3] npm deps  ok ($(du -sh "${WORK}/node_modules.tar.gz" | cut -f1))"

# 3. Models cache
echo "[3/3] api.json  downloading..."
curl -fSL --progress-bar -o "${WORK}/api.json" "$MODELS_API_URL"
echo "[3/3] api.json  ok ($(du -sh "${WORK}/api.json" | cut -f1))"

# Metadata
echo "${CHECKSUM}  opencode-linux-x64" > "${WORK}/checksums.sha256"
echo "${OC_VERSION}+${SDK_VERSION}" > "${WORK}/bundle.version"
cat > "${WORK}/all.yml" << EOF
---
# Managed by fetch-binaries.sh — do not edit by hand.
opencode_version: "${OC_VERSION}"
opencode_checksum_linux_x64: "${CHECKSUM}"
EOF

# Pack
tar -czf "$BUNDLE" -C "$WORK" .

# Deploy group_vars/all.yml from the bundle (single source of truth)
mkdir -p "$GROUP_VARS_DIR"
tar -xzf "$BUNDLE" -C "$GROUP_VARS_DIR" ./all.yml --strip-components=0

echo ""
echo "Created: $(basename "$BUNDLE") ($(du -sh "$BUNDLE" | cut -f1))"
echo "Updated: group_vars/all.yml"
