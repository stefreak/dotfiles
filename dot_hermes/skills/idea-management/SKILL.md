---
name: idea-management
description: Collect, filter, and review business/technical ideas across chat threads
trigger: manual
---

# Idea Management

Workflow for collecting, filtering, and reviewing business/technical ideas across chat threads.

## For the Agent (when user shares an idea)

1. **Note the idea** — acknowledge briefly, don't expand into a plan unless asked. The user explicitly does NOT want ideas materialized into plans, architectures, or deep dives. A short "noted" or "saved" is the right response.
2. **Save it** — call the ideas script with the thread source:
   ```bash
   python ~/.hermes/scripts/ideas.py add "<title>" -d "<brief description>" -t tag1,tag2 -s "<chat_id>"
   ```
3. **Confirm** — tell the user it's saved (one line, no elaboration)

### Source tracking

Always include the Matrix chat ID as `-s "<chat_id>"`. This lets us revisit the conversation for follow-ups. Get it from the session context (e.g., `!hFlpJXPsGmJsxnEwLJ:matrix.org`).

### Tagging conventions

Use consistent tags for filtering later:

- **Domain:** `infra`, `saas`, `ai`, `cdn`, `paaS`, `devops`, `smart-home`, `media`, `gaming`
- **Type:** `business`, `product`, `tech`, `side-project`, `research`
- **Stage:** tracked via status field (`idea` → `exploring` → `building` → `shelved`/`abandoned`)

### People

Tag people with `-p stefr` when the idea involves specific collaborators.

### When to save

Save when the user bounces an idea that sounds like they want to remember it. Skip if it's clearly just casual conversation or a question.

## For the User (reviewing ideas)

### Quick commands

```bash
ideas.py add "Title" -d "desc" -t infra,business -p stefr -s "chat_id"
ideas.py list                              # all ideas
ideas.py list --tag cdn                    # filter by tag
ideas.py list --status idea                # only unexplored
ideas.py list --person stefr               # ideas involving someone
ideas.py list --json                       # machine-readable
ideas.py show on-prem-paas-cdn-paas        # by slug
ideas.py update on-prem-paas-cdn-paas --status exploring
ideas.py people on-prem-paas-cdn-paas stefr
ideas.py stats                             # overview
```

### Output format

Each idea shows: `[status] title  @tags  👤people  YYYY-MM-DD`

### Periodic review

When the user asks to review ideas, run `ideas.py stats` + `ideas.py list --status idea` to show what's waiting.

## Pitfalls & Known Issues

- **`mtime` vs `st_mtime`** — Python `Path.stat()` returns `os.stat_result` which uses `st_mtime`, not `mtime`. Use `p.stat().st_mtime` for sorting by modification time.
- **Update description** — the `update` command supports `-d` / `--description` to change the description (added after initial creation). Use it when the user corrects an idea's description.
- **People are case-sensitive** — the user's name is "steffen" (not "stefr" which is the Windows username). Always confirm the correct spelling.
- **Source tracking** — always include `-s "<chat_id>"` when saving. The chat ID is the Matrix room identifier (e.g., `!hFlpJXPsGmJsxnEwLJ:matrix.org`). Without it, we can't revisit the conversation for follow-ups.
- **Don't materialize ideas** — the user explicitly does NOT want ideas expanded into plans, architectures, or analysis when first shared. Save and move on. Only expand if the user asks for it later.
