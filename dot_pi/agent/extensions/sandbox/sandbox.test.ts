/**
 * Integration tests for the sandbox deny list.
 *
 * These use the real @anthropic-ai/sandbox-runtime to verify that writes
 * to restricted paths are actually blocked by the OS-level sandbox profile.
 * Commands run through sandbox-exec via wrapWithSandbox, just like the
 * extension does in production.
 *
 * Key insight: SandboxManager.initialize() resolves denyWrite patterns
 * against process.cwd(), so we must chdir into the test workspace before
 * initializing.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_CONFIG } from "./config.js";

const DENY_WRITE = DEFAULT_RUNTIME_CONFIG.filesystem.denyWrite;
let originalCwd: string;
let testRoot: string;

/** Run a bash command inside the sandbox, return { exitCode, output } */
async function sandboxedExec(
	command: string,
	cwd: string,
): Promise<{ exitCode: number | null; output: string }> {
	const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

	return new Promise((resolve) => {
		const child = spawn("bash", ["-c", wrappedCommand], {
			cwd,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		child.stdout?.on("data", (data: Buffer) => {
			output += data.toString();
		});
		child.stderr?.on("data", (data: Buffer) => {
			output += data.toString();
		});

		child.on("close", (code) => {
			resolve({ exitCode: code, output });
		});
	});
}

async function withSandbox(
	fn: (root: string) => Promise<void>,
	options?: {
		allowNetwork?: string[];
	},
) {
	originalCwd = process.cwd();
	testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-integ-"));

	// Must chdir before initialize — deny rules resolve against cwd
	process.chdir(testRoot);

	await SandboxManager.initialize({
		network: {
			allowedDomains: options?.allowNetwork ?? [],
			deniedDomains: [],
		},
		filesystem: {
			allowWrite: ["."],
			denyRead: [],
			denyWrite: DENY_WRITE ?? [],
		},
	});

	try {
		await fn(testRoot);
	} finally {
		await SandboxManager.reset();
		process.chdir(originalCwd);
		fs.rmSync(testRoot, { recursive: true, force: true });
	}
}

describe("denied paths block real writes via sandbox", () => {
	it("blocks writes to .git anywhere in tree", async () => {
		await withSandbox(async (root) => {
			const gitDir = path.join(root, "subdir", ".git");
			fs.mkdirSync(gitDir, { recursive: true });

			const { exitCode, output } = await sandboxedExec(
				`echo "ref: refs/heads/main" > ${path.join(gitDir, "HEAD")}`,
				root,
			);
			expect(exitCode).not.toBe(0);
			expect(output).toMatch(/Operation not permitted|Permission denied/i);
		});
	});

	it("blocks writes to nested node_modules", async () => {
		await withSandbox(async (root) => {
			const nmDir = path.join(root, "node_modules");
			fs.mkdirSync(nmDir, { recursive: true });

			const { exitCode, output } = await sandboxedExec(
				`echo "module.exports = {}" > ${path.join(nmDir, "pkg.js")}`,
				root,
			);
			expect(exitCode).not.toBe(0);
			expect(output).toMatch(/Operation not permitted|Permission denied/i);
		});
	});

	it("blocks writes to vendor/ deep in tree", async () => {
		await withSandbox(async (root) => {
			const vDir = path.join(root, "subdir1", "subdir2", "vendor");
			fs.mkdirSync(vDir, { recursive: true });

			const { exitCode, output } = await sandboxedExec(
				`echo "{}" > ${path.join(vDir, "composer.json")}`,
				root,
			);
			expect(exitCode).not.toBe(0);
			expect(output).toMatch(/Operation not permitted|Permission denied/i);
		});
	});

	it("blocks writes to __pycache__/", async () => {
		await withSandbox(async (root) => {
			const pcDir = path.join(root, "mydir", "__pycache__");
			fs.mkdirSync(pcDir, { recursive: true });

			const { exitCode, output } = await sandboxedExec(
				`printf '\\x00\\x00' > ${path.join(pcDir, "module.cpython-311.pyc")}`,
				root,
			);
			expect(exitCode).not.toBe(0);
			expect(output).toMatch(/Operation not permitted|Permission denied/i);
		});
	});

	it("blocks writes to .venv/", async () => {
		await withSandbox(async (root) => {
			const vvDir = path.join(root, ".venv", "lib");
			fs.mkdirSync(vvDir, { recursive: true });

			const { exitCode, output } = await sandboxedExec(
				`echo "" > ${path.join(vvDir, "site-packages.txt")}`,
				root,
			);
			expect(exitCode).not.toBe(0);
			expect(output).toMatch(/Operation not permitted|Permission denied/i);
		});
	});

	it("allows writing to workspace root", async () => {
		await withSandbox(async (root) => {
			const { exitCode } = await sandboxedExec(
				`echo "hello" > ${path.join(root, "ok.txt")}`,
				root,
			);
			expect(exitCode).toBe(0);
			expect(fs.existsSync(path.join(root, "ok.txt"))).toBe(true);
		});
	});

	it("allows writing to nested subdir that is not denied", async () => {
		await withSandbox(async (root) => {
			const srcDir = path.join(root, "src", "components");
			fs.mkdirSync(srcDir, { recursive: true });

			const { exitCode } = await sandboxedExec(
				`echo "export const X = 1" > ${path.join(srcDir, "App.tsx")}`,
				root,
			);
			expect(exitCode).toBe(0);
			expect(fs.existsSync(path.join(srcDir, "App.tsx"))).toBe(true);
		});
	});

	it("blocks writes inside command substitution", async () => {
		await withSandbox(async (root) => {
			const gitDir = path.join(root, "subdir", ".git");
			fs.mkdirSync(gitDir, { recursive: true });

			// The write happens inside $(), not outside it.
			// Exit code may be 0 because the outer command succeeds.
			const targetFile = path.join(gitDir, "HEAD");
			await sandboxedExec(
				`x=$(echo "ref: refs/heads/main" > ${targetFile}); echo done`,
				root,
			);
			expect(fs.existsSync(targetFile)).toBe(false);
		});
	});
});

describe("network restrictions", () => {
	it("blocks connections to unallowed domains", async () => {
		await withSandbox(
			async (root) => {
				const { output } = await sandboxedExec(
					// curl returns 000 when it can't connect
					"curl -s -o /dev/null -w '%{http_code}' https://example.com",
					root,
				);
				// curl exits 0 even when the connection is denied by the
				// sandbox, but the HTTP status will be 000 (no response).
				expect(output.trim()).toBe("000");
			},
			{ allowNetwork: [] },
		);
	});

	it("allows connections to allowed domains", async () => {
		await withSandbox(
			async (root) => {
				const { exitCode } = await sandboxedExec(
					"curl -s -o /dev/null -w '%{http_code}' https://registry.npmjs.org/",
					root,
				);
				expect(exitCode).toBe(0);
			},
			{ allowNetwork: ["registry.npmjs.org"] },
		);
	});
});
