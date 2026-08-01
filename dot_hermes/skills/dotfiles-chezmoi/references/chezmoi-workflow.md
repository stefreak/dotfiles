# Chezmoi Workflow Reference

## Typical Setup Flow

1. Install chezmoi: `nix profile install nixpkgs#chezmoi`
2. Initialize: `chezmoi init --apply stefreak`
3. Configure secrets in `~/.config/chezmoi/chezmoi.toml`:
   ```toml
   [data]
     braveSearchApi = "BSAY..."
     zaiApi = ""  # empty if not needed
   ```
4. Apply: `chezmoi apply --force`

## After Apply

- Skills installed to `~/.pi/agent/skills/`
- MCP config at `~/.mcporter/mcporter.json`
- Agent auth at `~/.pi/agent/auth.json`

## Troubleshooting

### Template errors

If chezmoi apply fails with "map has no entry for key":

```bash
# Check what data is configured
chezmoi state data

# Add missing keys to config
echo '[data]' >> ~/.config/chezmoi/chezmoi.toml
echo 'zaiApi = ""' >> ~/.config/chezmoi/chezmoi.toml
chezmoi apply --force
```

### Verify status

```bash
chezmoi status  # should show no changes if everything is synced
chezmoi diff    # shows what would change
```

### Force re-apply

If files are out of sync:

```bash
chezmoi apply --force
```

## Key Files Managed

| File | Purpose |
|------|---------|
| `~/.pi/agent/skills/*` | AI agent skills |
| `~/.mcporter/mcporter.json` | MCP server configuration |
| `~/.pi/agent/auth.json` | API key storage |
| `~/.gemini/GEMINI.md` | Gemini agent config |
