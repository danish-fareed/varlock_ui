Let me study everything we've built, then think deeply before designing anything.Good. Now I have a deep picture of what's real and what's possible. Let me think through the full matured product before touching any UI.

---

## The mature product thinking — before any design

The core insight that makes this product genuinely great is this: **the developer's biggest daily tax is not writing code — it's the ritual of starting work.** Open terminal, remember which directory, remember which command, remember which env, wait for things to start, context-switch to check logs. Your product eliminates that entire ritual. One click and the developer's full working environment is alive. That is the product. Everything else is polish.

Let me now name it properly in my thinking. This is a **project runtime manager** — not a terminal replacement, not an env editor. It sits one layer above both. It knows your projects, knows how to start them, knows which environment they need, and keeps them running independently of your UI.

### The three pillars of the mature product

**Pillar 1 — Zero-config project understanding.** Drop any project folder in. The app reads it and already knows what it is, what commands exist, what envs are needed, and what a healthy startup looks like. The developer provides nothing. This requires a smart discovery engine that reads 12+ file types, infers project topology, and ranks commands by likely intent.

**Pillar 2 — Env-aware process lifecycle.** Every running process is permanently bonded to the env it was started with. The user sees which env is active at all times. Switching env on a running process is a first-class operation: stop → re-inject new env → restart. You never have a zombie process running against the wrong database. Varlock is the engine here — `varlock run` wraps every command so env injection is always validated before the process touches anything.

**Pillar 3 — OS-native process ownership.** Processes belong to the OS, not the app. tmux owns them. The app is a control plane, not a process parent. The "open terminal" button is not a gimmick — it is the escape hatch that makes developers trust the product. They know they can always drop to raw shell and see exactly what is running. That trust is what makes them willing to never open a terminal manually again.

Now let me design the full mature system:Now the mature full UI — the complete dashboard with every screen state thought through:---

## The complete mature foundation — every hard decision made

### The name and positioning

This product is not a "Varlock GUI." Varlock is the env engine underneath. The product is a **project runtime manager for developers who want zero terminal friction**. Call it **DevLaunch** or similar. Varlock is one of its powers, not its identity. This matters because non-varlock users (plain `.env`, Makefiles, Python projects) are equally valid customers. The product grows bigger than any single tool.

### How varlock env management works inside every terminal

This is the most important technical decision in the whole product. When a developer clicks Play on any command, here is the exact sequence your system executes:

**Step 1 — Pre-flight env validation.** Before anything starts, your engine calls `varlock load --format=json --cwd=/project/path` with the selected environment override. If it returns errors on required variables, the Play button does not proceed — it shows the error inline on the card with a "Fix env" shortcut. The developer cannot accidentally start a process with a broken env.

**Step 2 — Session naming.** Your engine generates a deterministic tmux session name: `dl-{projectSlug}-{commandSlug}`. For example `dl-my-saas-app-dev-server`. This name is stored in your SQLite registry alongside the project path, command, and selected environment name.

**Step 3 — Launching with varlock.** The actual tmux command executed:
```bash
tmux new-session -d -s "dl-my-saas-app-dev-server" \
  "cd /path/to/project && APP_ENV=development varlock run -- npm run dev"
```
The `APP_ENV` override is set as an environment variable to the tmux session itself, not as a shell export inside the command. This means every sub-process inside that session inherits the correct environment automatically.

**Step 4 — Env snapshot.** Immediately after session creation, your engine calls `varlock load --format=json` one more time and saves the full resolved env (with sensitive values still masked) to the SQLite registry keyed by session name. This snapshot is what you show in the "View vars" panel — the exact env state at the moment the process launched, not the current state of the files on disk. If someone changes `.env.schema` while the process is running, the snapshot still shows what the process was actually started with. This is critical for debugging.

**Step 5 — The terminal icon.** When the developer clicks the terminal icon on a running card, your engine does not open a new terminal with a new env. It opens the OS terminal and attaches to the exact existing tmux session. The developer sees the same output stream that has been running since they clicked Play. They can interact with the process (type `rs` in nodemon, press `u` to update jest snapshots, run `git status` in the spare pane). When they close the terminal window, the process keeps running — they did not kill it, they just detached.

**Step 6 — Env switch on a running process.** If the developer changes the active env while a process is running, your UI shows a banner on that card: "Dev server started with `development`. Active env changed to `production`. Restart to apply." A "Restart with new env" button sends `tmux send-keys SIGTERM`, waits for process death, then re-runs Step 1–4 with the new env. The old tmux session is killed and a new one is created. The env snapshot in SQLite is updated.

### The command discovery engine in full

Your discovery engine runs once when a project is added and again whenever a watched file changes. It produces a ranked, categorized list of commands from these sources in order:

`package.json scripts` — highest priority, most common. Extract every script. Apply intent heuristics: `dev`/`start`/`serve` → Dev Server category. `build`/`compile` → Build. `test`/`spec`/`jest`/`vitest`/`mocha` → Test. `migrate`/`seed`/`db:` → Database. `lint`/`format`/`typecheck` → Code Quality. `deploy`/`release` → Deploy.

