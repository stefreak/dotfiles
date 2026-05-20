#!/bin/bash
set -euo pipefail

pkgs=(
  "pi:@earendil-works/pi-coding-agent"
  "mcporter:mcporter"
)

for entry in "${pkgs[@]}"; do
  name="${entry%%:*}"
  npmpkg="${entry##*:}"
  current=$(npm list -g "$npmpkg" --json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*: "//;s/".*//') || true
  if [[ -z "$current" ]]; then
    echo "Installing $name..."
    npm install -g "$npmpkg"
  else
    latest=$(npm view "$npmpkg" version 2>/dev/null) || true
    if [[ -n "$latest" && "$latest" != "$current" ]]; then
      echo "Updating $name ($current → $latest)..."
      npm install -g "$npmpkg"
    else
      echo "$name up to date ($current)"
    fi
  fi
done
