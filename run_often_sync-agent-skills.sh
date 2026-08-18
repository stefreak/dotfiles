#!/usr/bin/env bash
set -euo pipefail

# Sync Pi agent skills into the global agent skills dir (~/.agents/skills),
# which is where Zed discovers skills (flat layout, nesting is not supported).
# Runs on every `chezmoi apply` so new or removed Pi skills are always
# reflected. Non-skill entries in ~/.agents/skills (e.g. skills created via
# the Zed UI, or links pointing elsewhere) are left untouched.

SKILLS_DIR="$HOME/.pi/agent/skills"
DEST_DIR="$HOME/.agents/skills"

if [ ! -d "$SKILLS_DIR" ]; then
    echo "Error: Pi skills directory $SKILLS_DIR not found." >&2
    exit 1
fi

mkdir -p "$DEST_DIR"

# Link every Pi skill (a dir containing SKILL.md) into the global skills dir.
for skill in "$SKILLS_DIR"/*/; do
    skill="${skill%/}"
    [ -d "$skill" ] || continue
    if [ ! -f "$skill/SKILL.md" ]; then
        echo "Skipping $skill (no SKILL.md)"
        continue
    fi
    name="$(basename "$skill")"
    ln -sfn "$skill" "$DEST_DIR/$name"
done

# Drop stale links (Pi skill removed or renamed) so nothing broken lingers.
for link in "$DEST_DIR"/*; do
    [ -L "$link" ] || continue
    target="$(readlink "$link")"
    case "$target" in
    "$SKILLS_DIR"/*)
        if [ ! -d "$target" ]; then
            rm "$link"
            echo "Removed stale link $link -> $target"
        fi
        ;;
    esac
done
