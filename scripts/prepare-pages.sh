#!/usr/bin/env bash
# Post-build script for Cloudflare Pages deployment.
# Creates _worker.js entry point and _routes.json in the .open-next directory
# so that Cloudflare Pages Git integration can deploy the OpenNext Worker.
# Also promotes the assets/ subdirectory to the root so that Cloudflare Pages
# can serve static files at the correct URL paths.

set -euo pipefail

OPENNEXT_DIR=".open-next"

if [ ! -f "$OPENNEXT_DIR/worker.js" ]; then
  echo "Error: $OPENNEXT_DIR/worker.js not found. Run 'npx @opennextjs/cloudflare build' first."
  exit 1
fi

# Create _worker.js that re-exports the OpenNext worker.
# The worker.js is in the same directory, so the relative imports work.
cp "$OPENNEXT_DIR/worker.js" "$OPENNEXT_DIR/_worker.js"

echo "Created $OPENNEXT_DIR/_worker.js"

# Promote assets/ contents to the root of .open-next/.
# @opennextjs/cloudflare places static files inside assets/ but
# Cloudflare Pages expects them at the root of the deploy directory
# (e.g.  /_next/static/... → .open-next/_next/static/..., NOT
#        .open-next/assets/_next/static/...).
if [ -d "$OPENNEXT_DIR/assets" ]; then
  # Copy each item from assets/ into the root, then remove assets/.
  # We use cp+rm rather than mv to avoid cross-device issues and
  # to allow existing root-level items (e.g. _worker.js) to be
  # preserved when assets/ does not contain the same name.
  for item in "$OPENNEXT_DIR/assets"/*; do
    [ -e "$item" ] || continue          # skip if assets/ is empty
    basename=$(basename "$item")
    # Skip if a root-level item with the same name already exists
    # and is NOT a directory we want to merge (like _next/).
    if [ -e "$OPENNEXT_DIR/$basename" ]; then
      # If both are directories, merge contents recursively.
      if [ -d "$OPENNEXT_DIR/$basename" ] && [ -d "$item" ]; then
        cp -r "$item/." "$OPENNEXT_DIR/$basename/"
        echo "Merged assets/$basename/ into $OPENNEXT_DIR/$basename/"
      else
        echo "Warning: Skipping assets/$basename — $OPENNEXT_DIR/$basename already exists"
      fi
    else
      cp -r "$item" "$OPENNEXT_DIR/$basename"
      echo "Promoted assets/$basename → $OPENNEXT_DIR/$basename"
    fi
  done
  rm -rf "$OPENNEXT_DIR/assets"
  echo "Removed $OPENNEXT_DIR/assets/ (contents promoted to root)"
else
  echo "Warning: $OPENNEXT_DIR/assets/ not found — skipping asset promotion"
fi

# Create _routes.json to route all non-static requests to the Worker.
# This ensures the Worker handles page requests while static assets
# (_next/static, images, etc.) are served directly by Cloudflare.
cat > "$OPENNEXT_DIR/_routes.json" << 'EOF'
{
  "version": 1,
  "include": ["/*"],
  "exclude": [
    "/_next/static/*",
    "/logo.svg",
    "/robots.txt",
    "/favicon.ico"
  ]
}
EOF

echo "Created $OPENNEXT_DIR/_routes.json"
echo "Cloudflare Pages deployment ready"
