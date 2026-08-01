---
name: agent-memory
description: Manage Hermes memory and interpret "remember" requests.
category: hermes
---

# Agent Memory Management

This skill defines how Hermes should handle the `memory` tool — what qualifies as durable knowledge worth saving, and how to respond when the user asks about remembered notes.

## What to Save (Durable Knowledge)

Save entries that are **stable across sessions** and reduce future steering:

- **User preferences**: "I prefer X", "Don't do Y without asking"
- **Environmental facts**: System paths, config locations, installed tools, account details
- **Corrections**: When the user corrects your behavior or assumptions
- **Stable procedures**: Workflows that recur across sessions (capture as skills instead)

## What NOT to Save

These become stale or self-imposed constraints:

- **Session-specific activity**: "We set up Calendula today", "Installed dotfiles repo"
- **Task outcomes**: "Fixed bug X", "Submitted PR Y", "Phase N done"
- **Temporary state**: Current TODOs, in-progress work logs
- **One-off data**: PR numbers, commit SHAs, specific file counts

## Interpreting "Remember" Requests

When the user says "remember this," "note this," or asks "any interesting notes I asked you to remember?":

1. **They want durable facts/preferences**, not a summary of what we did
2. **Report from the memory file** — read `~/.hermes/memories/MEMORY.md` and `~/.hermes/memories/USER.md`
3. **Filter out**: installations, setups, task completions, session activities

### Example Response Pattern

User: "Any interesting notes I asked you to remember recently?"

**Wrong** (task summary):
- "We installed Calendula v0.2.0"
- "You registered the dotfiles repo as a skill tap"
- "You deleted the Himalaya skill"

**Right** (durable facts/preferences):
- "Calendula is configured with iCloud account me@steffen.works, Clara's Schichtplan calendar ID is..."
- "Dotfiles repo is at ~/.hermes/dotfiles, GitHub token needs refresh"
- "You're actively pruning unused skills (~15 removed so far)"

## Memory File Structure

- `~/.hermes/memories/MEMORY.md`: Personal notes (environment, tools, conventions)
- `~/.hermes/memories/USER.md`: User profile (who they are, preferences, corrections)

Keep entries compact — memory is injected into every turn, so verbosity competes with tool instructions.

## Pitfalls

- **Don't save task narratives**: "We set up X" becomes stale; the fact that "X is configured this way" persists
- **Don't save unverified inferences**: If you test something works but infer a cause from a side effect, verify before memorizing
- **Don't confuse memory with skills**: Procedures/workflows belong in skills; facts/preferences belong in memory
