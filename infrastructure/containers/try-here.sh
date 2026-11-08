#!/bin/sh
# Runs the three images on this Mac against today's database (agreed 8 Nov), on the usual ports, so
# stop the dev servers first. Each server's database login comes from its owner-only env file and
# lives only in this run's environment: nothing is written. The database is the Mac's, so inside a
# container its address is host.docker.internal.
#   ./try-here.sh up      start, and wait until all three are healthy
#   ./try-here.sh down    stop and remove them
set -eu
here=$(cd "$(dirname "$0")" && pwd)
noi="$here/../../noi"
login() { sed -n "s/^$2=//p" "$noi/$1" | sed 's/@127\.0\.0\.1:/@host.docker.internal:/; s/@localhost:/@host.docker.internal:/'; }
MERO_DATABASE_URL=$(login mero.local.env DATABASE_URL)
GOV_DATABASE_URL=$(login governance.local.env NOI_GOV_DATABASE_URL)
export MERO_DATABASE_URL GOV_DATABASE_URL
case "${1:-up}" in
  up) docker compose -f "$here/compose.yaml" up -d --wait --wait-timeout 90 ;;
  down) docker compose -f "$here/compose.yaml" down ;;
  *) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
