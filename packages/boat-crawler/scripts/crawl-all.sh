#!/bin/bash
# Shared compliant crawl orchestrator wrapper.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "═══════════════════════════════════════════════"
echo "  🚤 Running All Boat Crawlers"
echo "═══════════════════════════════════════════════"
echo ""

node "$SCRIPT_DIR/crawl-all.mjs"