`Makefile` — parse `.PHONY` targets plus all targets matching `^[a-zA-Z][a-zA-Z0-9_-]*:`. Ignore targets starting with `.` or `_`. Label each as `make {target}`.

`Procfile` — Heroku/Foreman style. Each line `name: command` becomes a command card named after its Procfile key.

`docker-compose.yml` — surface `docker compose up`, `docker compose up --build`, and individual service starts like `docker compose up postgres`. These do NOT use `varlock run` because docker-compose reads its own env file (`.env` at docker-compose.yml level). Your UI shows this difference visually.

`pyproject.toml` — check `[tool.taskipy.tasks]`, `[tool.poe.tasks]`, and `[tool.scripts]` sections.

`Cargo.toml` → `cargo run`, `cargo test`, `cargo build --release`.

`go.mod` → `go run .`, `go test ./...`, `go build`.

`Gemfile` present → `bundle exec rails server`, `bundle exec rspec`.

`.vibestart.json` — your own project config file. User-defined commands stored here always appear and override discovery. This is where custom commands, renamed commands, and pinned commands live.

### The env layer — three tiers handled cleanly

**Tier 1 — Varlock projects** (`.env.schema` detected): all commands run wrapped in `APP_ENV={env} varlock run --`. Validation is pre-flight. Secrets are resolved by Varlock. Your app shows the varlock badge on the project, shows the variable count and secret count, and enables the "View vars" and "Validate" buttons with full detail.

**Tier 2 — Plain dotenv projects** (`.env` or `.env.*` files, no `.env.schema`): your app reads the selected env file with a basic dotenv parser, injects variables as process environment before spawning via tmux. Show a subtle "No schema — variables not validated" notice and a "Migrate to varlock" suggestion that runs `varlock init` and opens the schema editor.

**Tier 3 — No env configuration** (raw projects like pure Go, Rust, C): no env injection. Commands run with the current shell environment. Your app shows "No env configured" and optionally shows any env vars currently in the system environment that look relevant (matching common patterns like `DATABASE_URL`, `API_KEY`, etc.).

### What the "open terminal" button actually does per OS

The exact production code for each platform:

**macOS — Terminal.app:**
```bash
osascript -e 'tell app "Terminal" to do script "tmux attach -t dl-my-saas-app-dev-server"'
```

**macOS — iTerm2 (detected by checking if iTerm2 is installed):**
```bash
osascript -e 'tell app "iTerm2" to create window with default profile command "tmux attach -t dl-my-saas-app-dev-server"'
```

**macOS — Ghostty/Kitty (detected by `which ghostty`):**
```bash
ghostty -e tmux attach -t dl-my-saas-app-dev-server
```

**Windows — Windows Terminal:**
```
wt.exe new-tab -- cmd /c wsl tmux attach -t dl-my-saas-app-dev-server
```

**Linux — auto-detect:**
Your engine checks `$TERM_PROGRAM`, then `which gnome-terminal`, `which kitty`, `which alacritty`, `which xterm` in order and uses the first one found. Each has its own `exec` flag syntax.

**Universal fallback:** Copy the attach command to clipboard and show a toast: "Command copied — paste it in your terminal." This works everywhere, including SSH sessions and exotic terminal setups.

You let the user configure their preferred terminal in Settings. Once set, that terminal is always used. The auto-detection only runs if no preference is saved.

### The SQLite schema — your persistence foundation

```sql
projects        (id, name, path, detected_type, varlock_present, created_at)
commands        (id, project_id, name, raw_cmd, source_file, category, is_custom, sort_order)
env_configs     (id, project_id, name, type, file_path, is_default)
processes       (id, command_id, env_config_id, tmux_session, pid, status, started_at, stopped_at)
env_snapshots   (id, process_id, snapshot_json, taken_at)
process_logs    (id, process_id, line, timestamp)  -- last 1000 lines per process
```

On app startup, your engine calls `tmux list-sessions` and matches results against the `processes` table. Any session that exists in tmux but shows `stopped` in your DB gets updated to `running`. Any session in your DB as `running` but absent from tmux gets marked `crashed` — and the card shows the crash state with a "View last logs" button that reads from `process_logs`.

### The "zero config" first-run experience

When a user drops a project folder into your app for the first time:

1. Discovery engine scans (takes 200–400ms). Show a subtle scanning animation.
2. Env detection runs — finds `.env.schema`, `.env.development`, `.env.production`.
3. Varlock is detected — run `varlock load --format=json` to get the current health.
4. App shows the first-run summary: "Found 7 commands · varlock detected · 2 env warnings need attention."
5. User lands on the dashboard. Everything is already laid out. No configuration required.
6. The one question asked: "What should the default env be for this project?" with a dropdown. That's it.

From that point, the developer never thinks about envs again unless they actively want to. The env bar always shows the current state. The pre-flight validation before every Play ensures they are never surprised by a broken env mid-run.
