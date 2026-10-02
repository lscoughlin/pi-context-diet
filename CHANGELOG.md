# Changelog

Notable changes, newest first. This project follows [Semantic Versioning](https://semver.org).

## 0.1.0

Initial release.

- `tool_result` hook archives large discovery outputs to
  `~/.cache/pi-context-diet/raw/` and replaces them in the transcript with a
  cheaper model's fact list plus a pointer to the full text.
- Exempts `read`, `edit`, `write`, and `powershell`; leaves failures, images,
  small outputs, nested codemode results, and anything matching the credential
  pattern (checked against the output *and* the arguments) untouched. Every
  error path fails open.
- `/context-diet` prints status: the active helper, every configured chain entry
  with its resolve status and price, thresholds, and session savings.
- `/context-diet config` opens an interactive menu over `enabled`,
  `helperModels`, `minTokens`, `maxSummaryTokens`, and `minSaving`. Picking a
  helper moves it to the front rather than deleting the others.
- Config resolves from `$PI_CODING_AGENT_DIR/extensions/context-diet/config.json`,
  falling back to built-in defaults when absent. A config file is never required
  to use the extension.
- 49 offline behavioural checks (`npm test`).
