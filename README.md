# dotfiles

Managed by [chezmoi](https://www.chezmoi.io).

## Setup on a new machine

```sh
brew install gh chezmoi
gh auth login
chezmoi init --apply stefreak
```

Then set secrets in macOS Keyring:

```sh
chezmoi secret keyring set --service=kagi --user=api    # required
chezmoi secret keyring set --service=zai --user=api     # optional, for z.ai models
chezmoi apply
```

## Day-to-day

```sh
chezmoi status          # check what's out of sync
chezmoi diff            # show what apply would change
chezmoi apply           # deploy configs
chezmoi add ~/.somefile # start managing a new file
chezmoi edit ~/.somefile # edit source state
```
