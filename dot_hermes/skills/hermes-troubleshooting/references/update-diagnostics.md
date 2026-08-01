# Hermes Update Diagnostics

Session: 2026-07-30 — v0.15.1 → v0.19.0 update (4,324 commits)

## What Happens During `hermes update --gateway`

### Stage-by-stage breakdown

```
1. Fetch          git fetch origin main           (~5-30s depending on network)
2. Stash         git stash push -m "hermes-update-autostash-<timestamp>"  (<1s)
3. Backup        hermes_cli.backup.create()       (~1s, 8 files snapshot)
4. Merge          git merge --ff-only origin/main  (~5-30s for 4k commits)
5. Syntax guard   py_compile critical .py files    (~2s)
6. Stash restore  git stash apply                  (<1s if clean)
7. Python deps    uv pip install -e .[all]         (2-5 min typically)
8. Node deps      npm install                      (5-15 min on large repos)
9. Web UI build   node build script                (1-3 min)
10. Config migrate  migrate_config()               (<1s)
11. Gateway restart systemd stop/start             (~5s)
```

### Why it appears to hang

The process is **not hung** during stages 8-9. It's in `do_wait`/`do_sys` state, blocked on child processes:

```bash
# Diagnose what's happening
ps -p <update-pid> -o pid,etime,state,wchan   # wchan shows do_wait/do_sys
pgrep -P <update-pid>                          # shows child PID (npm/uv/node)
tail -f ~/.hermes/logs/agent.log              # see if gateway is still serving
```

**Typical timeline for 4k+ commit updates:**
- Fetch + merge: ~30s
- Python deps: ~2-3 min
- **Node deps (npm install): 5-15 min** ← this is where it "hangs"
- Build + migrate + restart: ~30s

### The npm install bottleneck

With 6741 files changed across the repo, `npm install` resolves thousands of packages. This is the longest stage and has no progress output to the terminal — users commonly interpret this as a hang.

**Evidence it's working:**
```bash
# Check for active npm/node processes
ps aux | grep -E "npm|node.*postinstall"

# Should see something like:
# hermes  58038  147  0.5 1626628 389892 pts/0  Rl+  09:26   0:07 npm install
```

### Stash management

Autostash ref format: `stash@{0}: On main: hermes-update-autostash-<timestamp>`

If stash restore fails (conflicts):
```bash
# View what was stashed
git stash show stash@{0} --stat

# Manual apply if needed
cd ~/.hermes/hermes-agent && git stash apply stash@{0}
```

In the 2026-07-30 session, the autostash was empty (no local changes) — the stash entry existed but contained nothing. This is normal for a clean checkout.

## Config Migration Path (v25 → v32)

The update from v0.15.1 to v0.19.0 crosses 7 config versions:

| Version | What changed |
|---------|-------------|
| v26-v30 | Various new fields, defaults merged in |
| v30→v31 | `verify_on_stop` default flipped from true → false |
| v31→v32 | Baked-in literal `true` for `verify_on_stop` corrected to `false` (one-time fix) |

Migration runs automatically during update. Manual trigger:
```bash
hermes config migrate
```

Check current version:
```bash
grep _config_version ~/.hermes/config.yaml
# or
hermes config check
```

## Post-Update Verification

```bash
# Confirm version
hermes --version
# Expected: Hermes Agent v0.19.0 (2026.7.20) · upstream <sha>

# Check gateway is running
systemctl --user status hermes-gateway | head -5

# Verify config migration completed
grep _config_version ~/.hermes/config.yaml
```

## Pitfalls Found in This Session

1. **`v2026.5.29..v2026.7.1` tag range fails** — tags are lightweight, not commit ranges. Use `git log --oneline v2026.5.29..v2026.7.1` instead of the diff syntax for counting.

2. **RELEASE notes don't exist for intermediate versions** — only v0.15.0 and v0.15.1 have markdown changelogs in the repo. v0.16-v0.18 releases have no RELEASE_*.md files; use `git log --oneline <tag> | head -30` for a summary instead.

3. **Gateway stays running during update** — with `--gateway` flag, the gateway is stopped only at the very end (stage 11). The update process itself runs in the same process tree, so Matrix messages continue to be received and queued during the update.