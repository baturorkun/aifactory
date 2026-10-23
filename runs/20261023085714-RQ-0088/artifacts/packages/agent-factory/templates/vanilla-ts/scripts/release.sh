#!/bin/sh
# Lays out release/<project>/ from a finished build (dist/): the tree the nginx
# image serves and a directory deploy copies. build_static and deploy.sh both
# call it, so CI and a developer ship the same files.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# The project's name, from package.json: container names, labels, the marker.
PROJECT=$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -n 1)
PROJECT=${PROJECT##*/}
case $PROJECT in
  ''|*[!a-z0-9._-]*) echo "package.json needs a name of lower-case letters, digits, ., _ and -: '$PROJECT'" >&2; exit 1 ;;
esac
RELEASE="$ROOT/release/$PROJECT"

[ -f "$ROOT/dist/main.js" ] || { echo "release: dist/main.js is missing; build first (pnpm build)." >&2; exit 1; }

rm -rf "$RELEASE"
mkdir -p "$RELEASE/public" "$RELEASE/src" "$RELEASE/dist"
cp -R "$ROOT/public/." "$RELEASE/public/"
cp "$ROOT/src/styles.css" "$RELEASE/src/styles.css"
cp -R "$ROOT/dist/." "$RELEASE/dist/"

# nginx maps / to public/index.html; a plain static server needs this page.
cat > "$RELEASE/index.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=public/index.html">
  <title>$PROJECT</title>
</head>
<body>
  <a href="public/index.html">$PROJECT</a>
</body>
</html>
HTML

echo "release: $RELEASE"
