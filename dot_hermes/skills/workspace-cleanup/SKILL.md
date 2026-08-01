---
name: workspace-cleanup
description: "Clean up git repos and workspaces."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [git, cleanup, workspace, gitignore, organization]
---

# Workspace Cleanup

This skill covers cleaning up development workspaces and git repositories — managing `.gitignore`, removing tracked artifacts that shouldn't be committed, and organizing project files.

## When to Use

- User asks to review what should/shouldn't be in the repo
- Large diff shows many changes including generated/cache files
- Asked to "clean up" or "review changes" before committing
- Need to add `.gitignore` rules for runtime state, caches, databases

## Core Principles

1. **Lock files are tracked** — Package locks (`package-lock.json`, `uv.lock`, `Cargo.lock`) ensure reproducible builds and should be committed
2. **Runtime state is ignored** — Database files, cache snapshots, process state, lock files for runtime systems
3. **Verify before removing from index** — Use `git check-ignore` to confirm patterns match before running removal commands
4. **Targeted removals only** — Never run broad removals like `git rm --cached -r .` without explicit user approval

## Common Patterns

### Files to Track
- Build manifests: `package.json`, `pyproject.toml`, `Cargo.toml`
- Lock files: `package-lock.json`, `uv.lock`, `Cargo.lock`, `go.sum`
- Source code, tests, configuration (config.yaml)
- Skills, documentation, templates

### Files to Ignore
- Runtime state: `gateway_state.json`, `.skills_prompt_snapshot.json`, `.update_check`
- Cache data: `*/http_cache.json`, `*_cache.json`, `image_cache/`
- Databases: `*.db*`, `*.sqlite`, `kanban.db*`
- Backups: `.curator_backups/`, `.archive/`, `state-snapshots/`
- Generated files: `.coverage`, `.ruff_cache/`, `__pycache__/`
- Node modules: `node_modules/`, but track `package-lock.json`

## Workflow

### 1. Review Current State
```bash
git status --short | head -30
git diff --stat | tail -5
git ls-files | wc -l
```

### 2. Identify Problematic Files
Look for:
- Database files (`.db`, `.sqlite`)
- Cache/lock state files
- Generated snapshots and backups
- `node_modules` or compiled artifacts
- Runtime logs and process state

### 3. Update .gitignore
Add patterns for identified categories. Be specific — avoid blanket `*.lock` that catches package locks.

### 4. Remove from Index (with approval)
```bash
# Verify ignore pattern matches
git check-ignore <file>

# Targeted removal only
git rm --cached path/to/file
```

**Never run:** `git rm --cached -r .` without explicit user approval — this stages deletions for everything.

### 5. Verify Final State
```bash
git status --short
git diff --cached --stat
```

## Pitfalls

- **The Lock File Mistake**: Don't blanket-ignore all `.lock` files. Package locks are essential; only ignore operational/runtime locks (`.state/*.lock`, custom runtime locks).
- **Broad removals**: `git rm --cached -r .` stages deletions for everything in the working tree — dangerous without explicit approval.
- **Embedded repos**: If a subdirectory is itself a git repo, convert to submodule or add to `.gitmodules`.
- **Index corruption**: If index is corrupted, can use `rm -rf .git/index && git add .` (destructive).

## Reference: Common Ignore Patterns

```gitignore
# Secrets and state
.env
auth.json
*.lock  # Only runtime locks if you mean it; be explicit instead
gateway_state.json
kanban.db*

# Runtime artifacts
state.db*
sessions/
logs/
audio_cache/
cache/
image_cache/

# Generated files
__pycache__/
*.pyc
.ruff_cache/
core/.coverage

# Dependencies (track lock files, ignore modules)
node_modules/
**/*/node_modules

# Backups and snapshots
*.bak.*
.curator_backups/
state-snapshots/
```