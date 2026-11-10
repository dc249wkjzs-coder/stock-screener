#!/usr/bin/env bash
# The Supabase function can only import files inside its own folder, so it gets a copy of shared/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p supabase/functions/screener-sync/lib
cp shared/*.js supabase/functions/screener-sync/lib/
echo "copied shared/ -> supabase/functions/screener-sync/lib/"
