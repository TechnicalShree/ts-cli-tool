# auto-fix

`auto-fix` is a TypeScript CLI that detects local development environment issues and applies safe, explainable fixes for Node, Python, and Docker-based projects.

## What it does

- Detects project stack (Node, Python, Docker Compose)
- Diagnoses common local setup problems
- Builds an explicit fix plan before execution
- Runs safe fixes by default
- Supports gated destructive cleanup (`--deep`, `--approve`)
- Writes run reports and snapshot metadata for rollback
- Supports best-effort `undo` for snapshotted changes

## Requirements

- Node.js 18+
- npm (or compatible Node package manager for development)
- Optional tools (used only when relevant to your project):
  - Python + `pip`/`uv`/`poetry`/`pipenv`
  - Docker + Docker Compose

## Installation

### 1) Clone and install dependencies

```bash
git clone <your-repo-url>
cd ts-cli-tool
npm install
```

### 2) Build the CLI

```bash
npm run build
```

### 3) Run locally

```bash
npm start
```

## Use as a CLI command (`auto-fix`)

After build, the executable is exposed via:

- Bin name: `auto-fix`
- Entry point: `dist/cli.js`

You can run it in either of these ways:

```bash
npm start -- doctor
```

```bash
node dist/cli.js doctor
```

To install globally from this repo:

```bash
npm run build
npm link
```

Then use:

```bash
auto-fix
```

To remove global link:

```bash
npm unlink -g auto-fix
```

## Quick start

Run safe fixes (default behavior):

```bash
auto-fix
```

Diagnosis only (no changes):

```bash
auto-fix doctor
```

Preview plan without executing:

```bash
auto-fix plan
```

Show latest report as JSON:

```bash
auto-fix report --json
```

Rollback latest run (best-effort):

```bash
auto-fix undo
```

## Commands

`auto-fix [command] [flags]`

- Default command (`auto-fix`): detect + execute safe fixes
- `doctor`: detection and diagnosis only (no modifications)
- `plan`: prints execution plan (same as dry-run)
- `report`: reads latest report (`--run` runs fresh first)
- `undo`: best-effort restore using latest run snapshots
- `help`: show CLI help

## Flags (all)

### Safety and execution control

- `--dry-run`: show actions, do not execute
- `--deep`: enable destructive cleanup steps (for example deleting `node_modules`)
- `--approve`: skip interactive prompts and allow destructive steps
- `--force-fresh`: allow fresh rebuild actions (requires `--deep` or `--approve`)
- `--focus <subsystem>`: restrict execution to one subsystem
  - Allowed values: `node`, `python`, `docker`, `all`
- `--checks <list>`: checks phase selector
  - Comma-separated values from: `lint,test,format`
  - Example: `--checks lint,test`
- `--kill-ports [ports]`: enable port cleanup
  - Optional comma-separated ports
  - If omitted, defaults are used from config

### Output and reporting

- `--verbose`: print commands and command outputs
- `--quiet`: minimal output, still prints final summary
- `--no-color`: disable ANSI colors
- `--json`: print machine-readable JSON report to stdout
- `--report-path <path>`: override report directory path
- `--run`: with `report`, run a fresh execution instead of reading latest

## Typical usage patterns

Safe default run:

```bash
auto-fix
```

Plan before execution:

```bash
auto-fix plan
```

Deep cleanup with explicit approval:

```bash
auto-fix --deep --approve
```

Only Node subsystem:

```bash
auto-fix --focus node
```

Run only lint + test checks:

```bash
auto-fix --checks lint,test
```

Kill default configured ports then execute:

```bash
auto-fix --kill-ports
```

Kill specific ports:

```bash
auto-fix --kill-ports 3000,5173,9229
```

Read latest report:

```bash
auto-fix report --json
```

Trigger run and emit JSON in one command:

```bash
auto-fix report --run --json
```

## Configuration

`auto-fix` works without config. To customize behavior, create `.autofix.yml` in project root.

The loader searches current directory upward until git root.

### Example `.autofix.yml`

```yaml
version: 1

ports:
  default: [3000, 5173, 8000, 8080]
  extra: [9229]

node:
  package_manager: auto # auto | npm | pnpm | yarn
  deep_cleanup:
    remove_node_modules: true
    remove_lockfile: false
  caches:
    next: true
    vite: true
    directories: [".turbo", ".cache"]

python:
  venv_path: .venv
  install:
    prefer: uv # uv | pip | poetry | pipenv | auto
  tools:
    format: ["ruff format", "black ."]
    lint: ["ruff check ."]
    test: ["pytest -q"]

docker:
  compose_file: auto
  safe_down: true
  rebuild: true
  prune: false

checks:
  default: [lint, format, test]

output:
  report_dir: .autofix/reports
  snapshot_dir: .autofix/snapshots
  verbosity: normal # quiet | normal | verbose
```

## Reports and artifacts

By default:

- Reports: `.autofix/reports/`
- Latest report: `.autofix/reports/latest.json`
- Snapshots: `.autofix/snapshots/`

`auto-fix` also ensures `.autofix/` is in `.gitignore`.

If the configured snapshot directory is not writable, snapshots fall back to a temp directory:

- macOS/Linux pattern: `/tmp/autofix/<run_id>`

## Undo behavior (important)

`auto-fix undo` is best-effort and limited to steps that:

- Are marked undoable
- Have snapshot paths recorded in the report
- Still have snapshot files available

Undo cannot restore changes that were never snapshotted or are irreversible by nature.

## Exit codes

- `0`: successful run or expected non-error output
- `1`: runtime error, missing latest report for `report`/`undo`, or `doctor` found issues

## Development

### Scripts

- `npm run dev`: run CLI from source with `tsx` (`src/cli.ts`)
- `npm run build`: compile TypeScript to `dist/`
- `npm start`: run built CLI (`dist/cli.js`)
- `npm test`: build silently and run Node test runner
- `npm run lint`: TypeScript type-check only (`tsc --noEmit`)

### Local development workflow

```bash
npm install
npm run lint
npm test
npm run dev -- doctor
npm run build
```

## Project structure

- `src/cli.ts`: CLI entrypoint and argument parsing
- `src/core/`: detection, planning, execution, safety, undo
- `src/config/`: defaults and config loading
- `src/report/`: summary and report writing
- `src/subsystems/`: subsystem-specific checks/fixes
- `src/ui/`: terminal renderer and progress hooks
- `dist/`: compiled JavaScript output
- `docs/`: product requirement docs and notes

## Troubleshooting

`auto-fix` command not found:

- Run `npm run build` first
- Use `node dist/cli.js ...` directly
- If using global link, run `npm link` in project root

No report found for `report` or `undo`:

- Run `auto-fix` once first
- Check custom `--report-path` usage
- Verify `.autofix/reports/latest.json` exists

Non-interactive environments behave conservatively:

- In polyglot projects (Node + Python + Docker), non-interactive mode without `--approve` may limit execution to a safe subset

## License

ISC
