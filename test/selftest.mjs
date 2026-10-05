/**
 * Offline behavioural checks. No model calls, no network, no user config.
 *
 * Run with `npm test`. Set PI_INSTALL_DIR if Pi is not in a standard location.
 */

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { findPiPackage, makeRegistry, REPO_ROOT, toolResult, withExtension } from "./harness.mjs"

const piPackage = findPiPackage()
const store = JSON.parse(await readFile(join(REPO_ROOT, "test", "fixtures", "models-store.json"), "utf8"))
const registry = makeRegistry(store)

const GOOD_CONFIG = {
	enabled: true,
	minTokens: 1000,
	helperModels: [
		["openrouter", "~deepseek/deepseek-flash-latest"],
		["openrouter", "~z-ai/glm-flash-latest"],
	],
}

let failures = 0
let count = 0
const check = (name, ok, detail = "") => {
	count++
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
	if (!ok) failures++
}

// ---------------------------------------------------------------------------
// Runtime-floor guard
// ---------------------------------------------------------------------------
// The repo must never advertise support for an older Node than the Pi packages
// it is built against. `engines.node` and the `@types/node` major are held to
// the *pinned* devDependency floors, read by direct path from REPO_ROOT — never
// via findPiPackage(), which in an interactive shell resolves the user's global
// Pi rather than the version this lockfile pins. A floor check run only by hand
// drifts; this one gates `npm test` and therefore CI.

/** `>=x.y.z` (the form both Pi packages use); null — and so a failed check — for
 * anything else, so a future exotic range fails loudly instead of passing.
 */
const FLOOR = /^>=\s*(\d+)\.(\d+)\.(\d+)/
function nodeFloor(range) {
	const m = FLOOR.exec((range ?? "").trim())
	return m ? m.slice(1).map(Number) : null
}

/** Compare [major, minor, patch] triples: negative, zero, positive. */
function verCmp(a, b) {
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] - b[i]
	}
	return 0
}

/** Leading major of a range such as `^22.20.5`. */
function majorOf(range) {
	const m = /\d+/.exec(range ?? "")
	return m ? Number(m[0]) : null
}

const repoPkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8"))
const peerPkgs = Object.fromEntries(
	await Promise.all(
		["pi-ai", "pi-coding-agent"].map(async (name) => [
			name,
			JSON.parse(
				await readFile(join(REPO_ROOT, "node_modules", "@earendil-works", name, "package.json"), "utf8"),
			),
		]),
	),
)

const repoFloor = nodeFloor(repoPkg.engines?.node)
for (const [name, pkg] of Object.entries(peerPkgs)) {
	const peerFloor = nodeFloor(pkg.engines?.node)
	check(
		`engines.node >= ${name} floor`,
		repoFloor !== null && peerFloor !== null && verCmp(repoFloor, peerFloor) >= 0,
		`repo ${repoPkg.engines?.node} vs ${name} ${pkg.engines?.node}`,
	)
}
check(
	"@types/node major matches engine floor",
	repoFloor !== null && majorOf(repoPkg.devDependencies?.["@types/node"]) === repoFloor[0],
	`@types/node ${repoPkg.devDependencies?.["@types/node"]} vs engines ${repoPkg.engines?.node}`,
)

/** A context that records notifications and replays a scripted menu. */
function makeCtx(notices = [], selectQueue = []) {
	return {
		modelRegistry: registry,
		ui: {
			notify: (message, type) => notices.push({ message, type }),
			select: async (_title, options) => {
				const next = selectQueue.shift()
				return next === undefined ? undefined : next(options)
			},
			confirm: async () => false,
			input: async () => undefined,
		},
	}
}

/** A registry whose only helper call returns a fixed summary. */
function stubSummaries(registry, summary) {
	const calls = []
	return {
		calls,
		registry: {
			...registry,
			streamSimple: (model, _context, _options) => {
				calls.push({ model, maxTokens: _options?.maxTokens })
				return { result: async () => ({ content: [{ type: "text", text: summary }] }) }
			},
		},
	}
}

const SUMMARY = "FACTS\n- src/context-diet/index.ts holds the extension\n- 507 lines\nUNKNOWNS\n- none"

