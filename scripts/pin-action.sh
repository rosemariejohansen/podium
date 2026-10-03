#!/usr/bin/env bash
# Usage: scripts/pin-action.sh <owner/repo>
# Prints "<owner/repo>@<commit-sha> # <tag>" for the newest vX.Y.Z release tag,
# ready to paste into a workflow "uses:" line (PRD SEC-INF-8).
set -euo pipefail
repo="$1"
url="https://github.com/$repo"
tag=$(git ls-remote --tags --refs --sort=-version:refname "$url" \
  | grep -E 'refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 | sed 's#.*refs/tags/##')
sha=$(git ls-remote "$url" "refs/tags/$tag^{}" | cut -f1)
if [ -z "$sha" ]; then sha=$(git ls-remote "$url" "refs/tags/$tag" | cut -f1); fi
echo "$repo@$sha # $tag"
