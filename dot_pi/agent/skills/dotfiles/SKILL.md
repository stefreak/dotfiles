---
name: dotfiles
description: "MUST read before making any changes to files under ~/.* (dotfiles and dotdirs in home). Covers syncing to chezmoi and pushing to GitHub — always ask the user for permission before proceeding."
---

# Dotfiles & Chezmoi

Dotfiles are managed via [chezmoi](https://www.chezmoi.io).

- **GitHub repo:** `stefreak/dotfiles`
- **Source directory:** `~/.local/share/chezmoi/`
- **Managed paths:** `~/.pi/`, `~/.mcporter/`, and anything added via `chezmoi add`

## Before Editing

Before modifying any chezmoi-managed file, run `chezmoi diff` and `chezmoi status` to check for drift. If there are differences, **stop and inform the user** — do not layer new changes on top of unsynced ones.

## Status & Drift

If `chezmoi status` shows differences (e.g., ` R install-packages.sh`), you must decide whether to apply or add:

- **Apply from Source:** If the chezmoi source directory has been updated (e.g., after a `git pull`), run `chezmoi apply` to update the live files.
- **⚠️ Avoid Data Loss:** If the live files were manually edited and those changes need to be persisted, **do not run `chezmoi apply`**, as it will overwrite and revert your edits. Use the **Sync Procedure** below to `chezmoi add` the changes first.

## When to Sync

After editing any chezmoi-managed file — or **creating new skills or config files** under `~/.pi/agent/` — that should persist across machines, you **MUST propose syncing to chezmoi and ask the user for permission before proceeding.**

Skip syncing for transient changes, local experiments, or machine-specific tweaks.

## Sync Procedure

1. `chezmoi add <live_path>` for each changed/new file
2. `chezmoi diff` — verify the changes
3. Commit and push:
   ```sh
   cd ~/.local/share/chezmoi
   git add -A
   git status
   git commit -m "<descriptive message>"
   git push origin main
   ```

## ⚠️ Always Ask First

Before running any `chezmoi add`, `git commit`, or `git push`, present a plan:

> The following changes should be synced to dotfiles:
>
> - `~/.pi/agent/skills/dotfiles/SKILL.md` — new skill for chezmoi management
>
> Plan:
> 1. `chezmoi add` each file
> 2. Commit: `"skills: add dotfiles skill"`
> 3. Push to `main` on `stefreak/dotfiles`
>
> Shall I proceed?

**Wait for explicit approval.** No exceptions.

## Notes

- Use `chezmoi add` with the live path (`~/.pi/...`), not the source directory path.
- Check `chezmoi managed | grep <path>` if unsure whether a file is managed.
- Source files may be templates (`.tmpl`) — be aware when editing in the source dir directly.
