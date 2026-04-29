#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: bun run release <version>"
  echo "Example: bun run release 0.2.5"
  exit 1
fi

VERSION="$1"
TAG="v${VERSION}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  echo "error: '$VERSION' is not valid semver (e.g. 0.2.5 or 0.3.0-rc.1)"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty. Commit or stash first."
  git status --short
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "error: must be on main, currently on '$CURRENT_BRANCH'"
  exit 1
fi

git fetch --tags origin

if git rev-parse "$TAG" >/dev/null 2>&1 || git ls-remote --tags origin "$TAG" 2>/dev/null | grep -q "refs/tags/${TAG}"; then
  echo "error: tag $TAG already exists"
  exit 1
fi

LOCAL="$(git rev-parse main)"
REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "error: local main is out of sync with origin/main. git pull first."
  exit 1
fi

PREV_VERSION="$(node -p "require('./package.json').version")"

echo "Releasing ${PREV_VERSION} -> ${VERSION}"

node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.version = '${VERSION}';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"

INSTALL_URL_FILES=("README.md" "skills/blob-cli-setup/SKILL.md")
for f in "${INSTALL_URL_FILES[@]}"; do
  if grep -q "/v${PREV_VERSION}/install.sh" "$f"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|/v${PREV_VERSION}/install.sh|/v${VERSION}/install.sh|g" "$f"
    else
      sed -i "s|/v${PREV_VERSION}/install.sh|/v${VERSION}/install.sh|g" "$f"
    fi
    echo "  bumped install URL in $f"
  else
    echo "  note: install URL pattern not found in $f, skipping"
  fi
done

bun install --frozen-lockfile >/dev/null
bun test
bun run build >/dev/null

git add package.json "${INSTALL_URL_FILES[@]}"
git commit -m "release: ${VERSION}"
git tag "$TAG"

echo
echo "Pushing main + ${TAG}..."
git push origin main --tags

echo
echo "Done. Watch the publish:"
echo "  gh run watch -R bubuding0809/blob-cli"
