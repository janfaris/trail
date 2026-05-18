const SCRIPT = `#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Trail CLI installer
#
# TODO: replace the clone+build pipeline below with:
#         npm install -g @trail/cli
#       once the package is published to npm. Until then, this script clones
#       the repo, builds the CLI workspace, and symlinks the binary into
#       ~/.local/bin/trail.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="https://github.com/janfaris/trail.git"
SRC_DIR="\${HOME}/.trail-src"
BIN_DIR="\${HOME}/.local/bin"
BIN_PATH="\${BIN_DIR}/trail"

c_dim()  { printf "\\033[2m%s\\033[0m\\n" "$1"; }
c_ok()   { printf "\\033[32m%s\\033[0m\\n" "$1"; }
c_warn() { printf "\\033[33m%s\\033[0m\\n" "$1"; }
c_err()  { printf "\\033[31m%s\\033[0m\\n" "$1" >&2; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    c_err "missing prerequisite: $1"
    case "$1" in
      node) c_err "  install Node 20+: https://nodejs.org or 'brew install node'" ;;
      pnpm) c_err "  install pnpm: 'npm install -g pnpm' or https://pnpm.io/installation" ;;
      git)  c_err "  install git: https://git-scm.com/downloads" ;;
    esac
    exit 1
  fi
}

echo
c_dim "→ checking prerequisites (node, pnpm, git)…"
need node
need pnpm
need git
c_ok  "✓ prerequisites ok"

echo
if [ -d "\${SRC_DIR}/.git" ]; then
  c_dim "→ updating existing checkout at \${SRC_DIR}…"
  git -C "\${SRC_DIR}" pull --ff-only
else
  c_dim "→ cloning \${REPO} → \${SRC_DIR}…"
  git clone --depth=1 "\${REPO}" "\${SRC_DIR}"
fi

echo
c_dim "→ installing workspace deps (pnpm install)…"
( cd "\${SRC_DIR}" && pnpm install --frozen-lockfile=false )

echo
c_dim "→ building @trail/cli…"
( cd "\${SRC_DIR}" && pnpm --filter @trail/cli build )

echo
c_dim "→ linking binary → \${BIN_PATH}…"
mkdir -p "\${BIN_DIR}"
ln -sf "\${SRC_DIR}/apps/cli/dist/index.js" "\${BIN_PATH}"
chmod +x "\${SRC_DIR}/apps/cli/dist/index.js" || true

if ! echo ":\${PATH}:" | grep -q ":\${BIN_DIR}:"; then
  c_warn "! \${BIN_DIR} is not on your PATH"
  c_warn "  add this to your shell profile (~/.zshrc, ~/.bashrc):"
  c_warn "    export PATH=\\"\${BIN_DIR}:\\\$PATH\\""
fi

echo
c_ok "✓ trail installed"
echo
c_dim "next steps:"
echo  "  trail login         # pair the CLI with your GitHub account"
echo  "  trail record        # start capturing sessions"
echo  "  trail share latest  # publish your most recent session"
echo
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
