# PRD v1.2 Implementation Audit

Date: 2026-02-21
Source PRD: `docs/prd_v1.2.md`

## Scope and method
- Reviewed implementation in `src/` against each requirement in `docs/prd_v1.2.md`.
- Ran existing test suite (`npm test`) to confirm baseline health.
- Ran targeted local fixture checks in `/tmp` to verify runtime behavior for env sync, engine checks, VS Code sync, and undo.

## Requirement coverage

| PRD Requirement | Status | Evidence |
|---|---|---|
| 2.1 Missing `.env` should auto-copy from `.env.example` | Implemented | `src/subsystems/environment.ts:37` to `src/subsystems/environment.ts:51` |
| 2.1 Sync missing keys from `.env.example` into `.env` | Implemented | `src/subsystems/environment.ts:53` to `src/subsystems/environment.ts:70` |
| 2.2 Node version mismatch should be `proposed` with warning/action | Mostly implemented | `src/subsystems/engines.ts:17` to `src/subsystems/engines.ts:35` |
| 2.2 Python version mismatch should warn (not hard-fail) | Not implemented as specified | Implemented as executable `planned` command that can fail: `src/subsystems/engines.ts:40` to `src/subsystems/engines.ts:54` |
| 2.2 Run engine checks before dependency installs | Implemented | Plan order: `src/core/planBuilder.ts:32` to `src/core/planBuilder.ts:39` |
| 2.3 VS Code interpreter auto-config when `.venv` exists/created | Partially implemented | Step exists: `src/subsystems/python.ts:69` to `src/subsystems/python.ts:85`; but condition is broader than PRD |
| 2.3 Snapshot `.vscode/settings.json` before mutation | Not implemented at runtime | Snapshot only occurs for destructive steps in executor: `src/core/executor.ts:96` to `src/core/executor.ts:99` |
| 2.4 Catch `EPERM`/`EBUSY` in node dependency tasks with specific guidance | Not implemented | No EPERM-specific handling in executor (`src/core/executor.ts:101` to `src/core/executor.ts:134`); only rationale text in node step (`src/subsystems/node.ts:120`) |
| 3 Execution order additions (`env -> engines -> ports -> docker ...`) | Implemented | `src/core/planBuilder.ts:32` to `src/core/planBuilder.ts:39` |
| 4 Snapshot `.env` before mutation | Not implemented at runtime | `.env` listed on step (`src/subsystems/environment.ts:67`) but not snapshotted due executor rule (`src/core/executor.ts:96`) |

## Potential issues (severity ordered)

### 1) High: Snapshot requirements in PRD v1.2 are not actually enforced
- PRD requires backing up `.env` and `.vscode/settings.json` before mutation.
- Current executor only snapshots when `step.destructive === true`.
- Both env sync and VS Code sync steps are non-destructive, so no snapshot is taken.
- References:
  - `src/core/executor.ts:96` to `src/core/executor.ts:99`
  - `src/subsystems/environment.ts:67`
  - `src/subsystems/python.ts:82`

Impact:
- Undo coverage is overstated in reports for these steps.
- Recovery path for modified `.env` and `.vscode/settings.json` is unreliable.

### 2) High: Undo can restore to wrong target path for `.vscode/settings.json`
- When no real snapshot path is produced, `undo` consumes step-declared paths directly.
- For `.vscode/settings.json`, undo resolves target using `path.basename`, which becomes `settings.json` in repo root.
- References:
  - `src/core/undo.ts:37` to `src/core/undo.ts:40`
  - `src/subsystems/python.ts:82`

Observed behavior (fixture repro):
- Running `undo` created an unintended root-level `settings.json` file and reported partial failure.

### 3) High: Python engine mismatch is executed as a failing command, not a warning/proposed action
- PRD asks for a mismatch warning.
- Current implementation adds a `planned` command that fails hard when mismatch occurs, with generic error text.
- References:
  - `src/subsystems/engines.ts:43` to `src/subsystems/engines.ts:54`
  - `src/core/executor.ts:131` to `src/core/executor.ts:133`

Observed behavior (fixture repro):
- `.python-version=3.99` produced step status `failed` with error `"One or more commands failed"` rather than `proposed`.

### 4) Medium: Engine checks are skipped unless project type is detected
- Node check requires `detection.node.detected`.
- Python check requires `detection.python.detected`.
- PRD wording is keyed off version files existing (`.nvmrc`, `.node-version`, `.python-version`), not project autodetection.
- References:
  - `src/subsystems/engines.ts:17`
  - `src/subsystems/engines.ts:40`
  - `src/core/detectEnvironment.ts:84` to `src/core/detectEnvironment.ts:91`

Impact:
- Repos with version files but minimal project markers may skip required checks.

### 5) Medium: VS Code sync step runs for all detected Python projects, even if `.venv` does not exist yet
- PRD condition: run when `.venv` exists or is created.
- Current logic always appends VS Code sync for Python projects.
- References:
  - `src/subsystems/python.ts:19`
  - `src/subsystems/python.ts:69` to `src/subsystems/python.ts:85`

Impact:
- Interpreter path may be forced to `.venv` even when venv creation fails.

### 6) Medium: EPERM/EBUSY remediation is not implemented beyond static rationale text
- PRD MVP asks for explicit EPERM handling and user guidance during node dependency failures.
- Current executor emits generic failure; no branch inspects EPERM/EBUSY.
- References:
  - `src/core/executor.ts:131` to `src/core/executor.ts:133`
  - `src/subsystems/node.ts:120`

Impact:
- User receives generic failure instead of actionable lock-specific guidance.

### 7) Low: Missing test coverage for v1.2 features
- Test suite has one smoke test only; no tests for env sync, engine mismatch semantics, VS Code sync, or snapshot/undo behavior.
- Reference:
  - `test/smoke.test.mjs:1` to `test/smoke.test.mjs:10`

Impact:
- Regressions in v1.2 behaviors are likely to slip through.

## Validation notes
- `npm test` passed (single smoke test).
- Fixture runs confirmed:
  - Env append step and VS Code sync step appear in plan/run.
  - Python mismatch currently fails step instead of warning/proposed.
  - Undo created unintended root `settings.json` when processing `.vscode/settings.json`.
