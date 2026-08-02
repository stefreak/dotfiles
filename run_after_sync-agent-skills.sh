#!/usr/bin/env bash
set -euo pipefail

# Sync agent skills from single source of truth to each agent
AGENT_SKILLS_DIR="$HOME/.local/share/agent-skills"

rsync -av --delete "$AGENT_SKILLS_DIR/" "$HOME/.hermes/skills/"
rsync -av --delete "$AGENT_SKILLS_DIR/" "$HOME/.pi/agent/skills/"
