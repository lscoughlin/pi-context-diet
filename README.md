# pi-context-diet

A [Pi](https://pi.dev) extension that keeps long sessions workable.

Large *discovery* tool outputs — search hits, logs, MCP results — are archived to
disk and replaced in the transcript by a short fact list written by a cheaper
model, with a pointer to the full text. Exact reads, small outputs, failures, and
anything that looks like a credential pass through untouched.

```text
[context-diet: ~8205 -> ~229 tokens via openrouter/~deepseek/deepseek-flash-latest;
 full output: ~/.cache/pi-context-diet/raw/373a827986f8e3ae.txt]
- 412 .d.ts files under dist/themes; no matches under dist/core/plugins
- ToolResultEvent exposes toolName, input, content, isError, parentToolCallId
```

This is a Pi port of the `PostToolUse` technique in
["Claude Context Diet"](https://claude.ai/artifact/9Ud9iisBP4AzuxbKbcjDyw)
([archived copy](claude-context-diet.md), in case the artifact expires). Same
policy and guardrails, expressed as Pi's `tool_result` hook instead of a
`settings.json` hook chain.

## Install

```bash
pi install git:github.com/lscoughlin/pi-context-diet
```

Pin a release if you prefer: `pi install git:github.com/lscoughlin/pi-context-diet@v0.1.0`.
To try it for one invocation without touching settings:

```bash
pi -e git:github.com/lscoughlin/pi-context-diet
```

Restart Pi afterwards. The extension loads and registers `/context-diet` at
startup.

## Use

| | |
| --- | --- |
| `/context-diet` | status: active helper, model chain, thresholds, this session's savings |
| `/context-diet config` | interactive menu for `enabled`, `helperModels`, `minTokens`, `maxSummaryTokens`, `minSaving` |

`/context-diet config` needs an interactive session — Pi's `ui.select` is a no-op
under `pi -p`, so scripted runs silently skip the menu. `status` works everywhere.

## Configure

The extension works with no configuration. The first run reports built-in
defaults; the first change through `/context-diet config` writes
`$PI_CODING_AGENT_DIR/extensions/context-diet/config.json` (default
`~/.pi/agent/extensions/context-diet/config.json`). To edit it by hand, copy
[`src/context-diet/config.example.json`](src/context-diet/config.example.json)
there first — the `//`-prefixed keys document each field.

The file is read **once at startup**, so hand edits need a restart. Menu edits
apply immediately.

| key | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | master switch |
| `minTokens` | `3500` | outputs at or below this stay raw |
| `maxSourceChars` | `200000` | larger outputs stay raw, capping helper cost |
| `maxSummaryTokens` | `1800` | a longer replacement is rejected — a bad summary is worse than the raw text |
| `minSaving` | `0.3` | reject a replacement that isn't at least this much smaller |
| `helperTimeoutMs` | `90000` | wall-clock budget for the helper call |
| `helperModels` | four cheap DeepSeek/GLM/Luna ids | `[provider, modelId]` pairs, cheapest-first; first one with credentials wins |
| `exemptTools` | `read`, `edit`, `write`, `powershell` | never compressed |
| `bashAllow` | `rg`/`grep`/`find`/test/log commands | bash is eligible only if it matches, exits 0, and prints nothing on stderr |
| `secret` | api-key/password/bearer/private-key | matches in the output **or** the arguments leave the result raw |
| `archiveDir` | `~/.cache/pi-context-diet/raw` | where full outputs go; `~` is expanded |

MCP tools are eligible by default — in the original's measurements they were the
large majority of compressed tokens. Add a tool name to `exemptTools` to opt it
out.

### Choosing a helper model

`/context-diet status` prints every configured entry with its resolve status, so
a typo is visible rather than silently skipped:

```text
helper in use: openrouter/~deepseek/deepseek-flash-latest
model chain (first with credentials wins):
  1. openrouter/~deepseek/deepseek-flash-latest  ok ($0.0243/Mtok in)
  2. openrouter/~deepseek/does-not-exist         MISSING (no such model id)
  3. openrouter/~z-ai/glm-flash-latest           ok ($0.02/Mtok in)
```

Model ids must match `~/.pi/agent/models-store.json` exactly, including any `~`
prefix. A fast, cheap model is the right choice: the helper only summarises text
it is handed. It must be *accurate* above all — a model that invents file names
is worse than no compression, because a plausible summary is not reviewable the
way raw output is. The default chain was picked with that in mind; a strong model
costs roughly 80× more per input token and is not usually worth it here.

## Uninstall

```bash
pi remove git:github.com/lscoughlin/pi-context-diet
```

Archives under `~/.cache/pi-context-diet/` are left behind; delete them manually.
To just switch it off, set `enabled` to `false` via `/context-diet config`.

## How it behaves

- **Fails open.** Any error, timeout, unparseable answer, or oversize summary
  leaves the original result in place. The extension never blocks a tool.
- **Never touches what you'd edit.** `read`, `edit`, and `write` results stay
  byte-exact, since the model needs them to make changes.
- **Bash is narrow by default.** Only successful, stderr-free discovery commands
  qualify. A failing test run is a signal, not noise, so it stays raw.
- **Credentials are checked twice** — against the output and against the tool
  arguments, since a secret can arrive on a command line without appearing in
  the result.
- **Nested calls are skipped.** Sub-results from codemode scripts are left alone.
- **Summaries are adversarial input.** The helper prompt treats tool output as
  untrusted data and bounds itself to 1–6 facts and 0–3 unknowns.

## Develop

```bash
npm install
npm test          # 20 offline behavioural checks, no model calls
npm run typecheck
```

`test/selftest.mjs` loads the extension through jiti with the same module
aliases Pi uses, drives the command and the `tool_result` hook against a fake
model registry, and asserts the guardrails — comment keys surviving a config
save, derived values not leaking to disk, the helper reorder keeping fallbacks,
and credential-bearing argv being left raw.

## Cost, honestly

The technique trades helper tokens for context occupancy. A compressed tool
result is re-read on every subsequent turn, so the saving compounds — a
12,000-token blob becomes a ~380-token stub and stays that way. The original's
7-day ledger measured **−89.9%** of tool-output tokens in the main context.

Dollar savings, though, depend on the gap between your main model and the helper.
If you run an expensive main model, this is close to free money. If you already
run a cheap model, the win is **working room and longevity**, not the bill: less
compaction churn, fewer truncated contexts, more turns before a session degrades.

## Credits

Technique and policy from "Claude Context Diet". This port differs from the
original in one structural way: Pi exposes tool results through an extension
`tool_result` hook, which can replace what the model reads, whereas Pi's YAML
hook system (`tool.after.*`) explicitly cannot modify a completed tool's output.

## License

MIT
