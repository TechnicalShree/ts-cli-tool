# auto-fix — PRD v1.2 (Real-world Enhancements)

## 1. Goal
Address the most common, real-world local development environment problems that were not covered in v1.0 or v1.1. Extensive web research indicates that developers consistently struggle with:
1. Environment variable chaos (missing `.env` or out of sync with `.env.example`).
2. Node/Python runtime version mismatches.
3. IDE (VS Code) failing to detect Python virtual environments.
4. EPERM/EACCES locking issues during `npm install`.

## 2. Proposed Enhancements

### 2.1 Environment Variable Synchronization
**Problem**: Development servers often crash cryptically because a new required environment variable was added to the `.env.example` but the developer's local `.env` wasn't updated.
**Solution**:
- **Missing `.env`**: If `.env.example` exists but `.env` does not, `auto-fix` MUST automatically copy `.env.example` to `.env`.
- **Sync check**: If both exist, parse the keys. If `.env.example` has keys missing from `.env`, `auto-fix` MUST append the missing keys to `.env` (with empty or default values) or warn the user. 
- **Destructive/Safe**: Copying/Appending non-destructively to `.env` is considered **safe**.

### 2.2 Runtime Engine Version Verification
**Problem**: Dependencies fail to install or run because the developer's current shell binds to `node v14` instead of `v18` (expected by `.nvmrc` or `package.json engines`), or the wrong Python version.
**Solution**:
- **Node**: If `.nvmrc` or `.node-version` exists, parse it and compare against `process.version`. If they mismatch structurally (e.g., major version drift), warn the user and mark the step `status: proposed` (action: "Run `nvm use` or update Node").
- **Python**: If `.python-version` exists, compare it against the output of `python3 -V`. If mismatched, warn the user.
- **Execution phase**: This should run in the initial `detect` or `environment` phase before any `node_modules` or `venv` installations are attempted.

### 2.3 IDE Integration Auto-Configuration (VS Code + Python)
**Problem**: After `auto-fix` generates `.venv`, VS Code typically fails to recognize it automatically without manual path configuration, leading to false-positive linting errors in the editor.
**Solution**:
- If a Python `.venv` is created or exists, check for `.vscode/settings.json`.
- Automatically set or update `"python.defaultInterpreterPath": ".venv"` if it's missing or points to a global python.
- **Undo scope**: This file must be snapshotted if modified.

### 2.4 Zombie Process EPERM Prevention
**Problem**: On Windows and sometimes macOS, `npm ci` or `rm -rf node_modules` fails with `EPERM` or `EBUSY` because a rogue zombie Node process or file watcher is keeping a lock on files inside `node_modules`.
**Solution**:
- If `auto-fix` detects `node_modules` needs deletion, it should first detect processes holding locks in that folder.
- *Alternatively*: Introduce a broad port-agnostic `kill` command for dangling process cleanup, or specifically warn on `EPERM` during node steps to "Close IDE or kill orphaned node processes".
- **MVP spec**: Catch `EPERM` errors on node dependency tasks and emit a specific, intelligible error message suggesting IDE closure or zombie killer.

## 3. Order of Execution Updates (Section 8.6 Additions)
Add to the strict execution order:
1. **Environment fixes**
   - **(NEW) Env var sync (.env.example -> .env)**
   - **(NEW) Engine version check (.nvmrc / .python-version)**
   - port cleanup
   - docker compose stabilization 
2. **Dependency fixes** 
...

## 4. Rollback and Snapshotting additions
- Changes to `.env` MUST be backed up before mutation.
- Changes to `.vscode/settings.json` MUST be backed up before mutation.
