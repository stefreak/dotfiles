# Engineering Principles

## Error Handling

- **Never swallow errors.** A loud crash is always better than a silent bug.
- **Don't catch an exception just to return a default value** (e.g. `except: return False`). If something fails, the caller must know. Let the exception propagate so upstream can act on it.
- **Catch only specific exception types** and only when there is a genuine recovery path — not to hide the failure.
- Valid exception handling:
  - `try/finally` for cleanup (no `except`).
  - Catching a specific error to add context then re-raising.
  - Catching in a CLI entrypoint to print a clean message and exit nonzero.
- Invalid exception handling:
  - `except SomeError: return False` — hides the error from the caller.
  - `except Exception:` — too broad.
  - `except SomeError: pass` — silently discards.

## Documentation

- **Write docs that age well.** Prefer stable descriptions (purpose, architecture, how to explore) over snapshots of current state. If a reader can derive it by running a command or reading a file, don't bake it into prose — it will be wrong within days.
- Examples of what rots fast: file trees, line-number references, exhaustive option lists, config snippets that duplicate source files.
- Instead, point the reader in the right direction: where to look, what tool to run, what pattern to grep for.

## Testing

- **Never use `unittest.mock` (`patch`, `MagicMock`, etc.).**
- Use `responses` library for HTTP: register expected responses, then assert on calls.
- For subprocess code: write real dummy shell scripts in a tempdir and invoke them via real `subprocess`. Parsing fixture strings does not test your assumptions.
- Don't write unit tests for CLI status scripts — test them against the real thing. Only extract and test tricky pure functions.
