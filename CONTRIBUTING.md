# Contributing

## Setup

```bash
git clone https://github.com/lscoughlin/pi-context-diet
cd pi-context-diet
npm install
npm test          # offline, no model calls
npm run typecheck
```

`npm install` pulls the `@earendil-works/pi-*` packages as dev dependencies for
typechecking only. Consumers never see them: Pi installs git packages with
`npm install --omit=dev` and deliberately does not install host-provided
`@earendil-works/pi-*` peers. Never move them into `dependencies` — a physical
copy can bypass Pi's extension module mapping and produce duplicate classes.

## Testing against a real Pi

`pi -e <path-to-this-repo>` loads the package for one invocation without
touching settings, which is the fastest loop:

```bash
pi -e . -p "Run this bash command: rg --files /some/large/tree | head -400
Then reply with exactly one line: the first 200 characters of the tool result you received."
```

A compressed result prints `[context-diet: ~N -> ~M tokens via <provider>/<id>; ...]`.
Note that a globally installed copy of this extension is discovered too; disable
it (`mv ~/.pi/agent/extensions/context-diet ~/.pi/agent/extensions/context-diet.disabled`)
if you need to be certain the package under test is the one that loaded.

## Layout

```
src/context-diet/index.ts           the extension (self-contained)
src/context-diet/config.example.json  annotated config, copied to the config dir on demand
test/selftest.mjs                   behavioural checks
test/harness.mjs                    loads the extension the way Pi does
test/fixtures/models-store.json     stand-in for the user's model catalogue
```

`index.ts` is deliberately a single file with no local imports. Pi loads
extensions through jiti as a `data:` module, so `import.meta.dirname` does not
exist — an extension cannot read files beside itself. That is also why config
lives in the Pi config dir (`$PI_CODING_AGENT_DIR/extensions/context-diet/`)
rather than next to the source.

## Adding a guardrail

Guardrails live in the `tool_result` handler and each one should come with a row
in the `cases` table in `test/selftest.mjs`. The invariant is **fail open**: if
anything is uncertain, return `undefined` and let the raw output through. A
summary that is wrong is worse than no summary, because it is plausible enough
to go unreviewed.

## Adding a setting to `/context-diet config`

Add a `SettingSpec` to the `SETTINGS` array (key, blurb, `current` formatter,
`options` builder) and a case to the `switch` in `applySetting`. Keep
`ConfigFile` and `DEFAULTS` in sync. Never write derived values — compiled
regexes, expanded `~` paths — back to the file; `saveConfigFile` only persists
the key it is handed, and there is a test asserting that.

## Releasing

1. Bump `version` in `package.json`.
2. Commit, then tag: `git tag -a v0.1.0 -m "v0.1.0" && git push origin main --tags`.
3. Users pin with `pi install git:github.com/lscoughlin/pi-context-diet@v0.1.0`.

Nothing is published to npm; the package is consumed straight from git.
