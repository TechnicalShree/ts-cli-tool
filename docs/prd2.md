# Patch: Critical clarifications & refinements (v1.1)

> This patch updates requirements to address undo scope, port kill race conditions, check ordering, polyglot behavior, snapshot robustness, `.gitignore` hygiene, and lockfile corruption handling.

---

## 3.5 Undo / Rollback (UPDATED: explicit scope + irreversible warnings)

### 3.5.1 Undo scope (explicit)

`auto-fix undo` is **NOT** a system restore. Undo is limited to artifacts that auto-fix explicitly snapshots.

Undo covers (best-effort):

- Restoring **text/config** files that auto-fix modified _and_ backed up (e.g., `.env.example`, CI config, small YAML/JSON, selected lockfiles if touched).
- Restoring deleted/modified **known cache/build dirs** only when snapshotting is enabled and feasible.
- Reverting auto-fix–generated files under `.autofix/` (reports, metadata).

Undo does NOT cover (must be explicitly stated in output):

- External environment state:
  - package manager global caches
  - `npm/pnpm/yarn` store state
  - Python wheel caches
- Docker/Compose external state:
  - container network changes
  - images built/pulled
  - volumes content changes unless explicitly snapshotted (MVP: NOT snapshotted)
- Any action executed by external commands that mutate state in non-reversible ways

### 3.5.2 Irreversible action warnings (MUST)

If a planned step is **not undoable**, auto-fix MUST show:

- A clear label: `IRREVERSIBLE`
- A one-line reason: “cannot be snapshotted”
- A user-facing warning: “This will NOT be covered by undo.”

Examples that MUST be labeled `IRREVERSIBLE`:

- `docker system prune`, `docker volume rm`, `docker builder prune`
- deleting lockfiles (when forced)
- removing `.venv` (deep mode)
- deleting large folders that are not snapshotted (e.g., `node_modules/`)

### 3.5.3 Undo result guarantees (MUST)

`auto-fix undo` MUST:

- Never fail silently
- Report per-item restore status:
  - restored / skipped / missing snapshot / failed
- Provide next best action for any non-restored item (e.g., “Run `pnpm install` to regenerate node_modules”)

---

## 4) Global Flags (UPDATED: add --force-fresh)

Add:

- `--force-fresh` : allows “fresh rebuild” actions **only when combined with `--deep` or `--approve`**.
  - Example usage:
    - `--force-fresh` + `--deep` may remove corrupted lockfile and regenerate.
  - Must be gated and labeled as IRREVERSIBLE.

---

## 8.1 Port already in use (UPDATED: retry/poll loop)

### 8.1.1 Port release polling (MUST)

After killing PID(s) for a port, auto-fix MUST:

- Poll the port until it is actually free
- Default polling window: up to **2000ms**, interval **100ms**
- Only mark step as `success` when the port is confirmed free

If still in use after timeout:

- Mark step as `failed` (or `partial`) with details:
  - remaining PID(s)
  - suggested manual command
- Continue run unless `--strict` is introduced later

### 8.1.2 Optional cooldown (SHOULD)

After a confirmed release, auto-fix SHOULD wait an additional **100–200ms** cooldown before starting dependent steps.

---

## 8.6 Lint/test/format mismatch (UPDATED: strict execution order)

### 8.6.1 Strict execution order (MUST)

auto-fix MUST execute steps in the following order unless user overrides with explicit flags:

1. **Environment fixes**
   - port cleanup (if enabled)
   - docker compose stabilization (safe down/up decisions)
2. **Dependency fixes**
   - node install strategy
   - python env + install strategy
3. **Formatting**
4. **Linting**
5. **Testing**

Rationale:

- formatting before lint reduces noise
- testing last avoids false negatives due to missing deps/env

### 8.6.2 Docker dependency awareness (SHOULD)

If `docker.safe_down=true` and tests are requested:

