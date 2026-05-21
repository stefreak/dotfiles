---
name: dotfiles
description: "MUST read before making any changes to files under ~/.* (dotfiles and dotdirs in home). Covers syncing to chezmoi and pushing to GitHub — always ask the user for permission before proceeding."
---

# Dotfiles & Chezmoi

Dotfiles are managed via [chezmoi](https://www.chezmoi.io).

- **GitHub repo:** `stefreak/dotfiles`
- **Source directory:** `~/.local/share/chezmoi/`
- Use `chezmoi managed` to list managed paths. Use `chezmoi source-path <live_path>` to find the source file for a given managed path.

## Workflow

1. **Edit files in the chezmoi source directory** (`~/.local/share/chezmoi/`), not in the live filesystem.
2. **Commit** the changes in the chezmoi git repo.
3. **Run `chezmoi apply`** to update the live filesystem.

For **new dotfiles** that should be managed by chezmoi, create them directly in the source directory, commit, and apply.

## Before Editing

Run `chezmoi status` to check for drift. If the live files have diverged from the source, **stop and inform the user** — do not layer new changes on top of unsynced ones.

## Before Committing

Always run `chezmoi status` and `chezmoi diff` before committing, to verify the expected changes. Show the output to the user as part of the commit plan.

## ⚠️ Always Ask First

Before any `git commit` or `git push`, present a plan:

> The following changes should be committed to dotfiles:
>
> - `~/.local/share/chezmoi/dot_pi/agent/skills/dotfiles/SKILL.md` — updated skill
>
> Plan:
> 1. Commit: `"dotfiles: simplify chezmoi skill"`
> 2. Push to `sandbox-extension` on `stefreak/dotfiles`
> 3. Run `chezmoi apply`
>
> Shall I proceed?

**Wait for explicit approval.** No exceptions.

## Notes

- Source files may be templates (`.tmpl`) — be aware when editing in the source dir.
- `chezmoi status` should be clean after apply. If not, investigate before proceeding.
