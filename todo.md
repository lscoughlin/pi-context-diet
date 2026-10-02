# TODO

## Publish

No git remote exists yet — the repo is committed locally at `a9296f7` with tag
`v0.1.0`, but nothing has been pushed.

```bash
cd ~/Source/lscoughlin/pi-context-diet
git remote add origin git@github.com:lscoughlin/pi-context-diet.git
git push -u origin main --tags
```

The `v0.1.0` tag already exists locally, so `--tags` ships the pin that the
install command below references.

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
