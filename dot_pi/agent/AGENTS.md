# Workflow Rules

- **Before editing any file under `~/.*` (dotfiles and dotdirs in home), read the dotfiles skill.** These may be chezmoi-managed and require syncing. No exceptions.

# Safety

- **Never run destructive remote commands without explicit permission.** This includes (but is not limited to): `reboot`, `shutdown`, `rm -rf`, `ha host reboot`, `ha apps uninstall`, `docker rm`, `mkfs`, `dd`, or any command that destroys data or causes downtime. Always propose the command and wait for approval. No exceptions.

# Engineering Principles

## Types Over Text

- **Don't match on text to decide behavior.** If a handler needs to distinguish between error cases, use custom error classes or tagged results — not `message.includes("some string")`. Text changes, types don't lie.
- **Make errors distinguishable.** Downstream handlers should be able to branch on `instanceof` or a discriminator field, not parse error messages.

## Error Handling

- **Never swallow errors.** A loud crash is always better than a silent bug.
- **Don't catch an error just to return a default value.** If something fails, the caller must know. Let the error propagate so upstream can act on it.
- **Catch only specific error types** and only when there is a genuine recovery path — not to hide the failure.
- Valid patterns:
  - Using a cleanup/ensure block to release resources while still letting the error propagate.
  - Catching a specific error to add context then re-raising.
  - Catching in a CLI entrypoint to print a clean message and exit nonzero.
- Invalid patterns:
  - Catching an error and returning a default — hides the failure from the caller.
  - Catching the base exception type — too broad.
  - Catching an error and silently discarding it.

## Documentation

- **Write docs that age well.** Prefer stable descriptions (purpose, architecture, how to explore) over snapshots of current state. If a reader can derive it by running a command or reading a file, don't bake it into prose — it will be wrong within days.
- Examples of what rots fast: file trees, line-number references, exhaustive option lists, config snippets that duplicate source files.
- Instead, point the reader in the right direction: where to look, what tool to run, what pattern to grep for.

## Testing

- **Prefer snapshot tests over scattered assertions.** A single snapshot captures the full output and makes regressions obvious on review. Lots of `includes` / `matches` checks are fragile — they verify pieces but miss the whole.
- **Test against real behavior, not against mocks.** Don't stub out the thing you're trying to verify — exercise the real code path. If that's too slow or fragile, fix the design, not the test.
  - e.g. record and replay HTTP responses rather than patching the HTTP client.
  - e.g. write real helper scripts in a tempdir and invoke real shell commands, rather than parsing fixture strings.
- **Don't unit-test glue code.** If a function just calls other things and formats output (e.g. a CLI script that checks system state and prints a summary), unit testing it means mocking everything — which tests nothing. Test it end-to-end against the real thing, or extract the interesting logic into pure functions and test those.
