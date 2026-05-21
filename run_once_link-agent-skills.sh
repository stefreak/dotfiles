#!/usr/bin/env bash
set -euo pipefail

# This script runs once during `chezmoi apply` to link pi skills to Gemini/Antigravity CLIs

SKILLS_DIR="$HOME/.pi/agent/skills"

if [ ! -d "$SKILLS_DIR" ]; then
    echo "Error: Skills directory $SKILLS_DIR not found." >&2
    exit 1
fi

if command -v gemini &> /dev/null; then
    echo "Linking skills to Gemini CLI..."
    gemini skills link "$SKILLS_DIR" --scope user --consent
fi

if command -v antigravity &> /dev/null; then
    echo "Linking skills to Antigravity CLI..."
    antigravity skills link "$SKILLS_DIR" --scope user --consent
fi
