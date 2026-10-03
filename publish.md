# Publishing `@lscoughlin/pi-context-diet` by hand

Repo: `/Users/liamcoughlin/Source/lscoughlin/pi-context-diet`
Current version: `0.1.1`

**Status: published.** `npm view @lscoughlin/pi-context-diet version dist-tags`
returns `0.1.1` / `latest: 0.1.1`, and the package is installed on this machine
via `pi install npm:@lscoughlin/pi-context-diet`. What follows is retained as a
record of the hand-run 2FA flow for the next release.

---

## 1. Sanity-check your npm session

```bash
npm whoami
```

- `lscoughlin` → session valid, continue.
- `E401` / `ENEEDAUTH` → the session expired, log in again:

  ```bash
  npm login --auth-type=web
  ```

Your account is `tfa.mode: "auth-and-writes"`, so publishing requires an
interactive 2FA challenge. That is by design, not a bug.

## 2. Publish

**Run this in a real Terminal.app / iTerm window — not inside `pi`, and not
piped or redirected.** npm only surfaces the auth URL when stdin *and* stdout
are both TTYs (`/opt/homebrew/lib/node_modules/npm/lib/utils/auth.js:14`).
Under a pipe you get a bare `EOTP` with no link, which is the dead end the
earlier attempt hit.

```bash
cd /Users/liamcoughlin/Source/lscoughlin/pi-context-diet
npm publish --access public
```

Expected output:

```
Authenticate your account at:
https://www.npmjs.com/auth/cli/<uuid>
Press ENTER to open in the browser...
```

Press **ENTER** — or copy that URL into a browser already signed in to
npmjs.com — then approve with your security key.

Notes:

- The URL is a **one-shot, short-lived** link. If it expires, re-run the
  publish command to mint a fresh one.
- `--access public` is required for a scoped package; the same intent is
  already recorded in `package.json` as `publishConfig.access: "public"`.

## 3. Verify

```bash
npm view @lscoughlin/pi-context-diet version dist-tags
```

Expect `0.1.1`. To confirm against the registry directly:

```bash
curl -s https://registry.npmjs.org/@lscoughlin/pi-context-diet | head -c 200
```

## 4. Install locally (done — kept for reference)

`~/.pi/agent/extensions/context-diet` now contains only `config.json`; the code
comes from the package. The old dev copy lives at
`~/.pi/agent/context-diet.dev-copy` — note it is parked **outside** the
extensions tree, because Pi auto-discovers any non-dot-prefixed directory
there and would otherwise register `/context-diet` a second time.

```bash
# one-time switch (already performed)
mv ~/.pi/agent/extensions/context-diet ~/.pi/agent/context-diet.dev-copy
mkdir -p ~/.pi/agent/extensions/context-diet
cp <saved config.json> ~/.pi/agent/extensions/context-diet/config.json
pi install npm:@lscoughlin/pi-context-diet
```

Then **restart `pi`** — extension discovery happens at startup only.

If a later version is published, refresh with:

```bash
pi install npm:@lscoughlin/pi-context-diet@<version>
```

---

## Background

- **`npm login` never prints a token.** Since Dec 2025 it issues a ~2-hour
  session token, deliberately omitted from the web UI and from
  `npm token list` (which therefore returns `[]`). The `npm_…` string in
  `~/.npmrc` *is* that session token. Nothing is missing.
- **Why the earlier attempt failed.** `npm publish` returned `PUT 401 EOTP`
  ("one-time password required") and, running without a TTY, could not prompt
  for it — it just exited with a `***`-redacted auth URL in the log.
- **Every publish will hit this 2FA flow** while the account is
  `auth-and-writes`. For hands-off publishing later:
  - **Trusted publishing (OIDC)** — the durable answer; token-free, and works
    with the existing `.github/workflows/ci.yml`. Requires a publish workflow
    plus a trusted-publisher config on npmjs.com.
  - **Bypass-2FA granular token** — `npm token create --bypass-2fa`, but npm
    is deprecating direct publish for these (targeted Jan 2027), so it is a
    stopgap.
- **Package contents** (5 files, 11.3 kB packed): `LICENSE`, `README.md`,
  `package.json`, `src/context-diet/config.example.json`,
  `src/context-diet/index.ts`.

## Checklist

- [x] `npm whoami` returns `lscoughlin`
- [x] `npm publish --access public` run in a real terminal, 2FA approved
- [x] `npm view @lscoughlin/pi-context-diet version` prints `0.1.1`
- [x] dev copy retired to `~/.pi/agent/context-diet.dev-copy` (outside discovery)
- [x] `pi install npm:@lscoughlin/pi-context-diet` run; `pi list` shows one entry
- [ ] `pi` restarted