// ---------------------------------------------------------------------------
// 1. Registration
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, { config: GOOD_CONFIG })
	check("registers tool_result hook", typeof ext.events.tool_result === "function", Object.keys(ext.events).join(","))
	check("registers session_start hook", typeof ext.events.session_start === "function")
	check("registers context-diet command", !!ext.commands["context-diet"])
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 2. Argument completion
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, { config: GOOD_CONFIG })
	const cmd = ext.commands["context-diet"]
	const values = (items) => items?.map((item) => item.value)
	check("completes both subcommands", values(await cmd.getArgumentCompletions(""))?.join(",") === "status,config")
	check("filters completions", values(await cmd.getArgumentCompletions("co"))?.join(",") === "config")
	check("returns null when nothing matches", (await cmd.getArgumentCompletions("zz")) === null)
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 3. Status reporting
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, { config: GOOD_CONFIG })
	const notices = []
	await ext.commands["context-diet"].handler("status", makeCtx(notices))
	const status = notices.at(-1).message
	check("status names the active helper", status.includes("helper in use: openrouter/~deepseek/deepseek-flash-latest"))
	check("status lists every chain row", (status.match(/^\s+\d+\. /gm) ?? []).length === 2, status.split("\n").slice(2, 5).join(" | "))
	check("status shows a price per entry", status.includes("ok ($0.0243/Mtok in)"), status.split("\n")[3])
	check("status points at the config path", status.includes("config: ") && status.includes("extensions/context-diet/config.json"))
	check("unknown argument warns", await unknownArg(ext, "bogus"))
	await ext.dispose()
}

async function unknownArg(ext, arg) {
	const notices = []
	await ext.commands["context-diet"].handler(arg, makeCtx(notices))
	return notices.at(-1)?.type === "warning" && notices.at(-1).message.includes("unknown argument")
}

// ---------------------------------------------------------------------------
// 4. Settings menu
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, { config: GOOD_CONFIG })
	const notices = []
	const ctx = makeCtx(notices, [
		(options) => options.find((option) => option.startsWith("minTokens =")),
		(options) => options.find((option) => option.startsWith("12000 tok")),
		() => undefined,
	])
	await ext.commands["context-diet"].handler("config", ctx)
	const saved = JSON.parse(await readFile(ext.configPath, "utf8"))
	check("menu change persists", saved.minTokens === 12000, `got ${saved.minTokens}`)
	check("menu change applies immediately", notices.at(-1).message.includes("12000 tok"))

	// Reorder: pick the second chain entry; it moves to front, the rest follow.
	const notices2 = []
	// Match the row by prefix: the menu truncates long labels with an ellipsis.
	const ctx2 = makeCtx(notices2, [
		(options) => options.find((option) => option.startsWith("helperModels =")),
		(options) => options.find((option) => option.startsWith("2. ~z-ai/glm-flash-latest")),
		() => undefined,
	])
	await ext.commands["context-diet"].handler("config", ctx2)
	const reordered = JSON.parse(await readFile(ext.configPath, "utf8")).helperModels
	check("picked helper moves to front", reordered[0][1] === "~z-ai/glm-flash-latest", JSON.stringify(reordered.map((r) => r[1])))
	check("previous helper kept as fallback", reordered[1][1] === "~deepseek/deepseek-flash-latest")
	check("status reflects the reorder", notices2.at(-1).message.includes("helper in use: openrouter/~z-ai/glm-flash-latest"))

	// Off switch writes through too.
	const ctx3 = makeCtx([], [() => "enabled = true", (options) => options.find((option) => option.startsWith("off")), () => undefined])
	await ext.commands["context-diet"].handler("config", ctx3)
	check("enabled persists false", JSON.parse(await readFile(ext.configPath, "utf8")).enabled === false)
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 5. Config file handling
// ---------------------------------------------------------------------------

{
	const config = { ...GOOD_CONFIG, "//thresholds": "keep me", secret: "(secret)" }
	const ext = await withExtension(piPackage, { config })
	const ctx = makeCtx([], [() => "minTokens = 1000", (options) => options.find((option) => option.startsWith("6000 tok")), () => undefined])
	await ext.commands["context-diet"].handler("config", ctx)
	const saved = JSON.parse(await readFile(ext.configPath, "utf8"))
	check("comment keys survive a save", saved["//thresholds"] === "keep me")
	check("untouched keys survive a save", saved.secret === "(secret)")
	check("only the edited key is rewritten", Object.keys(saved).length === Object.keys(config).length, Object.keys(saved).join(","))

	// A hand edit mid-session must NOT take effect: config is a startup snapshot.
	await writeFile(ext.configPath, JSON.stringify({ ...GOOD_CONFIG, minTokens: 999999 }, null, 2))
	const notices = []
	await ext.commands["context-diet"].handler("status", makeCtx(notices))
	check("mid-session file edit is inert", notices.at(-1).message.includes("1000 tok"))
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 6. Missing / misconfigured models
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, {
		config: { ...GOOD_CONFIG, helperModels: [["openrouter", "~nope/missing"], ["openrouter", "~z-ai/glm-flash-latest"]] },
	})
	const notices = []
	await ext.commands["context-diet"].handler("status", makeCtx(notices))
	const status = notices.at(-1).message
	check("unresolvable id is flagged", status.includes("MISSING (no such model id)"))
	check("chain falls through to the next entry", status.includes("helper in use: openrouter/~z-ai/glm-flash-latest"))
	await ext.dispose()
}