- auto-fix SHOULD ensure required services are running before tests
- If unsure, it MUST warn:
  “Tests may require services; run `docker compose up -d` and re-run tests.”

---

## 9) Project Detection & Polyglot Strategy (UPDATED: ghost environment + resource safety)

### 9.4 Polyglot execution strategy (MUST: series)

In repositories with multiple subsystems (Node + Python + Docker), auto-fix MUST:

- Execute subsystems **in series**, not parallel (default)
- Keep logs readable with clear phase boundaries:
  - `[phase:detect]`, `[phase:ports]`, `[phase:docker]`, `[phase:node]`, `[phase:python]`, `[phase:checks]`

### 9.5 Ghost environment guardrails (MUST)

If multiple subsystems are detected, auto-fix MUST:

- Print detected subsystems and planned scope
- If running “all” would be heavy, it SHOULD propose a scope:
  - “Detected Node + Python + Docker. Run all? (Y/n)”
  - Non-interactive: default to safe minimal set (ports + caches only) unless `--approve`.

### 9.6 Resource safety limits (SHOULD)

auto-fix SHOULD implement soft limits:

- Avoid deep cleanup of multiple ecosystems in one run unless `--approve`
- Avoid docker rebuild + node reinstall + python reinstall together unless explicitly requested

---

## 12) Snapshot Logic & `.autofix` hygiene (UPDATED: robustness + gitignore)

### 12.0 `.autofix` directory robustness (MUST)

auto-fix MUST tolerate `.autofix/` being problematic:

- If `.autofix/` is not writable (permissions, read-only FS):
  - fall back to OS temp directory (e.g., `/tmp/autofix/<run_id>`)
  - warn user that local snapshots are disabled for this run
  - still print summary and exit codes correctly

### 12.1 Auto `.gitignore` entry (MUST)

On first successful run within a git repo:

- auto-fix MUST ensure `.autofix/` is in `.gitignore`
- If `.gitignore` does not exist, create it
- If repo is not git, skip silently

Output example:

- “Added `.autofix/` to .gitignore (to prevent committing reports/snapshots).”

### 12.2 Snapshot size policy (MUST)

Snapshots MUST NOT store large folders by default:

- `node_modules/` is **never snapshotted** in MVP
- Docker volumes are **never snapshotted** in MVP

Instead, record “deletion event” in report with regeneration steps.

---

## 5.1 Lockfile safety (UPDATED: drift vs corruption handling)

### 5.1.1 Lockfile drift (existing behavior)

- auto-fix MUST NOT delete lockfiles in safe mode.
- In safe mode, choose install commands that respect lockfile integrity (`npm ci`, `pnpm --frozen-lockfile` when appropriate).

### 5.1.2 Lockfile corruption detection (MUST)

auto-fix MUST detect “corruption” separately from “drift”.
Examples:

- JSON parse error in `package-lock.json`
- YAML parse/format error (if applicable)
- `pnpm-lock.yaml` invalid format
- Tool-reported lockfile invalidation

When corruption is detected:

- auto-fix MUST NOT proceed with “frozen” install strategies that will always fail
- It MUST propose a recovery step:
  - “Lockfile appears corrupted; recommend fresh regeneration.”

### 5.1.3 Corruption recovery gate (MUST)

Lockfile deletion/regeneration is allowed ONLY when:

- `--force-fresh` AND (`--deep` OR `--approve`) are provided

And MUST:

- Label step as `IRREVERSIBLE`
- Warn: “Undo will not restore the lockfile unless it was snapshotted”
- Snapshot lockfile first if it is small & readable (best-effort)

---

## 11) Output (UPDATED: include irreversible + undo coverage notice)

### 11.3 Must print irreversible coverage line

If any irreversible step is executed or proposed, summary MUST include:

- “Undo coverage: partial (some actions irreversible)”
- And list which step IDs are not undoable

Example:

- “Undo coverage: partial — `docker_prune`, `remove_lockfile` are irreversible.”

---
