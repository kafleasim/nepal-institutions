#!/usr/bin/env bash
# Copy the Khan axes page and its data into the country-profile app so the
# build serves it at /khan/. The copy is gitignored; deploy it by rsync
# (README, Deployment).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../../apps/country-profile/public/khan"
mkdir -p "$dest"
cp "$here/khan-axes.html" "$dest/index.html"
cp "$here/regimes.js" "$here/khan_data.js" "$here/khan_vars.js" "$here/regime_data.js" "$dest/"
echo "Copied to $dest"
