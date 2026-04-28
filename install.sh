#!/usr/bin/env bash
set -euo pipefail

PKG="@bubuding0809/blob-cli"
MIN_NODE=18

c_red=$'\033[31m'
c_green=$'\033[32m'
c_yellow=$'\033[33m'
c_dim=$'\033[2m'
c_bold=$'\033[1m'
c_reset=$'\033[0m'

printf '%sblob-cli installer%s\n\n' "$c_bold" "$c_reset"

if ! command -v node >/dev/null 2>&1; then
  printf '%serror:%s Node.js is not installed.\n\n' "$c_red" "$c_reset"
  printf 'blob-cli ships via npm and needs Node %s or later. Install Node first:\n' "$MIN_NODE"
  printf '  macOS:   brew install node\n'
  printf '  Linux:   https://nodejs.org/en/download/package-manager\n'
  printf '  fnm:     curl -fsSL https://fnm.vercel.app/install | bash\n'
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$MIN_NODE" ]; then
  printf '%serror:%s Node %s is too old. blob-cli needs Node %s or later.\n' \
    "$c_red" "$c_reset" "$NODE_MAJOR" "$MIN_NODE"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%serror:%s npm is not on PATH.\n' "$c_red" "$c_reset"
  printf 'Reinstall Node from https://nodejs.org/ to fix.\n'
  exit 1
fi

printf '%sInstalling %s...%s\n' "$c_dim" "$PKG" "$c_reset"
if ! npm install -g "$PKG"; then
  printf '\n%serror:%s npm install failed.\n' "$c_red" "$c_reset"
  printf 'If this looks like a permissions error, either:\n'
  printf '  - re-run with sudo:  sudo npm install -g %s\n' "$PKG"
  printf '  - or move npm prefix to a writable dir:\n'
  printf '    https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally\n'
  exit 1
fi

if ! command -v blob >/dev/null 2>&1; then
  PREFIX="$(npm config get prefix 2>/dev/null || echo unknown)"
  printf '\n%swarn:%s blob installed but not on PATH.\n' "$c_yellow" "$c_reset"
  printf 'Add the npm global bin directory to PATH:\n'
  printf '  export PATH="%s/bin:$PATH"\n' "$PREFIX"
  exit 1
fi

VERSION="$(blob --version 2>/dev/null || echo unknown)"

printf '\n%sblob %s installed.%s\n\n' "$c_green" "$VERSION" "$c_reset"
printf 'Next:  %sblob init%s    set up your Vercel Blob token + viewer URL\n' "$c_bold" "$c_reset"
printf 'Docs:  https://github.com/bubuding0809/blob-cli\n'
