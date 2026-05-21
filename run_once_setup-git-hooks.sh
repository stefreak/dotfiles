#!/usr/bin/env bash
set -euo pipefail

# Configure the chezmoi source repo to use tracked git hooks
chezmoi_source=$(chezmoi source-path)
git -C "$chezmoi_source" config core.hooksPath .githooks
