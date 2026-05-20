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

Secrets are stored in macOS Keyring and injected via Go templates:

```sh
chezmoi secret keyring set --service=kagi --user=api
chezmoi secret keyring set --service=zai --user=api    # optional
```

- **kagi** (required) → `.mcporter/mcporter.json`
- **zai** (optional) → `.pi/agent/auth.json`
