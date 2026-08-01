# WSL2 + Tailscale + Hermes Desktop Connectivity

## Network Topology

```
[Mac / remote device]
       │
       ▼ (Tailscale, 100.x.y.z)
[Windows host] ←─── Tailscale adapter
       │
       │ netsh portproxy (0.0.0.0:9119 → 172.19.138.78:9119)
       ▼
[WSL2 eth0: 172.19.138.78]
       │
       ▼
[Hermes api_server on 0.0.0.0:9119]
```

## Key Ports

| Service | Port | Notes |
|---------|------|-------|
| Hermes api_server (desktop backend) | 9119 (or 8642 default) | Must bind to 0.0.0.0, not 127.0.0.1 |
| llama-swap (local LLM) | 8088 | Already accessible via Tailscale hostname |
| OpenWebUI / LM Studio | varies | Per-installation |

## Step-by-Step Setup

### 1. Bind Hermes to all interfaces in WSL2

```bash
echo 'API_SERVER_HOST=0.0.0.0' >> ~/.hermes/.env
echo 'API_SERVER_PORT=9119' >> ~/.hermes/.env  # or desired port
# Then restart gateway from a SEPARATE terminal (not inside Hermes)
hermes gateway restart
```

Verify:
```bash
ss -tlnp | grep 9119
# Should show: 0.0.0.0:9119, NOT 127.0.0.1:9119
```

### 2. Get WSL2 IP

```bash
ip addr show eth0 | grep inet
# Output: inet 172.19.138.78/20 brd 172.19.143.255 scope global eth0
```

### 3. Windows Firewall Rule (PowerShell as Admin)

```powershell
New-NetFirewallRule `
  -DisplayName "Hermes Gateway" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 9119 `
  -RemoteAddress 100.64.0.0/10 `
  -Action Allow
```

Verify:
```powershell
Get-NetFirewallRule -DisplayName "*Hermes*" | Format-Table DisplayName,Enabled,Action
```

### 4. Windows Port Proxy (PowerShell as Admin)

**CRITICAL:** Always use the explicit WSL2 IP, never dynamic capture via PowerShell regex — it often captures "global" from the interface scope line instead of the actual IP.

```powershell
# Delete any broken rule first
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9119 2>$null

# Add with explicit IP (get this from `ip addr show eth0` inside WSL)
netsh interface portproxy add v4tov4 `
  listenaddress=0.0.0.0 listenport=9119 `
  connectaddress=172.19.138.78 connectport=9119

# Verify — should show the IP, NOT "global"
netsh interface portproxy show all
```

### 5. Desktop App Connection

- Open Hermes Desktop on Windows
- Settings → Gateway URL: `http://<tailscale-ip>:9119`
- Tailscale IP: run `tailscale status` on Windows (shows 100.x.y.z)

## Troubleshooting Decision Tree

```
Can Mac curl localhost:9119 in WSL? → No
  └─ api_server not running or bound to wrong interface
  └─ Fix: check ss -tlnp, ensure API_SERVER_HOST=0.0.0.0

Can Windows curl localhost:9119? → No
  └─ port proxy broken (connectaddress=global)
  └─ Fix: delete and re-add rule with explicit IP

Can Mac curl <windows-tailscale-ip>:9119? → No (timeout)
  └─ Windows firewall blocking OR port proxy wrong
  └─ Fix: check New-NetFirewallRule, verify netsh output shows correct IP

Can Mac curl <windows-tailscale-ip>:9119/api/health? → Empty reply
  └─ Port proxy exists but connectaddress is wrong (global or gateway IP)
  └─ Fix: delete rule, re-add with explicit WSL2 eth0 IP
```

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Using `connectaddress=global` | Empty reply from server | Delete and recreate rule with explicit IP |
| Using gateway IP (172.19.128.1) | Empty reply / timeout | Use eth0 IP, not default gateway |
| Forgetting Windows Firewall rule | Connection refused | Add NetFirewallRule for port |
| api_server on 127.0.0.1 only | Works locally, fails remotely | Set API_SERVER_HOST=0.0.0.0 in .env |
| WSL2 IP changes after reboot | Rule becomes stale | Set static WSL2 IP or use startup script |

## The "global" Trap (Session 2026-07-30)

**Symptom:** `netsh interface portproxy show all` shows `connectaddress=global` instead of an IP. Connection from Windows/Tailscale times out or gets "Empty reply from server".

**Cause:** Dynamic IP capture via PowerShell regex on WSL output is fragile — the regex may match the wrong line (e.g., `scope global` in the interface alias) and capture "global" as the address.

**Reproduction:**
```powershell
# This often captures "global" instead of the IP:
$wslIp = (wsl -e ip addr show eth0 | Select-String 'inet\s+(\d+\.\d+\.\d+\.\d+)' | ForEach-Object { ($_ -split '\s+')[-2] })
# $wslIp might be "global" instead of e.g. "172.19.138.78"

netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9119 connectaddress=$wslIp connectport=9119
# Result: connectaddress=global (broken)
```

**Fix — always use explicit IP, never dynamic capture for portproxy:**
```powershell
# Get WSL2 IP from inside WSL first (more reliable)
$wslIp = wsl -e bash -c "ip addr show eth0 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1"

# Then hardcode it in the rule
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9119 2>$null
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9119 connectaddress=$wslIp connectport=9119
```

**Verify the rule is correct:**
```powershell
netsh interface portproxy show all
# Should show: 0.0.0.0  9119  →  172.19.138.78  9119
# NOT:       0.0.0.0  9119  →  global        9119
```

If the rule is already broken, delete and recreate with explicit IP from `ip addr show eth0` inside WSL.

## Making Port Proxy Survive Reboots

WSL2 IPs can change on reboot. Options:

**Option A: Static WSL2 IP** (add to `/etc/wsl.conf`):
```ini
[network]
generateResolvConf = false
```
Then set a static IP via netplan or DHCP reservation.

**Option B: Windows startup script:**
```powershell
# C:\Users\<user>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\hermes-portproxy.ps1
$wslIp = wsl -e bash -c "ip addr show eth0 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1" 2>$null
if ($wslIp -and $wslIp -ne 'global') {
    netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9119 2>$null
    netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9119 connectaddress=$wslIp connectport=9119
}
```

**Option C: Accept the manual step** — after each WSL reboot, run:
```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=9119 2>$null
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9119 connectaddress=<current-wsl-ip> connectport=9119
```
