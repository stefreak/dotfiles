---
name: dotfiles-chezmoi
description: Manage dotfiles with chezmoi.
tags: [dotfiles, chezmoi, config, setup]
category: devops
---

# Dotfiles (Chezmoi)

Manage user dotfiles using chezmoi for reproducible configuration across machines.

## When to Use

- Setting up Hermes on a new machine or after reset
- Installing/updating skills from the dotfiles repo
- Syncing configuration like API keys, MCP servers, agent settings
- User asks about dotfiles setup or "why are my configs missing"

## Setup

### Install chezmoi via nix

```bash
nix profile install nixpkgs#chezmoi
```

### Initialize from remote repo

```bash
chezmoi init --apply stefreak
```

This clones `https://github.com/stefreak/dotfiles` to `~/.local/share/chezmoi` and applies configs.

## Common Commands

```bash
chezmoi status            # check what's out of sync
chezmoi diff              # show what apply would change
chezmoi apply             # deploy configs to home dir
chezmoi add ~/.somefile   # start managing a new file
chezmoi edit ~/.somefile  # edit source state directly
```

## Key Directories

- **Source state:** `~/.local/share/chezmoi/` — the git repo with templates and files
- **Config:** `~/.config/chezmoi/chezmoi.toml` — data store for secrets
- **State database:** `~/.config/chezmoi/chezmoistate.boltdb`

## Templates & Secrets

Templates use Go template syntax. Example from `dot_pi/agent/auth.json.tmpl`:

```json
{
{{- if .zaiApi }}
  "zai": "{{ .zaiApi }}"
{{- end }}
}
```

Values come from chezmoi data store (`chezmoi.toml` or encrypted secrets). Missing keys cause template errors:

```bash
# Error example
chezmoi: .pi/agent/auth.json: template: dot_pi/agent/auth.json.tmpl:2:7: executing "dot_pi/agent/auth.json.tmpl" at <.zaiApi>: map has no entry for key "zaiApi"
```

**Fix:** Add the missing key to `~/.config/chezmoi/chezmoi.toml`:

```toml
[data]
  braveSearchApi = "your-api-key"
  zaiApi = ""  # empty string if not needed
```

## Skills Installation

The dotfiles repo includes skills in `dot_pi/agent/skills/`. After chezmoi apply:

- **brave-search**: Scripts at `~/.pi/agent/skills/brave-search/search.js` and `content.js`
- **browser**, **vscode**, **youtube-transcript**, **drunk-claude**, **dotfiles** also installed here

For Hermes agent sessions, use the Hermes-managed copies in `~/.hermes/skills/`:
- brave-search: `executable_search.js` and `executable_content.js` (Hermes version)
- chezmoi version: plain names without prefix

## Pitfalls

- **Template errors**: Missing data keys cause chezmoi apply to fail. Check error message for the missing key name, then add it to chezmoi.toml with an empty string value if not needed.
- **Script naming confusion**: Chezmoi-managed scripts are named `search.js`/`content.js`; Hermes-managed versions use `executable_` prefix. Use the Hermes versions in agent sessions.
- **Don't edit managed files directly**: Changes to chezmoi-managed dotfiles should go through `chezmoi edit` or modifying the source state, not by editing the target files directly.

## References

See `references/chezmoi-workflow.md` for detailed setup and troubleshooting steps.
