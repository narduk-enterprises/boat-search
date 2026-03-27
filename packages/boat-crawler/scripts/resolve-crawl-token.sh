#!/usr/bin/env bash
# Resolve Cloudflare crawl API token for boat-finder (narduk / Doppler).
#
# The crawl endpoint requires an API token with "Browser Rendering - Edit".
# Token location: narduk-nuxt-template / prd (found via narduk-cli doppler search).
# Falls back to CLOUDFLARE_API_TOKEN_WORKERS if CLOUDFLARE_CRAWL_TOKEN not found.
#
# Usage:
#   ./scripts/resolve-crawl-token.sh              # print token (from env or Doppler)
#   doppler run --project narduk-nuxt-template --config prd -- ./scripts/resolve-crawl-token.sh

set -e
if [[ -n "$CLOUDFLARE_CRAWL_TOKEN" ]]; then
  echo "$CLOUDFLARE_CRAWL_TOKEN"
  exit 0
fi
if [[ -n "$CLOUDFLARE_API_TOKEN_WORKERS" ]]; then
  echo "$CLOUDFLARE_API_TOKEN_WORKERS"
  exit 0
fi
if command -v doppler >/dev/null 2>&1; then
  # Try narduk-nuxt-template/prd first (where token was found)
  tok=$(doppler secrets get CLOUDFLARE_CRAWL_TOKEN --project narduk-nuxt-template --config prd --plain 2>/dev/null || true)
  if [[ -n "$tok" ]]; then
    echo "$tok"
    exit 0
  fi
  # Fallback to 0_global-canonical-tokens/cloudflare
  tok=$(doppler secrets get CLOUDFLARE_CRAWL_TOKEN --project 0_global-canonical-tokens --config cloudflare --plain 2>/dev/null || true)
  if [[ -n "$tok" ]]; then
    echo "$tok"
    exit 0
  fi
  # Try Workers token as last resort
  tok=$(doppler secrets get CLOUDFLARE_API_TOKEN_WORKERS --project 0_global-canonical-tokens --config cloudflare --plain 2>/dev/null || true)
  if [[ -n "$tok" ]]; then
    echo "$tok"
    exit 0
  fi
fi
echo "Could not resolve crawl token. Set CLOUDFLARE_CRAWL_TOKEN or run with doppler (narduk-nuxt-template/prd or 0_global-canonical-tokens/cloudflare)." >&2
exit 1