{
	const ext = await withExtension(piPackage, { config: { ...GOOD_CONFIG, helperModels: [] } })
	const notices = []
	await ext.commands["context-diet"].handler("status", makeCtx(notices))
	check("empty chain says nothing will compress", notices.at(-1).message.includes("NONE — nothing will be compressed"))
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 7. tool_result guardrails
// ---------------------------------------------------------------------------

{
	// No config file at all: the shipped defaults must carry the whole feature.
	const ext = await withExtension(piPackage, { config: null })
	const { registry: stub, calls } = stubSummaries(registry, SUMMARY)
	const hooks = ext.events
	const run = (event, stubRegistry = stub) => hooks.tool_result(event, { modelRegistry: stubRegistry })

	const notices = []
	await hooks.tool_result(toolResult(), makeCtx(notices)) // warm the module, no assertions
	await ext.commands["context-diet"].handler("status", makeCtx(notices))
	check("defaults carry the feature", notices.at(-1).message.includes("built-in defaults in use"))
	check("compresses a large discovery output", (await run(toolResult())) !== undefined)
	check("helper called once", calls.length === 1)
	check("helper bounded by maxSummaryTokens", calls[0]?.maxTokens === 1800, String(calls[0]?.maxTokens))

	const cases = [
		["skips read results", toolResult({ toolName: "read", input: { path: "a.ts" } })],
		["skips edit results", toolResult({ toolName: "edit", input: { path: "a.ts" } })],
		["skips errored calls", toolResult({ isError: true })],
		["skips nested codemode results", toolResult({ parentToolCallId: "abc" })],
		["skips failing bash", toolResult({ input: { command: "rg x", exitCode: 1, stderr: "" } })],
		["skips bash with stderr", toolResult({ input: { command: "rg x", exitCode: 0, stderr: "warning" } })],
		["skips non-discovery bash", toolResult({ input: { command: "rm -rf /tmp/x", exitCode: 0, stderr: "" } })],
		["skips small outputs", toolResult({ content: [{ type: "text", text: "tiny" }] })],
		["skips image results", toolResult({ content: [{ type: "image", data: "..." }] })],
		["skips credential in output", toolResult({ content: [{ type: "text", text: "x".repeat(40000) + " api_key=abc" }] })],
		["skips credential in argv", toolResult({ input: { command: "rg -n secret_api_key src", exitCode: 0, stderr: "" } })],
		["skips when no helper resolves", toolResult(), { find: () => undefined, hasConfiguredAuth: () => true, getAvailable: () => [] }],
	]
	for (const [name, event, override] of cases) {
		const target = override ? stubSummaries(override, SUMMARY).registry : stub
		const result = await run(event, target)
		check(name, result === undefined, typeof result === "object" ? JSON.stringify(result).slice(0, 80) : "")
	}

	// An oversized summary must be rejected rather than replacing the raw output.
	const { registry: verbose } = stubSummaries(registry, Array.from({ length: 40 }, (_, i) => `- fact number ${i} padded`).join("\n"))
	check("rejects an oversize summary", (await run(toolResult({ content: [{ type: "text", text: "y".repeat(2000) }] }), verbose)) === undefined)
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 8. Replacement shape
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, { config: { ...GOOD_CONFIG, minTokens: 500 } })
	const { registry: stub } = stubSummaries(registry, SUMMARY)
	const result = await ext.events.tool_result(toolResult(), { modelRegistry: stub })
	const text = result?.content?.[0]?.text ?? ""
	check("replacement is text only", result?.content?.length === 1 && result.content[0].type === "text")
	check("replacement names the helper", text.includes("via openrouter/~deepseek/deepseek-flash-latest"), text.split("\n")[0])
	check("replacement archives a retrievable path", /full output: .*\.txt\]/.test(text))
	check("replacement keeps the facts", text.includes("- src/context-diet/index.ts holds the extension"))
	check("replacement reports the saving", /~\d+ -> ~\d+ tokens/.test(text))
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 9. Failure is open
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, {})
	const throwing = {
		...registry,
		streamSimple: () => {
			throw new Error("helper exploded")
		},
	}
	check("a throwing helper leaves output raw", (await ext.events.tool_result(toolResult(), { modelRegistry: throwing })) === undefined)

	const empty = stubSummaries(registry, "I could not find anything useful.").registry
	check("an empty fact list leaves output raw", (await ext.events.tool_result(toolResult(), { modelRegistry: empty })) === undefined)
	await ext.dispose()
}

// ---------------------------------------------------------------------------
// 10. Disabled
// ---------------------------------------------------------------------------

{
	const ext = await withExtension(piPackage, { config: { ...GOOD_CONFIG, enabled: false } })
	const { registry: stub } = stubSummaries(registry, SUMMARY)
	check("disabled compresses nothing", (await ext.events.tool_result(toolResult(), { modelRegistry: stub })) === undefined)
	await ext.dispose()
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`} — ${count - failures}/${count}`)
process.exit(failures === 0 ? 0 : 1)
