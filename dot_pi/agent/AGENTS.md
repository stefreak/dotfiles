# Workflow Rules

- **Before editing any file under `~/.*` (dotfiles and dotdirs in home), read the dotfiles skill.** These may be chezmoi-managed and require syncing. No exceptions.

# Communication

- **Push back when something is wrong or blocked.** If a command fails, a plan has a flaw, or a user request doesn't make sense, say so clearly and stop — don't silently work around it, downplay it, or paper over it with a partial result. A quiet failure is worse than an interrupted workflow.
- **Correct the user directly.** The user is genuinely happy to learn they are wrong. When you spot a mistake or misconception, say so plainly — don't soften, hedge, or pad it with reassurance. A clear correction is more useful than a polite dodge.
- **Reconcile before acting.** When your view differs from the user's — on approach, design, or interpretation — communicate first. Lay out your reasoning, explain the gap, and propose concrete steps to resolve it (e.g. gathering evidence, trying an experiment, looking at logs). Don't reason around the user's prompt and then just go ahead and do what you want anyway. The most important thing is to align before taking action.

# Safety

- **Never use `npx`.** Use `npm exec` to run locally installed binaries (e.g. `npm exec vitest run`, `npm exec tsc --noEmit`) or use `npm run` scripts. `npx` downloads and executes arbitrary packages from npm without review — it is an arbitrary code execution vector. No exceptions.
- **Never run destructive remote commands without explicit permission.** This includes (but is not limited to): `reboot`, `shutdown`, `rm -rf`, `ha host reboot`, `ha apps uninstall`, `docker rm`, `mkfs`, `dd`, or any command that destroys data or causes downtime. Always propose the command and wait for approval. No exceptions.

# Engineering Principles

## Types Over Text

- **Don't match on text to decide behavior.** If a handler needs to distinguish between error cases, use custom error classes or tagged results — not `message.includes("some string")`. Text changes, types don't lie.
- **Make errors distinguishable.** Downstream handlers should be able to branch on `instanceof` or a discriminator field, not parse error messages.

## Error Handling

- **Crash on the unexpected.** If something fails that shouldn't fail, crash. Do not log a warning and continue. A warning nobody reads is a silently corrupted state — and corrupted state is always worse than a crash. You can't always tell at write-time which failures are security-sensitive and which are harmless — many small seemingly-innocent fallbacks compound into real vulnerabilities. Treat every unexpected failure as critical.
- **Never catch to continue normally.** Catching an error and returning a default value, logging a warning, or silently discarding the error are all the same thing: hiding the failure. The caller proceeds as if nothing happened, and the bug goes undetected until it causes real damage.
- **Catch only when you can genuinely recover** — and recovery means the program is in a known-good state, not just "it didn't throw."
  - Catch specific expected errors by type (e.g. `ENOENT` when reading a config file that may not exist). Let everything else propagate — programming errors, permission issues, malformed data.
  - Prefer catching over check-then-act. Testing `existsSync` then reading is a race condition; catching the expected `ENOENT` is safer. But catch *only* that error — re-raise anything unexpected.
  - In JavaScript, always type catch variables as `unknown`. JS allows throwing anything — strings, numbers, null. Use `instanceof` checks to narrow before accessing properties. Never assume `.message` exists.
  - **Validate all parsed external input with a schema library (e.g. zod).** The result of `JSON.parse` or YAML parsing is `unknown` — never cast it to a typed interface without validation. Unvalidated JSON enables prototype pollution, type confusion, and other injection attacks. Schema validation is the boundary between untrusted data and trusted types.
  - Valid recovery:
    - Releasing resources in a cleanup block, then re-raising the error.
    - Catching a specific error to add context (file path, operation name), then re-raising.
    - Catching an expected error type (e.g. file-not-found) and returning a sensible default for that specific case.
    - Catching in a top-level entrypoint (CLI handler, test runner) to print a message and exit nonzero.
  - Invalid patterns — no exceptions:
    - `catch (e) { console.error(e); }` — the error is swallowed, execution continues.
    - `catch (e) { return defaultConfig; }` — the caller has no idea the config was malformed.
    - `catch { // ignore }` — the error is silently discarded.
    - `catch (e)` with the base exception type — too broad, catches programming errors that should crash.
    - `JSON.parse(data) as MyConfig` — no validation, trusts external input.

## Documentation

- **Write docs that age well.** Prefer stable descriptions (purpose, architecture, how to explore) over snapshots of current state. If a reader can derive it by running a command or reading a file, don't bake it into prose — it will be wrong within days.
- Examples of what rots fast: file trees, line-number references, exhaustive option lists, config snippets that duplicate source files.
- Instead, point the reader in the right direction: where to look, what tool to run, what pattern to grep for.

## Testing

- **Fix bugs test-first.** Before fixing a bug, write a test that reproduces it. Confirm the test fails. Then fix the bug. Confirm the test passes. No exceptions.
- **Prefer snapshot tests over scattered assertions.** A single snapshot captures the full output and makes regressions obvious on review. Lots of `includes` / `matches` checks are fragile — they verify pieces but miss the whole.
- **Prefer inline snapshots over external snapshot files.** Inline snapshots live next to the test code, making diffs and reviews more readable.
- **Never write snapshots manually.** Run the test runner with `--update` to generate them. Writing them by hand is just wasteful — the machine does it faster and correctly.
- **Test against real behavior, not against mocks.** Don't stub out the thing you're trying to verify — exercise the real code path. If that's too slow or fragile, fix the design, not the test.
  - e.g. record and replay HTTP responses rather than patching the HTTP client.
  - e.g. write real helper scripts in a tempdir and invoke real shell commands, rather than parsing fixture strings.
- **Don't unit-test glue code.** If a function just calls other things and formats output (e.g. a CLI script that checks system state and prints a summary), unit testing it means mocking everything — which tests nothing. Test it end-to-end against the real thing, or extract the interesting logic into pure functions and test those.

## Editing

- **Prefer targeted edits over full file rewrites.** Use search-and-replace (via `edit` or `sed`) to change specific regions. Rewriting entire files is error-prone — you lose context, drift from the original intent, and risk dropping details.
- **Never fix things manually that a linter or formatter can fix safely.** Run `biome check --write`, `npm run fix`, etc. instead of hand-editing import order, formatting, or other mechanical changes.
