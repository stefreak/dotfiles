import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, getSandboxRuntimeConfigForMode } from "./config.js";

/**
 * Integration tests for the sandbox deny list.
 * These use the real @anthropic-ai/sandbox-runtime to verify that writes
 * to restricted paths are actually blocked — catching missing or incorrect
 * patterns before they reach production.
 */

describe("denied paths block real writes via SandboxManager", function () {
	const isSupportedPlatform = process.platform === "darwin" || process.platform === "linux";

	const sandboxModule = require("@anthropic-ai/sandbox-runtime");

	/** Create, initialize sandbox with deny list, run fn, then reset + cleanup */
	async function withSandbox(allowWrite: string[], denyWrite: string[], fn: (rootDir: string) => Promise<void>) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-integration-"));

		await sandboxModule.SandboxManager.initialize({
			network: { allowedDomains: [], deniedDomains: [] },
			filesystem: { allowWrite, denyRead: [], denyWrite },
		});

		try {
			await fn(root);
		} finally {
			await sandboxModule.SandboxManager.reset();
			fs.rmSync(root, { recursive: true, force: true });
		}
	}

	it("blocks writes to .git anywhere in tree", async () => {
		assert.ok(
			DEFAULT_CONFIG.filesystem!.denyWrite!.some((p) => p.includes(".git")),
			"`**/.git/**` should be in denyWrite",
		);

		await withSandbox(
			["."],
			DEFAULT_CONFIG.filesystem!.denyWrite!,
			async (root) => {
				const gitDir = path.join(root, "subdir", ".git");
				fs.mkdirSync(gitDir, { recursive: true });

				const file = path.join(gitDir, "HEAD");
				try {
					fs.writeFileSync(file, "ref: refs/heads/main\n");
					assert.fail(`writing to ${file} should have been denied`);
				} catch (err: any) {
					if (err.code === "EPERM" || err.message.includes("Permission denied")) {
						return; // expected
					}
					throw err; // unexpected error — re-raise
				}
			},
		);
	});

	it("blocks writes to nested node_modules in workspace root", async () => {
		assert.ok(
			DEFAULT_CONFIG.filesystem!.denyWrite!.some((p) => p.includes("node_modules")),
			"a node_modules pattern should be in denyWrite",
		);

		await withSandbox(
			["."],
			DEFAULT_CONFIG.filesystem!.denyWrite!,
			async (root) => {
				const nmDir = path.join(root, "node_modules");
				fs.mkdirSync(nmDir, { recursive: true });

				const file = path.join(nmDir, "pkg.js");
				try {
					fs.writeFileSync(file, "module.exports = {}");
					assert.fail(`writing to ${file} should have been denied`);
				} catch (err: any) {
					if (err.code === "EPERM" || err.message.includes("Permission denied")) {
						return; // expected
					}
					throw err;
				}
			},
		);
	});

	it("blocks writes to vendor/ anywhere in tree", async () => {
		assert.ok(
			DEFAULT_CONFIG.filesystem!.denyWrite!.some((p) => p.includes("vendor")),
			"a vendor pattern should be in denyWrite",
		);

		await withSandbox(
			["."],
			DEFAULT_CONFIG.filesystem!.denyWrite!,
			async (root) => {
				const vDir = path.join(root, "subdir1", "subdir2", "vendor");
				fs.mkdirSync(vDir, { recursive: true });

				const file = path.join(vDir, "composer.json");
				try {
					fs.writeFileSync(file, "{}");
					assert.fail(`writing to ${file} should have been denied`);
				} catch (err: any) {
					if (err.code === "EPERM" || err.message.includes("Permission denied")) {
						return; // expected
					}
					throw err;
				}
			},
		);
	});

	it("blocks writes to __pycache__/", async () => {
		assert.ok(
			DEFAULT_CONFIG.filesystem!.denyWrite!.some((p) => p.includes("__pycache__")),
			"a __pycache__ pattern should be in denyWrite",
		);

		await withSandbox(
			["."],
			DEFAULT_CONFIG.filesystem!.denyWrite!,
			async (root) => {
				const pcDir = path.join(root, "mydir", "__pycache__");
				fs.mkdirSync(pcDir, { recursive: true });

				const file = path.join(pcDir, "module.cpython-311.pyc");
				try {
					fs.writeFileSync(file, "\x00\x00");
					assert.fail(`writing to ${file} should have been denied`);
				} catch (err: any) {
					if (err.code === "EPERM" || err.message.includes("Permission denied")) {
						return; // expected
					}
					throw err;
				}
			},
		);
	});

	it("blocks writes to .venv/", async () => {
		assert.ok(
			DEFAULT_CONFIG.filesystem!.denyWrite!.some((p) => p.includes(".venv")),
			"a .venv pattern should be in denyWrite",
		);

		await withSandbox(
			["."],
			DEFAULT_CONFIG.filesystem!.denyWrite!,
			async (root) => {
				const vvDir = path.join(root, ".venv", "lib");
				fs.mkdirSync(vvDir, { recursive: true });

				const file = path.join(vvDir, "site-packages.txt");
				try {
					fs.writeFileSync(file, "");
					assert.fail(`writing to ${file} should have been denied`);
				} catch (err: any) {
					if (err.code === "EPERM" || err.message.includes("Permission denied")) {
						return; // expected
					}
					throw err;
				}
			},
		);
	});

	it("allows writing to workspace root", async () => {
		await withSandbox(
			["."],
			DEFAULT_CONFIG.filesystem!.denyWrite!,
			async (root) => {
				const file = path.join(root, "ok.txt");
				fs.writeFileSync(file, "hello\n");

				assert.ok(fs.existsSync(file), "writing to workspace root should succeed");
			},
		);
	});
});
