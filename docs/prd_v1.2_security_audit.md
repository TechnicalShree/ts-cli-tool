# auto-fix PRD Security and Critical Issues Audit

Date: 2026-02-22
Scope: Critical vulnerabilities, high-risk bugs, and end-user command safety issues in current implementation.
Last verification run: 2026-02-22 11:28 IST (fresh build + full retest, latest)

## Executive summary

- Critical vulnerabilities remaining: 0
- High severity issues remaining: 0
- Findings resolved since initial audit: 7 of 7
- Release recommendation: All tracked findings are resolved based on latest retest.

## Findings matrix

| ID | Severity | Title | Affected command(s) | Status |
|---|---|---|---|---|
| SEC-001 | Critical | Shell command injection from repo-controlled inputs | `run`, default command, `plan` (when later executed), any step execution | Resolved |
| SEC-002 | Critical | `undo` path traversal and arbitrary file overwrite | `undo` | Resolved |
| REL-001 | High | Unknown command token falls back to full `run` | Any typo command (for example `repot`) | Resolved |
| REL-002 | High | VS Code settings clobber on JSONC parse failure | `run --focus python`, default command | Resolved |
| REL-003 | High | Unquoted paths break commands in folders with spaces | `run`, default command | Resolved |
| REL-004 | High | Config-driven command injection via `.autofix.yml` command strings | `run`, default command | Resolved |
| REL-005 | Medium | Irrelevant Docker warning in non-Docker projects | `run`, `plan`, default command | Resolved |

## Re-test results (2026-02-22)

- `SEC-001`: Resolved.
  - `.env` sync now quotes paths and sanitizes keys: `src/subsystems/environment.ts:51`, `src/subsystems/environment.ts:63`
  - `node.package_manager` is now allowlisted to `npm|pnpm|yarn`: `src/subsystems/node.ts:3`, `src/subsystems/node.ts:8`
  - Repro statuses:
    - `SEC001_ENV_RUNTIME=OK`
    - `SEC001_PM_INJECTION=OK`
- `SEC-002`: Resolved.
  - Path containment check now blocks restore outside project root: `src/core/undo.ts:43` to `src/core/undo.ts:47`
  - Repro status: `SEC002_UNDO_TRAVERSAL=OK`
- `REL-001`: Resolved.
  - Unknown command now exits non-zero with explicit error: `src/cli.ts:96` to `src/cli.ts:99`
  - Repro status: `REL001_UNKNOWN_COMMAND=OK`
- `REL-002`: Resolved.
  - VS Code sync skips write when existing settings file is not strict JSON (preserves JSONC): `src/subsystems/python.ts:84`
  - Repro status: `REL002_JSONC_CLOBBER=OK`
- `REL-003`: Resolved (verified for env sync path handling).
  - Env copy now shell-quotes paths: `src/subsystems/environment.ts:51`
  - Repro status: `REL003_SPACE_PATH=OK`
- `REL-004`: Resolved.
  - Config-level sanitization strips unsafe command/path entries at load time:
    - Character allowlist: `src/config/loadConfig.ts:40` (`SAFE_CHARS_RE`)
    - Known binary allowlist: `src/config/loadConfig.ts:43` to `src/config/loadConfig.ts:51` (`KNOWN_TOOL_BINARIES`)
    - Combined validator: `src/config/loadConfig.ts:53` to `src/config/loadConfig.ts:57` (`isSafeConfigCommand`)
    - Sanitize at load: `src/config/loadConfig.ts:63` to `src/config/loadConfig.ts:74` (`sanitizeConfig`)
  - Check-level validation now uses a strict command allowlist before execution:
    - `src/subsystems/checks.ts:60` to `src/subsystems/checks.ts:75` (`KNOWN_TOOL_BINARIES`)
    - `src/subsystems/checks.ts:83` to `src/subsystems/checks.ts:98` (`isSafeCommand`)
  - Repro status after fresh build: `REL004_CONFIG_INJECTION=OK`
- `REL-005`: Resolved.
  - Docker warning now gated on detected Docker environment: `src/core/run.ts:110`
  - Repro status: `REL005_DOCKER_WARNING=OK`

Note:
- The detailed sections below describe the original findings from the initial audit pass.
- Use the matrix and re-test section above as the source of truth for current status.

## Detailed findings

### SEC-001 (Critical): Shell command injection from repo-controlled inputs

Risk:
- The app executes shell command strings with `exec`, and multiple command templates interpolate untrusted project data.

Code evidence:
- `src/utils/process.ts:11` to `src/utils/process.ts:14`
- `src/subsystems/environment.ts:56`
- `src/subsystems/node.ts:106`
- `src/subsystems/python.ts:80`

Observed repro evidence:
- Malicious key in `.env.example` executed an injected `touch /tmp/autofix-injection-marker`.
- Malicious cache directory in `.autofix.yml` executed `touch /tmp/autofix-config-marker`.

User impact:
- Running `auto-fix` in an untrusted repository can execute arbitrary commands on the user machine.

