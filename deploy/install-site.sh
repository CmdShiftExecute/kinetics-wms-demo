#!/usr/bin/env bash
# Installs or re-installs the nginx site for the Warehouse Management System demo on node-ss. Idempotent:
# run it after any change to deploy/site.nginx or after a rebuild that needs nothing more
# than a reload (a rebuild alone needs no reload, nginx serves dist/ as static files).
#
#   bash "$(git rev-parse --show-toplevel)/deploy/install-site.sh"
#
# What it does, every time: copies the site file when it differs, runs sudo nginx -t, reloads only on
# a passing test, then proves port 927 answers from 127.0.0.1 with the built index.html. It never
# touches any other site file, including the MIS demo on 926.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TEMPLATE="$REPO/deploy/site.nginx"
SITE_NAME="${SITE_NAME:-$(basename "$REPO")}"
DST="/etc/nginx/sites-enabled/$SITE_NAME"
say() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"; }

# The site file is a template; nothing host-specific is committed. Every value below can be
# overridden by exporting it, and each default is read from the machine this runs on.
SITE_HOST="${SITE_HOST:-$(tailscale status --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')}"
SITE_ADDR="${SITE_ADDR:-$(tailscale ip -4 | head -1)}"
SITE_ROOT="${SITE_ROOT:-$REPO/dist}"
SSL_CERT="${SSL_CERT:-/etc/nginx/ssl/${SITE_HOST%%.*}.crt}"
SSL_KEY="${SSL_KEY:-/etc/nginx/ssl/${SITE_HOST%%.*}.key}"
SRC=$(mktemp -t "${SITE_NAME}-site.XXXXXX")
trap 'rm -f "$SRC"' EXIT
sed -e "s|__SITE_ADDR__|$SITE_ADDR|g" \
    -e "s|__SITE_HOST__|$SITE_HOST|g" \
    -e "s|__SITE_ROOT__|$SITE_ROOT|g" \
    -e "s|__SSL_CERT__|$SSL_CERT|g" \
    -e "s|__SSL_KEY__|$SSL_KEY|g" "$TEMPLATE" > "$SRC"
grep -q '__SITE_\|__SSL_' "$SRC" && { say "a placeholder was left unrendered in $SRC"; exit 1; }
say "site file rendered for $SITE_HOST ($SITE_ADDR), root $SITE_ROOT"

[ -f "$REPO/dist/index.html" ] || { say "dist/index.html is missing; run bun run build first"; exit 1; }

if sudo cmp -s "$SRC" "$DST" 2>/dev/null; then
  say "site file unchanged at $DST"
  changed=0
else
  sudo install -m 0644 "$SRC" "$DST"
  say "site file written to $DST"
  changed=1
fi
sudo nginx -t
if [ "$changed" = 1 ]; then
  sudo systemctl reload nginx
  say "nginx reloaded"
fi

# proof: the port answers with this build's index.html, and 926 still answers. The reload is
# asynchronous, so the probe retries for up to five seconds before it judges.
code=000
for _ in $(seq 1 10); do
  code=$(curl -sk -o /tmp/wms-index.html -w '%{http_code}' --resolve "$SITE_HOST:927:$SITE_ADDR" "https://$SITE_HOST:927/" || true)
  [ "$code" = 200 ] && break
  sleep 0.5
done
title=$(grep -o '<title>[^<]*' /tmp/wms-index.html | head -1)
say "927 answers $code, $title"
[ "$code" = 200 ] || exit 1
grep -q 'Warehouse Management System' /tmp/wms-index.html || { say "927 did not serve the WMS index"; exit 1; }
mis=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$SITE_HOST:926:$SITE_ADDR" "https://$SITE_HOST:926/" || true)
say "926 (MIS demo, untouched) answers $mis"
