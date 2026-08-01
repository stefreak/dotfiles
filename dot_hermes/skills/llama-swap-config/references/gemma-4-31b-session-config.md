# Gemma 4 31B Dense Configuration (Session: 2026-06-01)

Applied Unsloth-recommended parameters for Gemma 4 dense model (31B-it-Q5_K_M).

## Key decisions
- Dense model only (not MoE 26B-A4B)
- Two filter presets: thinking and instruct (no coding variant — Qwen has coding checkpoints, Gemma does not)
- preserve_thinking enabled on both variants
- Unsloth params: temp 1.0, top_k 64, top_p 0.95, min_p 0.0, cache q4_0

## Model files
```
C:/Users/stefr/Models/gemma-4-31B-it-GGUF/gemma-4-31B-it-Q5_K_M.gguf  (~22GB)
C:/Users/stefr/Models/gemma-4-31B-it-GGUF/mmproj-BF16.gguf            (~1.2GB)
```

## Added to gpu-models group alongside: qwen3.6:35b-a3b, qwen3.6:27b

## Cmd differs from Qwen models:
- `--cache-type-k q4_0 --cache-type-v q4_0` (Qwen uses `-ctk q8_0 -ctv q8_0`)
- `--jinja` flag (Qwen also uses this)
- Model path under `Models/` not `models/`

## Known Issue: "system" loop (reported June 12, 2026)

**Symptom:** gemma4:31b via llama-swap just repeats "system" instead of generating responses.

**Suspected causes (to diagnose):**
1. **Prompt template mismatch** — Gemma 4 may not support the same chat template as Qwen. Check if `--jinja` is applying the wrong template.
2. **Tokenizer issue** — The model may not recognize the system/assistant/user role tokens and gets stuck.
3. **Filter preset conflict** — `enable_thinking: true` may interfere with non-thinking variants.

**Diagnosis path:**
- Check llama-swap logs for that model's output
- Test with a raw completion prompt (no chat template) to isolate template vs model issue
- Compare working Qwen config vs Gemma config for template differences

**Status:** Pending diagnosis. See action point thread created June 12, 2026.
