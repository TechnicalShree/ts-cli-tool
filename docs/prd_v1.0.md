# auto-fix — Requirements (requirement.md)

## 0) One-line product promise

**auto-fix** is a daily-use CLI that **detects** your project type, **diagnoses** common dev breakages, and **applies safe fixes** (or prints a plan) with a **premium, readable summary**.

---

## 1) Goals

### Primary goals

- Solve high-frequency developer problems in seconds:
  - Port already in use
  - node_modules broken / dependency drift
  - Next.js / Vite cache corruption
  - Python environment drift
  - Docker Compose dirty state
  - Lint/test/format mismatch
- Be safe by default: no destructive actions unless explicitly allowed.
- Be transparent: always show what it detected, what it ran, and what happened.
- Work out-of-the-box; become smarter with `.autofix.yml`.

### Non-goals (MVP)

- Not a full project generator (that’s `dev-ops-lite`).
- Not a full security scanner (can be added later as plugins).
- Not a replacement for package managers/linters (it orchestrates them).

---

## 2) Target users

- Developers working across Node/Next/Vite, Python, Docker Compose.
- People who want “one command” to stabilize a broken dev loop.
- Teams who want a consistent repair flow (optionally with JSON reports).

---

## 3) CLI Commands & UX

### 3.1 Default command

#### `auto-fix`

- Runs **safe fixes** only.
- Detects project type(s) and executes a smart fix plan.
- Prompts if it needs approval for destructive steps unless `--approve` is provided.

### 3.2 Diagnosis-only

#### `auto-fix doctor`

- **No changes** to the filesystem or environment.
- Collects facts + likely causes + recommended actions.
- Exit code signals whether problems were found.

### 3.3 Plan-only

#### `auto-fix plan`

- Prints the exact plan it _would_ run, including shell commands and rationale.
- No changes.
- Useful for CI preview and trust-building.

### 3.4 Machine-readable report

#### `auto-fix report --json`

- Outputs the last run’s report as JSON (or streams a fresh run if `--run` is passed).
- Default: reads from `.autofix/reports/latest.json`.

### 3.5 Best-effort rollback

#### `auto-fix undo`

- Attempts to revert the last run:
  - restores backups/snapshots taken by auto-fix
  - reverts config edits (if any)
- Best-effort; prints what can/can’t be undone.

---

## 4) Global Flags (MVP)

### Safety & control

- `--dry-run` : show actions, run nothing (same as `plan` but on default command).
- `--deep` : enables destructive cleanup steps (e.g., delete node_modules).
- `--approve` : skip prompts and allow destructive steps (still logs actions).
- `--focus <node|python|docker|all>` : restrict plan to a subsystem.
- `--checks [lint,test,format]` : run checks phase (default: auto-detect configured scripts/tools).
- `--kill-ports [comma-separated ports]` : enable port cleanup. If omitted, uses defaults/config.
- `--verbose` : prints executed commands + stderr/stdout (still formatted).
- `--quiet` : minimal output (still prints final summary).
- `--no-color` : disable ANSI coloring.

### Output & reporting

- `--report-path <path>` : override where to write reports.
- `--json` : print JSON report to stdout (in addition to pretty output).

---

## 5) Safety Requirements (Must-have)

### 5.1 Default safe mode

By default, auto-fix MUST NOT:

- delete `node_modules/`
- delete lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`)
- run `docker system prune`
- remove Python virtual environments
- modify git history or commit anything

### 5.2 Destructive actions gate

Any destructive action requires either:

- `--deep`, OR
- `--approve`

If neither is provided, auto-fix must:

- show the step as “Proposed (needs approval)”
- ask for confirmation interactively (unless non-interactive environment detected; then skip step and warn)

### 5.3 Always create rollback artifacts

If auto-fix will delete or change something (deep mode), it must:

- create a backup snapshot in `.autofix/snapshots/<run_id>/...` when feasible
- record exact operations in the run report

---

## 6) “Always explain” output requirements (Must-have)

At the end of every run (including `doctor`, `plan`), auto-fix prints a summary containing:

1. **Detected environment** (project types + key tools)
2. **Plan/Actions** (what was run; what was proposed/skipped)
3. **Results** (success/failure per step, overall count)
4. **Next best action** (a suggested command to run next, e.g., `pnpm dev`)

It MUST include:

- what it detected
- what it ran
- what succeeded/failed
- quick next action

---

## 7) Works without config; better with `.autofix.yml`

### 7.1 Config discovery

- auto-fix looks for `.autofix.yml` in:
  - current directory
  - then parents up to repo root (detected by `.git/`)
- If found, merge with defaults.

### 7.2 Minimal config schema (MVP)

```yaml
version: 1

ports:
  default: [3000, 5173, 8000, 8080]
  extra: [9229]

node:
  package_manager: auto # auto|npm|pnpm|yarn
  deep_cleanup:
    remove_node_modules: true
    remove_lockfile: false
  caches:
    next: true
    vite: true
    directories: [".turbo", ".cache"]

python:
  venv_path: ".venv"
  install:
    prefer: "uv" # uv|pip|poetry|pipenv|auto
  tools:
    format: ["ruff format", "black ."]
    lint: ["ruff check ."]
    test: ["pytest -q"]

docker:
  compose_file: auto # auto|docker-compose.yml|compose.yml|path
  safe_down: true
  rebuild: true
  prune: false # must stay false unless deep/approve

checks:
  default: ["lint", "format", "test"]

output:
  report_dir: ".autofix/reports"
  snapshot_dir: ".autofix/snapshots"
  verbosity: "normal" # quiet|normal|verbose
```
