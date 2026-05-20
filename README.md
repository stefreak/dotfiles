# dotfiles (chezmoi)

Managed by [chezmoi](https://www.chezmoi.io).

## Commands

```sh
chezmoi status          # check what's out of sync
chezmoi diff            # show what apply would change
chezmoi apply           # deploy configs
chezmoi add ~/.somefile # start managing a new file
chezmoi edit ~/.somefile # edit source state
```

## Secrets

API keys are read from environment variables via Go templates:
- `KAGI_API_KEY` → `.mcporter/mcporter.json`
- `ZAI_API_KEY` → `.pi/agent/auth.json`

Set these in your shell profile (`~/.zshrc` or similar).

## Structure

```
dot_pi/agent/           → ~/.pi/agent/
  AGENTS.md
  models.json
  auth.json.tmpl        # template: {{ env "ZAI_API_KEY" }}
  skills/
    kagi/SKILL.md
    browser/SKILL.md
dot_mcporter/           → ~/.mcporter/
  mcporter.json.tmpl    # template: {{ env "KAGI_API_KEY" }}
run_onchange_install-packages.sh  # npm: pi, mcporter
```
