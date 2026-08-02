---
name: Llama-Swap Addon Configuration
trigger: ALWAYS
description: Configure the llama-swap Home Assistant addon — model entries, filter presets, groups, and Unsloth-recommended parameters for local LLM inference.
---

# Llama-Swap Addon Configuration

llama-swap is a Home Assistant addon that proxies multiple llama.cpp models on dynamic ports, with filter presets for sampling parameters and power management via smart plugs.

## Config Structure (`config.yaml`)

```yaml
health_check_timeout: 900
global_ttl: 0
log_level: info
start_port: 5800
capture_buffer: 5
performance:
  disabled: false
  every: 15s

filter_presets:
  - name: model:variant          # e.g. gemma4:31b-thinking
    temperature: 1.0
    top_p: 0.95
    top_k: 64
    min_p: 0.0
    enable_thinking: true         # true for thinking mode, false for instruct
    preserve_thinking: true       # keep thinking tokens in output

models:
  - id: gemma4:31b
    cmd: >-
      manage-switch.py --entity-id switch.xxx -- ssh.py user@host --port ${PORT} --
      "Kill existing CUDA processes; llama-server.exe --device CUDA0 -m MODEL.gguf ..."
    name: Display Name
    proxy: http://localhost:${PORT}
    filter_presets: model:thinking, model:instruct
    unlisted: false

groups:
  - name: gpu-models
    swap: true
    exclusive: false
    members: model1, model2
  - name: embeddings
    swap: true
    exclusive: false
    persistent: true
    members: embedding-model
```

## Unsloth-Recommended Parameters by Model

### Gemma 4 (dense 31B, multimodal)
- **temperature**: 1.0
- **top_p**: 0.95
- **top_k**: 64
- **min_p**: 0.0
- **cache-type-k**: q4_0
- **cache-type-v**: q4_0
- **context**: 262144 (256K)
- **repeat-penalty**: 1.0 (disabled)
- **filter presets**: thinking and instruct only (no separate coding preset — Qwen has distinct coding checkpoints, Gemma does not)
- **multimodal**: include `--mmproj mmproj.gguf` path

### Qwen 3.6 (MoE 35B-A3B, dense 27B)
- **temperature**: varies by preset (1.0 thinking, 0.6 coding, 0.7 instruct)
- **top_p**: 0.95 (thinking/coding), 0.8 (instruct)
- **top_k**: 20
- **cache-type-k/v**: q8_0
- **filter presets**: thinking, coding, instruct, reasoning

### Key differences: Gemma uses q4_0 cache types (not q8_0), top_k 64 (not 20), and simpler preset structure.

## Model Command Template (Windows GPU via SSH)

```
manage-switch.py --entity-id switch.xxx -- ssh.py stefr@100.95.97.109 --port ${PORT} --
"Get-CimInstance Win32_Process -Filter 'Name=''llama-server.exe''' | Where-Object {$_ .CommandLine -like '*--device CUDA0*'} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force};
C:/Users/stefr/scoop/apps/llama.cpp-cu124/current/llama-server.exe
--device CUDA0 -m MODEL_PATH --mmproj MMPROJ_PATH --port ${PORT}
-ngl 999 -fa 1 --no-mmap --jinja -b 2048 -ub 2048
--cache-type-k q4_0 --cache-type-v q4_0 -c 262144 -np 1 --parallel 1"
```

## Workflow

1. Write existing config to file (never regenerate from scratch — user prefers targeted patches)
2. Use `patch` to make changes: add filter presets, add model entry, update groups
3. Validate YAML lint passes
4. Copy to HA addon config directory, restart addon

## Pitfalls

- **Cache types differ by model**: Gemma 4 uses `q4_0`, Qwen uses `q8_0`. Don't copy-paste blindly.
- **Model paths use `Models/` not `models/`** on this Windows host.
- **Multimodal models need both `.gguf` and `mmproj-*.gguf`** — check for mmproj file existence before configuring.
- **Filter presets with `enable_thinking`** control whether thinking tokens are generated; `preserve_thinking` controls whether they appear in proxy output. Both should be true for thinking variants.
- **llama-swap addon config lives on the HA instance**, not the Hermes local filesystem. Work locally, then copy to HA.
- **Gemma 4 "system" loop**: If the model just repeats "system", it's likely a chat template or tokenizer mismatch. Diagnose by checking llama-swap logs, testing raw completion without chat template, and comparing with working Qwen config. See `references/gemma-4-31b-session-config.md`.

## Session References

- `references/gemma-4-31b-session-config.md` — Gemma 4 31B dense config decisions and parameters
