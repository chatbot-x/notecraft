#!/usr/bin/env bash
# Post-build script for Cloudflare Pages deployment.
# Creates _worker.js entry point and _routes.json in the .open-next directory
# so that Cloudflare Pages Git integration can deploy the OpenNext Worker.

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
