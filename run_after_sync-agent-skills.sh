#!/usr/bin/env bash
set -euo pipefail

# Sync agent skills from single source of truth to each agent
AGENT_SKILLS_DIR="$HOME/.local/share/agent-skills"

# Hermes gets all skills
rsync -av --delete "$AGENT_SKILLS_DIR/" "$HOME/.hermes/skills/"

# Pi gets everything except agent-memory
rsync -av --delete "$AGENT_SKILLS_DIR/" "$HOME/.pi/agent/skills/" --exclude=agent-memory
