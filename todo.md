# TODO

## Publish

✅ Done — public repo at <https://github.com/lscoughlin/pi-context-diet>, `main`
and tag `v0.1.0` pushed.

✅ Done — `@lscoughlin/pi-context-diet@0.1.1` is live (`npm view … version` →
`0.1.1`). `publish.md` is kept only as a record of the 2FA flow.

## Install without double-loading

✅ Done — installed from the registry, dev copy retired. See the section below.

⚠️ **Never name the retired copy `context-diet.disabled`.** Pi's auto-discovery
treats *any* non-dot-prefixed directory under `~/.pi/agent/extensions/` as an
extension and only skips dot-prefixed entries — the `.disabled` suffix is
ignored, so it would load alongside the package and register `/context-diet`
twice. Park it outside the extensions tree instead (as done in the install
section below).

The two copies are not interchangeable: the global one predates the packaging
work (hardcoded config path, `AutocompleteItem` import). The published package
is current.

Keeping a dev copy instead of installing is also fine for local development —
`pi -e .` from the repo loads it without touching settings. Just pick one.

## Installed from the registry

Done on this machine:

```bash
# 1. preserve the live config (custom thresholds + helperModels)
cp ~/.pi/agent/extensions/context-diet/config.json ~/.pi/agent/context-diet.config.json.bak

# 2. retire the dev copy — MUST leave the extensions tree
mv ~/.pi/agent/extensions/context-diet ~/.pi/agent/context-diet.dev-copy

# 3. re-create the config dir and restore config.json
mkdir -p ~/.pi/agent/extensions/context-diet
cp ~/.pi/agent/context-diet.config.json.bak ~/.pi/agent/extensions/context-diet/config.json

# 4. install
pi install npm:@lscoughlin/pi-context-diet
```

The package reads its config from the hardcoded path
`~/.pi/agent/extensions/context-diet/config.json` (overridable via
`PI_CODING_AGENT_DIR`), so step 3 keeps the existing customisations across the
switch. `pi install` writes the declaration to `~/.pi/agent/settings.json` and
puts the code in `~/.pi/agent/npm/node_modules/@lscoughlin/pi-context-diet`.

Verify:

```bash
pi list | grep context-diet   # one entry, path under npm/node_modules
ls ~/.pi/agent/extensions/    # must contain NO .ts/.js, only config.json
```

To upgrade later: `pi install npm:@lscoughlin/pi-context-diet@<version>`.

## Restart

Extension discovery happens at `pi` startup, so nothing takes effect until you
restart — including the new `/context-diet config` subcommand.

## Known limitations

- `/context-diet config` needs an interactive session; `ctx.ui.select` is a
  no-op under `pi -p`. `/context-diet` (status) works everywhere.
- Config is read once at startup, so hand edits to `config.json` also need a
  restart. Menu edits apply immediately.
- Dollar savings are modest on this machine — the default main model and the
  helper are the same tier. The win is context longevity and per-re-read
  economies, not cost.

## Not done

- `pi.image` was removed from `package.json` because `docs/context-diet.png`
  does not exist. Re-add both together if a demo image is ever made.