### SEC-002 (Critical): `undo` path traversal and arbitrary file overwrite

Risk:
- `undo` reconstructs restore targets from snapshot filenames without containment validation to the project root.

Code evidence:
- `src/core/undo.ts:39`
- `src/core/undo.ts:41`

Observed repro evidence:
- A crafted `latest.json` with snapshot path `.._.._tmp_autofix-undo-traversal-target` caused `auto-fix undo` to write `/tmp/autofix-undo-traversal-target`.

User impact:
- If report/snapshot paths are tampered, `undo` can overwrite arbitrary user-writable files outside the project directory.

### REL-001 (High): Unknown command typo executes full run

Risk:
- Unknown first token is treated as `"run"` rather than rejected.

Code evidence:
- `src/cli.ts:87` to `src/cli.ts:97`

Observed repro evidence:
- `auto-fix repot --quiet --no-color --json` executed full run workflow.

User impact:
- Simple typos can trigger unintentional fixes and filesystem changes.

### REL-002 (High): VS Code settings clobber when `settings.json` is JSONC

Risk:
- Settings file is parsed with `JSON.parse`; parse failures are replaced with empty object and rewritten.

Code evidence:
- `src/subsystems/python.ts:80`

Observed repro evidence:
- Existing `.vscode/settings.json` with comments was rewritten to only:
  - `"python.defaultInterpreterPath": ".venv"`

User impact:
- Existing editor configuration is silently lost.

### REL-003 (High): Command failures in paths with spaces/special characters

Risk:
- Absolute paths are interpolated into shell commands without quoting.

Code evidence:
- `src/subsystems/environment.ts:44`
- `src/subsystems/environment.ts:56`

Observed repro evidence:
- Project path `/tmp/autofix space...` caused env copy failure:
  - `cp: ... Not a directory`

User impact:
- Legitimate workspace paths produce false failures and partial runs.

### REL-004 (High): Config-driven command injection from `.autofix.yml`

Risk:
- Values from `.autofix.yml` are merged and used directly as shell command fragments.

Code evidence (original vulnerable locations):
- `src/config/loadConfig.ts:44` (mergeDeep without sanitization)
- `src/subsystems/node.ts:104` to `src/subsystems/node.ts:133` (cache dir interpolation)
- `src/subsystems/checks.ts:100` to `src/subsystems/checks.ts:208` (python tool command execution)

Fix locations:
- `src/config/loadConfig.ts:40-74` (SAFE_CHARS_RE, KNOWN_TOOL_BINARIES, isSafeConfigCommand, sanitizeConfig)
- `src/subsystems/checks.ts:60-98` (KNOWN_TOOL_BINARIES, isSafeCommand — defense-in-depth at execution layer)
- `src/subsystems/node.ts:105` (isSafePath gate on cache dirs)

Observed repro evidence:
- Cache dir entry `boom; touch /tmp/autofix-config-marker` executed the injected `touch` command.

User impact:
- Malicious repository config can run arbitrary commands when user runs `auto-fix`.

### REL-005 (Medium): Irrelevant Docker warning for non-Docker project runs

Risk:
- Warning logic checks `config.docker.safe_down` and presence of test steps, but not docker detection.

Code evidence:
- `src/core/run.ts:110` to `src/core/run.ts:112`

User impact:
- Users get confusing remediation guidance unrelated to detected stack.

## Command impact view

- `auto-fix` / `auto-fix run`
  - Exposed to SEC-001, REL-002, REL-003, REL-004, REL-005.
- `auto-fix undo`
  - Exposed to SEC-002.
- `auto-fix <typo>`
  - Exposed to REL-001.

## Recommended fix priority

1. P0: Replace shell-string execution with argument-safe process spawning and strict escaping/sanitization for all user/project-derived values.
2. P0: Harden `undo` target path resolution with canonicalization and strict `cwd` containment checks.
3. P1: Make unknown commands fail with explicit usage error and non-zero exit code.
4. P1: Preserve VS Code JSONC by using a JSONC parser/editor or no-op when parsing fails with warning.
5. P1: Quote or avoid shell interpolation for filesystem paths.
6. P2: Gate Docker warning on docker detection signal.

## Validation performed

- Sync step before tests: `npm run build --silent` completed successfully.
- Latest automated run: `npm test --silent` passed (`20` tests, `20` pass, `0` fail).
- Security/unit tests currently pass, including `test/security.test.mjs`.
- Targeted local repro statuses from latest verification:
  - `SEC001_ENV_RUNTIME=OK`
  - `SEC001_PM_INJECTION=OK`
  - `SEC002_UNDO_TRAVERSAL=OK`
  - `REL001_UNKNOWN_COMMAND=OK`
  - `REL002_JSONC_CLOBBER=OK`
  - `REL003_SPACE_PATH=OK`
  - `REL004_CONFIG_INJECTION=OK`
  - `REL005_DOCKER_WARNING=OK`
