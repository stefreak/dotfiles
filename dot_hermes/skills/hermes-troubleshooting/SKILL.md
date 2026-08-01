---
name: hermes-troubleshooting
description: "Debug Hermes updates, gateway, and network connectivity."
version: 1.0.0
author: Hermes Agent + Steffen
license: MIT
platforms: [linux, wsl2]
metadata:
  hermes:
    tags: [hermes, troubleshooting, update, gateway, wsl2, tailscale]
---

# Hermes Troubleshooting

Diagnostic and repair procedures for Hermes Agent installations. Covers update hangs, gateway restarts, WSL2 network exposure, and config migrations.

## Update Diagnostics

### What `hermes update --gateway` does (in order)

1. **Fetch** — `git fetch origin main`
2. **Stash** — saves uncommitted local changes with timestamped ref
3. **Pre-update backup** — snapshot of 8 critical files
4. **Git merge** — fast-forward pull; on divergence, resets to remote
5. **Syntax guard** — validates critical-path .py files parse; auto-rolls back on failure
6. **Stash restore** — prompts user (unless `--yes`); applies stashed changes
7. **Python deps** — `uv pip install -e .[all]` or fallback to pip
8. **Node deps** — `npm install` in repo root (can take 5-15 min on large repos)
9. **Web UI build** — builds desktop/dashboard assets
10. **Config migration** — runs `migrate_config()`; bumps `_config_version` in config.yaml
11. **Gateway restart** — stops old process, starts new one

### Why the update appears to hang

The process is **not hung** during stages 8-9. It's waiting on child processes:

```bash
# Check what the update process is doing
ps -p <pid> -o pid,etime,state,wchan,cmd
cat /proc/<pid>/wchan          # do_sys = waiting for subprocess
pgrep -P <pid>                  # shows child PID (npm/uv/node)
tail -5 ~/.hermes/logs/agent.log  # latest activity
```

Common wchan states:
- `do_wait` / `do_sys` — waiting on a child process (normal during npm install)
- `ep_poll` — waiting for I/O (should not persist long)
- `schedule` — CPU-bound work (rare, investigate if >2 min)

**Patience threshold:** npm install on a 6700+ file repo typically takes **5-15 minutes**. Don't kill it.

### Update failure recovery

If update leaves Hermes unbootable:
```bash
# Check for incomplete marker
ls -la ~/.hermes/.hermes-update-incomplete ~/.hermes/.hermes-lazy-refresh-incomplete

# The update process auto-recovers on next launch if interrupted
# Just run `hermes` again — it will finish the install

# Manual rollback (if syntax guard caught a bad commit)
cd ~/.hermes/hermes-agent && git reflog | head -5
git reset --hard <prev-sha>
```

## Config Migration

Config version lives in `~/.hermes/config.yaml` as `_config_version`. The latest is tracked in source at `hermes_cli/config.py:DEFAULT_CONFIG["_config_version"]`.

Migration runs automatically during `hermes update`. Manual trigger:
```bash
hermes config migrate
```

Common migration issues:
- **Missing required env vars** — shown at end of migrate output; add to `~/.hermes/.env`
- **Config format version behind** — `hermes doctor` shows current vs latest
- **Migration failure** — check `~/.hermes/logs/errors.log`; run `hermes config migrate` again

## Gateway Management

### Restart from outside the gateway (never from inside)

```bash
# From a separate terminal (NOT in an active Hermes session)
hermes gateway restart

# Or via systemd
systemctl --user restart hermes-gateway
```

**Never run `systemctl stop/start` from inside a running Hermes session** — it SIGTERMs the parent process including your current tool call.

### Gateway status checks
```bash
systemctl --user status hermes-gateway
tail -20 ~/.hermes/logs/gateway.log
grep -i "error\|failed" ~/.hermes/logs/agent.log | tail -10
```

## WSL2 + Tailscale + Desktop Connectivity

Hermes api_server defaults to `127.0.0.1:8642` — loopback only, invisible from Windows.

### Make Hermes reachable from Windows/Tailscale

**Step 1: Bind to all interfaces in WSL2**
```bash
echo 'API_SERVER_HOST=0.0.0.0' >> ~/.hermes/.env
echo 'API_SERVER_PORT=9119' >> ~/.hermes/.env  # or desired port
hermes gateway restart  # from separate terminal
```

**Step 2: Get WSL2 IP**
```bash
ip addr show eth0 | grep inet   # shows e.g. 172.19.138.78/20
```

**Step 3: Windows port proxy (run PowerShell as Admin)**
```powershell
netsh interface portproxy add v4tov4 `
  listenaddress=0.0.0.0 listenport=9119 `
  connectaddress=<WSL2-IP> connectport=9119
```

**Step 4: Windows Firewall (run PowerShell as Admin)**
```powershell
# Allow from Tailscale network only (100.64.0.0/10)
New-NetFirewallRule `
  -DisplayName "Hermes Gateway" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 9119 `
  -RemoteAddress 100.64.0.0/10 `
  -Action Allow

# Verify
Get-NetFirewallRule -DisplayName "*Hermes*" | Format-Table DisplayName,Enabled,Action
```

**Step 5: Desktop app connection**
- Open Hermes Desktop on Windows
- Settings → Gateway URL: `http://<tailscale-ip>:9119`
- Tailscale IP found via `tailscale status` (100.x.y.z)

### Verify binding
```bash
ss -tlnp | grep <port>
# Should show 0.0.0.0:<port>, NOT 127.0.0.1:<port>
```

### Common Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Update hangs at "npm install" | Normal — large repo | Wait 5-15 min |
| `do_wait` wchan for >10 min | Stuck npm/uv process | Check with `pgrep -P <pid>` |
| Gateway won't restart from session | Self-SIGTERM protection | Use separate terminal |
| Desktop can't connect to gateway | api_server on 127.0.0.1 only | Set API_SERVER_HOST=0.0.0.0 |
| Windows firewall blocks connection | No inbound rule for port | Add NetFirewallRule (see above) |
| Config migration fails silently | Missing required env var | Check errors.log, add to .env |
| `netsh` shows `connectaddress=global` | PowerShell regex captured wrong line (`scope global`) | Delete rule, re-add with explicit WSL2 IP from `ip addr show eth0` inside WSL |
| "Empty reply from server" from Tailscale | Port proxy pointing to gateway (172.x.128.1) not eth0 IP | Use eth0 IP, not default gateway; verify with `netsh interface portproxy show all` |

### WSL2 Port Proxy: the "global" trap

**Symptom:** `netsh interface portproxy show all` shows `connectaddress=global` instead of an IP. Connection from Windows/Tailscale times out or gets "Empty reply from server".

**Cause:** Dynamic IP capture via PowerShell regex on WSL output is fragile — the regex may match the wrong line (e.g., `scope global` in the interface alias) and capture "global" as the address.

**Fix — always use explicit IP, never dynamic capture for portproxy:**
```powershell
# Get WSL2 IP from inside WSL first
wsl -e ip addr show eth0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1

# Then hardcode it in the rule
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9119 2>$null
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9119 connectaddress=172.19.138.78 connectport=9119
```

**Verify the rule is correct:**
```powershell
netsh interface portproxy show all
# Should show: 0.0.0.0  9119  →  172.19.138.78  9119
# NOT:       0.0.0.0  9119  →  global        9119
```

If the rule is already broken, delete and recreate with explicit IP from `ip addr show eth0` inside WSL.

## References

See `references/wsl2-tailscale-connectivity.md` for detailed network topology and troubleshooting.
See `references/update-diagnostics.md` for update stage breakdowns and diagnostic procedures.