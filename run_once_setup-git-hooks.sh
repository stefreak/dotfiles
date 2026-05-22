#!/usr/bin/env bash
set -euo pipefail

# Configure the chezmoi source repo to use tracked git hooks
repo="$HOME/.local/share/chezmoi"
if [ ! -d "$repo/.git" ]; then
	echo "ERROR: $repo is not a git repository" >&2
	exit 1
fi
git -C "$repo" config core.hooksPath .githooks
