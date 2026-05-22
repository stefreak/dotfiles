# dotfiles

Managed by [chezmoi](https://www.chezmoi.io). Includes configuration for the **pi coding agent** and **mcporter** (MCP tool bridge).

## What's in here

### Pi — AI Coding Agent

[pi](https://github.com/earendil-works/pi-coding-agent) is a terminal-based AI coding agent. Config lives in `~/.pi/agent/` — agent instructions, model definitions, and skills (browser control, web search, dotfiles sync). API keys are templated from the OS secret store (macOS Keyring).

### mcporter — MCP Tool Bridge

[mcporter](https://github.com/nickthecook/mcporter) exposes MCP servers as CLI tools the agent can call. Config lives in `~/.mcporter/mcporter.json` and defines servers like Playwright.

## Setup on a new machine

```sh
brew install gh chezmoi
gh auth login
chezmoi init --apply stefreak
```

Then set secrets in macOS Keyring:

```sh
chezmoi secret keyring set --service=brave-search --user=api  # required for web search
chezmoi secret keyring set --service=zai --user=api            # optional, for z.ai models
chezmoi apply
```

### Brave Search API key

Requires a free subscription (credit card needed to create it, you won't be charged).

1. Create an account at https://api-dashboard.search.brave.com/register
2. Create a "Free AI" subscription
3. Create an API key for the subscription
4. Store it in macOS Keyring: `chezmoi secret keyring set --service=brave-search --user=api`
5. Run `chezmoi apply` to write the `.env` file

## Chezmoi day-to-day

```sh
chezmoi status            # check what's out of sync
chezmoi diff              # show what apply would change
chezmoi apply             # deploy configs to home dir
chezmoi add ~/.somefile   # start managing a new file
chezmoi edit ~/.somefile  # edit source state directly
```

## Further reading

- [chezmoi docs](https://www.chezmoi.io)
- [pi docs](https://github.com/earendil-works/pi-coding-agent)
- [mcporter](https://github.com/nickthecook/mcporter)
