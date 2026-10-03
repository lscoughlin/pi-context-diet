# TODO

## Publish

✅ Done — public repo at <https://github.com/lscoughlin/pi-context-diet>, `main`
and tag `v0.1.0` pushed.

⚠️ **npm publish for 0.1.1 is NOT done** — the registry still returns 404. See
[`publish.md`](./publish.md) for the hand-run steps (it needs an interactive 2FA
challenge in a real terminal).

## Install without double-loading

⚠️ **Do not run `pi install` while the global dev copy is still in place.** Both
would register `/context-diet` and share one config file, so the command would
appear twice.

```bash
pi install git:github.com/lscoughlin/pi-context-diet@v0.1.0
```

Retire the stale global copy first — either now, or when you install from git:

```bash
mv ~/.pi/agent/extensions/context-diet ~/.pi/agent/extensions/context-diet.disabled
```

The two copies are not interchangeable: the global one predates the packaging
work (hardcoded config path, `AutocompleteItem` import). The repo is current.

Keeping the global dev copy instead of installing is also fine for local
development — `pi -e .` from the repo loads it without touching settings. Just
pick one.

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
