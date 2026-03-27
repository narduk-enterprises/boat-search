#!/bin/bash
# Run all boat crawlers sequentially to avoid IP bans.
# Usage: bash scripts/crawl-all.sh
#
# Environment variables:
#   HEADLESS=true|false  (default: true)
#   MAX_PRICE=1000000    (default: 1000000)
#   MAX_PAGES=100        (per crawler, default: 100)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "═══════════════════════════════════════════════"
echo "  🚤 Running All Boat Crawlers"
echo "═══════════════════════════════════════════════"
echo ""

echo "▶ [1/4] Boats.com (sportfish, US-wide)..."
REQUIRED_STATE="*" HEADLESS="${HEADLESS:-true}" MAX_PAGES="${MAX_PAGES:-100}" MAX_CONCURRENCY=2 \
  node "$SCRIPT_DIR/crawl-texas-boats.mjs" || echo "⚠ Boats.com crawl had errors"
echo ""

echo "▶ [2/4] BoatTrader (sportfish + convertible)..."
HEADLESS="${HEADLESS:-true}" MAX_PAGES="${MAX_PAGES:-100}" MAX_CONCURRENCY=2 MAX_PRICE="${MAX_PRICE:-1000000}" \
  node "$SCRIPT_DIR/crawl-boattrader.mjs" || echo "⚠ BoatTrader crawl had errors"
echo ""

echo "▶ [3/4] YachtWorld (sportfish + convertible)..."
HEADLESS="${HEADLESS:-true}" MAX_PAGES="${MAX_PAGES:-100}" MAX_CONCURRENCY=2 MAX_PRICE="${MAX_PRICE:-1000000}" \
  node "$SCRIPT_DIR/crawl-yachtworld.mjs" || echo "⚠ YachtWorld crawl had errors"
echo ""

echo "▶ [4/4] The Hull Truth (classifieds)..."
HEADLESS="${HEADLESS:-true}" MAX_PAGES="${MAX_PAGES:-50}" MAX_CONCURRENCY=2 MAX_PRICE="${MAX_PRICE:-1000000}" \
  node "$SCRIPT_DIR/crawl-hulltruth.mjs" || echo "⚠ Hull Truth crawl had errors"
echo ""

echo "═══════════════════════════════════════════════"
echo "  ✅ All crawlers finished!"
echo ""

# Final stats
sqlite3 "$SCRIPT_DIR/../data/boats.db" "
  SELECT '   Total boats: ' || COUNT(*) FROM boats;
  SELECT '   Unique makes: ' || COUNT(DISTINCT make) FROM boats;
  SELECT '   Sources: ' || GROUP_CONCAT(DISTINCT source) FROM boats;
" 2>/dev/null || echo "   (Could not read stats)"

echo "═══════════════════════════════════════════════"
