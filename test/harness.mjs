/**
 * Loads the extension the way Pi does, against a throwaway config directory.
 *
 * Two things this has to get right:
 *
 *  - Pi runs extensions through jiti with module aliases, so the extension's
 *    `import type` statements must resolve. The aliases below mirror
 *    `getAliases()` in Pi's `dist/core/extensions/loader.js`.
 *  - The extension reads `PI_CODING_AGENT_DIR` per call, so pointing it at a
 *    temp directory keeps a test run from touching real user config.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { existsSync, realpathSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const PI_RELATIVE = [
	join("node_modules", "@earendil-works", "pi-coding-agent"),
	join("libexec", "lib", "node_modules", "@earendil-works", "pi-coding-agent"),
]

/** Is this directory the pi-coding-agent package itself? */
const isPiPackage = (dir) =>
	existsSync(join(dir, "package.json")) && existsSync(join(dir, "dist", "index.js"))

/** Walk up looking for a tree that contains the Pi package. */
function walkUp(start) {
	let dir = start
	for (;;) {
		for (const relative of PI_RELATIVE) {
			const candidate = join(dir, relative)
			if (isPiPackage(candidate)) return candidate
		}
		const parent = dirname(dir)
		if (parent === dir) return undefined
		dir = parent
	}
}

/**
 * Locate the pi-coding-agent package. Test setup only — the extension itself
 * never needs this, since Pi hands it the host modules via jiti aliases.
 */
export function findPiPackage() {
	const override = process.env.PI_INSTALL_DIR
	if (override) {
		if (isPiPackage(override)) return override
		const nested = PI_RELATIVE.map((relative) => join(override, relative)).find(isPiPackage)
		if (nested) return nested
		throw new Error(`PI_INSTALL_DIR=${override} does not contain the pi-coding-agent package`)
	}

	// The running `pi` binary is the most reliable anchor: it may live under a
	// version manager, a Homebrew Cellar, or a plain global prefix.
	try {
		const bin = execFileSync("which", ["pi"], { encoding: "utf8" }).trim()
		if (bin) {
			const resolved = realpathSync(bin)
			// Homebrew shims the binary into Cellar/<name>/<version>/bin; the
			// sibling libexec tree is reached by walking up from there.
			const found = walkUp(dirname(resolved)) ?? walkUp(dirname(dirname(resolved)))
			if (found) return found
		}
	} catch {
		// `pi` not on PATH; fall through to the well-known locations.
	}

	for (const prefix of ["/opt/homebrew/lib", "/usr/local/lib", "/usr/lib", join(process.env.HOME ?? "", ".local")]) {
		const found = walkUp(prefix)
		if (found) return found
	}

	throw new Error("Pi install not found. Set PI_INSTALL_DIR to the pi-coding-agent package directory.")
}

function aliasMap(piPackage) {
	return {
		"@earendil-works/pi-ai": join(piPackage, "node_modules", "@earendil-works", "pi-ai", "dist", "compat.js"),
		"@earendil-works/pi-coding-agent": join(piPackage, "dist", "index.js"),
	}
}

/** A fake `models-store.json` entry set, shaped like Pi's registry. */
export function makeRegistry(store) {
	const models = Object.entries(store).flatMap(([provider, { models }]) =>
		models.map((model) => ({ ...model, provider, input: model.input ?? ["text"] })),
	)
	const byId = new Map(models.map((model) => [`${model.provider}/${model.id}`, model]))
	return {
		find: (provider, id) => byId.get(`${provider}/${id}`),
		hasConfiguredAuth: () => true,
		getAvailable: () => [...models],
	}
}

/**
 * Create a disposable config directory (and copy of the example config) plus a
 * freshly imported extension bound to it.
 */
export async function withExtension(piPackage, { config } = {}) {
	const configDir = await mkdtemp(join(tmpdir(), "pi-context-diet-test-"))
	process.env.PI_CODING_AGENT_DIR = configDir

	// Every test run starts from the shipped defaults, so a developer's real
	// config.json cannot change the outcome.
	if (config !== null) {
		const extensionDir = join(configDir, "extensions", "context-diet")
		await mkdir(extensionDir, { recursive: true })
		if (config !== undefined) {
			await writeFile(join(extensionDir, "config.json"), JSON.stringify(config, null, 2))
		}
	}

	const jitiUrl = pathToFileURL(join(piPackage, "node_modules", "jiti", "lib", "jiti.mjs")).href
	const { createJiti } = await import(jitiUrl)
	const jiti = createJiti(import.meta.url, { moduleCache: false, alias: aliasMap(piPackage) })
	const module = await jiti.import(join(REPO_ROOT, "src", "context-diet", "index.ts"))

	const events = {}
	const commands = {}
	const factory = module.default
	factory({
		on: (name, handler) => {
			events[name] = handler
		},
		registerCommand: (name, options) => {
			commands[name] = options
		},
	})

	return {
		events,
		commands,
		configDir,
		configPath: join(configDir, "extensions", "context-diet", "config.json"),
		dispose: () => rm(configDir, { recursive: true, force: true }),
	}
}

/** Build a `tool_result` event with sensible defaults. */
export function toolResult(overrides = {}) {
	return {
		toolName: "bash",
		input: { command: "rg --files src", exitCode: 0, stderr: "" },
		content: [{ type: "text", text: "x".repeat(40000) }],
		isError: false,
		...overrides,
	}
}
