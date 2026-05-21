# Conventions

## Hardcoding over abstraction

This is a personal dotfiles repo, not a shared library. Prefer hardcoding values (IP addresses, paths, domain lists) over adding configuration layers, environment variables, or indirection to "make things configurable." If I need to change something later, I'll change it in the source.

## Error handling

Follow the principles in `dot_pi/agent/AGENTS.md`. In shell scripts, always use `set -euo pipefail`. In TypeScript, crash on the unexpected — don't catch and continue.

## Testing the sandbox extension

The integration tests in `dot_pi/agent/extensions/sandbox/` call `SandboxManager.initialize()`, which binds a local port. This conflicts with the pi sandbox's network restrictions. Run the tests with `askOutsideSandbox: true` (bypass sandbox) so they can bind the port.
