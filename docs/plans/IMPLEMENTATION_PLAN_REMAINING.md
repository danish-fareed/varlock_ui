# Remaining Implementation Plan

This document is the detailed delivery plan for finishing `varlock_ui` beyond the current working MVP. It translates the architecture docs and HTML mockups into an execution-ready roadmap with concrete scope, technical tasks, acceptance criteria, risks, and completion gates.

The goal is not just to add features, but to finish the product around the core rule already established in `docs/architecture/ARCHITECTURE.md`:

`UI writes files -> Varlock reads them -> Varlock outputs JSON -> UI displays it.`

## 1. Product Target

`varlock_ui` is complete when a user can:

- add a project or migrate an existing dotenv project
- inspect and edit `.env.schema` and `.env.*` files from the app
- understand real validation and metadata, not only inferred values
- run commands through `varlock run` with a polished terminal experience
- scan a project with `varlock scan` and understand the results
- complete the main flows shown in the design mockups
- install, run, and package the app reliably on Windows, with documentation that explains setup and development

## 2. Verified Current Baseline

The current app already has these working foundations:

- Tauri v2 desktop shell with React, TypeScript, Zustand, Tailwind, and xterm.js
- project add/remove/select flow with persistence
- Varlock detection and install prompt flow
- dashboard loading via `varlock load --format json-full`
- normalized variable display and environment switching
- terminal launch and real-time output streaming
- dotenv-to-Varlock entry point through a simplified migration CTA
- file watching and refresh behavior
- dark theme aligned more closely to the charcoal mockups
- reorganized docs under `docs/`

## 3. Reality Checks And Constraints

The remaining plan must respect the actual behavior of the installed Varlock CLI, not only the original concept docs.

### 3.1 CLI realities already discovered

- `varlock load --format json` is too thin for the UI and should not be used as the primary data source
- `varlock load --format json-full` is the correct source for dashboard normalization
- `varlock init` is interactive, does not support `--yes`, and does not support `--cwd`
- Windows binary resolution must prefer `varlock.cmd` or `varlock.exe`
- separate vault/team/login commands may not exist in the current CLI surface

### 3.2 Product planning implication

- anything that depends on unsupported CLI capabilities must be isolated behind capability checks or deferred
- the UI must own schema parsing and file editing logic directly
- advanced product areas such as teams and vault setup should be framed as conditional extensions unless real CLI support is confirmed

### 3.3 Capability validation checklist

Before implementing any feature that assumes deeper Varlock support, confirm the real command surface and document the result.

- confirm the exact `varlock scan` output shape on Windows
- confirm whether any machine-readable scan format exists
- confirm whether vault or secret backend setup has CLI support
- confirm whether team or permission concepts exist in the current product
- confirm whether any schema generation or validation helpers exist beyond `load`, `run`, `scan`, and `init`
- record findings in docs if a mockup concept is intentionally deferred

## 4. Non-Negotiable Product Principles

Every remaining phase should preserve these rules.

### 4.1 File ownership

- `.env.schema` and `.env.*` are the source of truth for edits
- the app never fabricates runtime state without being able to write it back to disk
- writes must stay project-local and path-validated

### 4.2 Safe editing

- never silently destroy user content
- preserve formatting where practical
- create backups for generated or migration-heavy operations
- surface diffs or previews before multi-file destructive writes

### 4.3 Accurate status

- UI badges and validation states must be derived from real schema plus Varlock load output
- inferred data must be labeled as inferred until saved into `.env.schema`

### 4.4 Strong desktop behavior

- Windows-first robustness matters because this project already hit Windows-specific issues
- no visible console popups for subprocesses
- process cleanup must remain reliable on session close and app close

### 4.5 UX consistency

- follow the design direction in `docs/design/`
- keep the existing dark charcoal palette and typography system coherent
- maintain accessible keyboard behavior for dialogs, drawers, tabs, and lists

## 5. Definition Of Done

The project should be considered functionally complete when all of the following are true.

### 5.1 Core flows

- a dotenv project can be migrated through a guided wizard
- a Varlock-ready project can be opened and refreshed reliably
- variables can be created, edited, deleted, and saved from the UI
- environment values can be edited per file and revalidated immediately
- terminal sessions can be launched, named, managed, and stopped cleanly
- scan results can be viewed and acted on from the UI

### 5.2 Quality gates

- all major flows have explicit loading, success, empty, and error states
- backend commands validate input and protect against invalid paths
- frontend state remains correct under stale requests, rapid switching, and app reloads
- docs explain setup, architecture, local dev, and packaging
- packaging succeeds with real assets and without temporary workarounds

### 5.3 Visual and interaction quality

- main dashboard, migration wizard, and terminal flows feel close to the mockups
- keyboard navigation works in all critical flows
- mobile responsiveness is not required for Tauri in the same way as web, but narrow desktop sizes must remain usable

## 6. Cross-Cutting Workstreams

These are not standalone phases; they apply across all remaining phases.

### 6.1 State and data modeling

- keep Rust and TypeScript models aligned
- separate raw CLI payloads from normalized UI models
- add derived types only when they can be recomputed from file content or CLI results

### 6.2 Testing and verification

- unit test Rust parsing and normalization logic where deterministic
- add frontend component/store tests for state transitions and edge cases where practical
- manually verify all user-facing flows in Tauri dev on Windows
- prefer targeted automated coverage for parsers, migration inference, and transformation logic

### 6.3 Accessibility

- dialog labeling, focus trap, and escape close must remain intact
- tables, drawers, and tabs need proper semantics and keyboard movement
- validation colors must not be the sole source of meaning

### 6.4 Performance

- avoid full-project reloads when only file previews are needed
- debounce refreshes from file watching where needed
- parse schema once per refresh cycle and cache within the request boundary if useful

### 6.5 Error handling

- every backend command should return actionable error strings
- multi-step frontend flows need recoverable states, not dead-end failures
- partial migration failures should preserve backups and show exactly what was written

## 7. Recommended Delivery Order

The best order remains:

1. Phase 9 - Schema and env editing foundation
2. Phase 10 - Schema parser and metadata merge
3. Phase 11 - Guided migration wizard
4. Phase 12 - Scan experience
5. Phase 13 - Terminal and run UX expansion
6. Phase 15 - Docs, packaging, and cleanup
7. Phase 14 - Product extensions

This order prioritizes the app's core promise first: edit the files, validate with Varlock, and show trustworthy results.

## 8. Phase 9 - Schema And Env Editing Foundation

### 8.1 Goal

Turn the app into a real editing surface for Varlock-managed projects instead of a mostly read-only dashboard.

### 8.2 User outcome

The user can click a variable, inspect its details, edit schema-level attributes and environment-level values, save, and immediately see fresh validation results.

### 8.3 Scope

- variable detail UI
- schema field editing for existing variables
- per-environment value editing
- file read and write workflow improvements
- immediate post-save reload and validation
- preparation for later create/delete flows without implementing unsafe automation too early

### 8.4 Backend tasks

#### File targeting and safety

- add or refine a command to list editable files for the active project:
  - `.env.schema`
  - `.env`
  - `.env.local`
  - `.env.development`
  - `.env.production`
  - other discovered `.env.*` files if present
- validate every write target against the active project root
- reject path traversal and non-project writes

#### Editing helpers

- keep existing raw file read and write commands
- add higher-level helpers if they reduce frontend complexity:
  - `list_editable_env_files(cwd)`
  - `read_project_env_files(cwd)`
  - `write_project_file(cwd, relative_path, content)`
- standardize write responses to include the written file path and timestamp

#### Backup strategy

- define backup behavior for destructive or generated writes
- recommended default:
  - normal single-file edits: no automatic backup
  - multi-file migration writes: automatic backup
  - optionally expose a reusable backup helper for later phases

### 8.5 Frontend tasks

#### Variable detail surface

- add a detail drawer or modal opened from `VariableRow`
- show:
  - key
  - schema default or base value
  - active env value
  - type
  - required or optional
  - sensitive flag
  - description
  - source or origin if available
  - errors and warnings

#### Editing modes

- separate schema-level edits from environment-level edits
- recommended tabs or sections:
  - `Schema`
  - `Environment values`
  - `Validation`
- disable unsupported controls when schema metadata is still inferred rather than parsed

#### Value editing behavior

- allow editing the active environment file value directly
- allow switching target file when useful, such as `.env` vs `.env.local`
- show whether a value is inherited, overridden, empty, or missing

#### Save flow

- on save:
  - write file content
  - re-run `varlock load --format json-full`
  - refresh project status if needed
  - reopen the edited variable in refreshed data if possible
- surface inline save errors without dropping the drawer state

### 8.6 Data model work

- introduce an editable variable model in TypeScript that separates:
  - raw schema content
  - active resolved value
  - per-file values
  - inferred metadata vs confirmed metadata
- avoid conflating resolved runtime value with the text stored in a file

### 8.7 UX details

- clicking a row opens the detail UI
- secret values should stay masked by default with an explicit reveal action if supported locally
- changed but unsaved fields need dirty-state indication
- prevent accidental close with unsaved changes unless the user confirms discard

### 8.8 Testing and verification

- verify editing an existing `.env.development` value updates the file and reloads the dashboard
- verify schema edits persist and survive app restart
- verify save failure leaves the UI intact and shows the backend error
- verify rapid project switching does not save into the wrong project context

### 8.9 Deliverables

- editable variable detail UI
- editable environment value workflow
- basic `.env.schema` editing for existing entries
- post-save revalidation flow
- implementation hooks that make add/delete variable support straightforward in a follow-up slice

### 8.10 Acceptance criteria

- user can edit an existing variable from the dashboard without leaving the app
- save writes to the expected project-local file only
- UI refreshes automatically after save and shows updated status
- unsaved state and save failures are clearly communicated

### 8.11 Risks and mitigations

- risk: schema text manipulation may break formatting
- mitigation: keep initial editing scope narrow and operate on existing entries before adding create/delete automation
- risk: resolved values may differ from stored values due to expansion
- mitigation: label stored file values separately from resolved values in the UI

## 9. Phase 10 - Schema Parser And Metadata Merge

### 9.1 Goal

Recover the rich metadata missing from the current CLI output so the dashboard can show true schema semantics.

### 9.2 User outcome

The user sees accurate types, required status, sensitivity, descriptions, decorators, and validation context that match the schema file instead of thin inferred labels.

### 9.3 Scope

- Rust-side `.env.schema` parser
- parser output model for variables and decorators
- merge step combining schema metadata with normalized `json-full` load data
- frontend badge and status improvements

### 9.4 Parser requirements

The parser should support the schema style already implied by the mockups and docs.

- comment decorators such as `# @required`, `# @optional`, `# @sensitive`
- typed decorators such as `# @type=url`, `# @type=port`, `# @type=enum(...)`
- descriptions in preceding comments if such a convention is defined
- blank lines and grouped comments
- entries with empty values
- environment variable expansion references in values
- top-of-file directives if present

### 9.5 Backend tasks

#### Parsing layer

- add a dedicated parser module in Rust
- parse schema into a structured intermediate representation with:
  - key
  - base value text
  - decorators
  - description lines
  - raw block span if useful for later editing
  - parse warnings or unsupported syntax notes

#### Merge layer

- merge parser output with normalized `varlock load --format json-full` output
- distinguish:
  - metadata confirmed by schema
  - metadata inferred by heuristic
  - metadata absent or unknown
- return a single frontend-ready payload for the dashboard and editor

#### Error handling

- do not fail the entire project load if the schema parser hits a recoverable issue
- expose parser warnings alongside normal load results
- fall back to current normalized behavior when parsing fails entirely

### 9.6 Frontend tasks

- update variable badges to use confirmed schema metadata first
- add labels for:
  - missing required
  - optional unset
  - invalid type
  - secret
  - inferred metadata
  - parser warning
- improve filtering to leverage real metadata

### 9.7 Testing and verification

- Rust parser unit tests for representative schema samples
- tests for malformed decorator handling
- tests for merge precedence when CLI and schema disagree
- manual verification against real project files created by migration flow and hand-edited files

### 9.8 Deliverables

- stable Rust schema parser
- merged metadata payload exposed to frontend
- improved dashboard labels and editor fields backed by real schema data

### 9.9 Acceptance criteria

- required and sensitive badges are driven by parsed schema when present
- enum, url, port, and related type labels reflect schema content instead of guesswork
- parser failures do not break the dashboard; they surface as visible warnings

### 9.10 Risks and mitigations

- risk: Varlock schema syntax may be broader than expected
- mitigation: start with the subset already used in docs and real output, return parser warnings for unsupported syntax
- risk: editing and parsing can drift apart
- mitigation: keep a shared variable block model that both parser and editor can reuse

## 10. Phase 11 - Guided Migration Wizard

### 10.1 Goal

Replace the current single-action migration CTA with the richer multi-step migration flow shown in `docs/design/varlock_add_project_migrate.html`.

### 10.2 User outcome

The user can inspect detected dotenv files, preview the inferred schema, understand which values are sensitive, approve the changes, and land in a fully refreshed Varlock-ready project.

### 10.3 Scope

- file inventory step
- migration map preview step
- generated schema preview step
- apply step with backup handling
- completion step with next actions

### 10.4 Recommended wizard steps

1. `Locate`
   - choose directory
   - detect if already Varlock-ready or migration-needed
2. `Migrate`
   - inventory dotenv files
   - preview inference and sensitive keys
3. `Configure`
   - choose write behavior, backups, and optional env handling
   - if vault capabilities are not real yet, explain that secret values remain local placeholders
4. `Done`
   - show created files, backups, and follow-up actions

### 10.5 Backend tasks

#### Detection and analysis

- scan the project directory for dotenv files and classify them
- identify likely roles:
  - `.env.example` or `.env.sample` as schema seed
  - `.env` as shared defaults
  - `.env.local` as local overrides
  - `.env.production`, `.env.development`, `.env.test` as environment files
- infer sensitive keys using a conservative keyword strategy

#### Preview generation

- generate a migration plan data structure without writing files yet
- include:
  - detected files
  - variable counts
  - inferred schema entries
  - conflicts and duplicate keys
  - target write paths
  - backup paths if enabled

#### Apply step

- write `.env.schema`
- preserve original files unless the user explicitly requests otherwise
- create backups for any file being transformed or overwritten
- run `varlock init` only when it is still needed after file generation
- refresh project metadata and environments after success

### 10.6 Frontend tasks

#### Wizard UI

- create a multi-step modal or full-page flow matching the design language
- show a left primary content region and right preview region similar to the mockup
- allow previewing individual detected files before applying migration

#### Review content

- show migration map rows like `ORIGINAL -> inferred schema decorators`
- show badges for `@sensitive`, inferred types, and warnings
- show generated `.env.schema` preview with syntax highlighting or styled monospace formatting

#### Completion state

- after apply, refresh the active project automatically
- navigate to the dashboard with the migrated project selected
- highlight any required next steps, such as filling empty secrets

### 10.7 Decision rules

- never auto-delete source dotenv files during first version of the wizard
- default to backup creation for any transformed file
- mark sensitivity detection as heuristic unless user confirms and saves schema

### 10.8 Testing and verification

- verify migration on projects with only `.env`
- verify migration on projects with `.env.example` plus env-specific files
- verify duplicate keys and conflicts surface clearly before apply
- verify failure mid-apply leaves backups and reports written files accurately

### 10.9 Deliverables

- full migration wizard
- preview data model and generated schema preview
- backup-aware apply flow
- completion screen with follow-up guidance

### 10.10 Acceptance criteria

- user can preview detected files and inferred schema before any write occurs
- migration writes the expected project files and preserves originals
- migrated project loads successfully in the dashboard immediately after completion
- sensitive keys are visibly highlighted during review

### 10.11 Risks and mitigations

- risk: inference may over-classify or under-classify secret keys
- mitigation: label inference clearly and let the user review before write
- risk: projects may use nonstandard dotenv naming
- mitigation: include an `Other detected dotenv files` bucket and expose target mapping in the wizard

## 11. Phase 12 - Scan Experience

### 11.1 Goal

Expose `varlock scan` as a first-class workflow instead of a hidden backend capability.

### 11.2 User outcome

The user can run a project scan, understand whether secrets were leaked, and inspect exactly where issues were found.

### 11.3 Scope

- top-bar entry point
- loading workflow
- dedicated results view or panel
- empty, success, warning, and error states

### 11.4 Backend tasks

- verify current scan command contract and normalize it if needed
- define a stable scan result type with:
  - file path
  - line number
  - key or match label
  - severity
  - snippet or summary if safe to display
- map nonzero exits into actionable UI results rather than opaque failures

### 11.5 Frontend tasks

- add `Scan secrets` action in `TopBar`
- create a results surface that supports:
  - grouped-by-file display
  - grouped-by-severity display if needed
  - clean empty state when nothing is found
  - quick navigation back to the main dashboard
- if file deep-linking is not supported, still show enough context to identify the issue

### 11.6 UX details

- distinguish between `no findings`, `scan failed`, and `scan completed with findings`
- do not reveal full sensitive values in results if the CLI output is masked or partial
- support rerun after file edits

### 11.7 Testing and verification

- verify clean project scan state
- verify project with findings renders grouped results correctly
- verify scan failure reports stderr or actionable error message

### 11.8 Deliverables

- dedicated scan experience surfaced from the main UI
- normalized result rendering for findings and empty states

### 11.9 Acceptance criteria

- user can initiate scan from the project screen
- findings, if any, are understandable without reading raw CLI output
- scan results do not block returning to normal project workflows

### 11.10 Risks and mitigations

- risk: actual CLI scan output may vary or be sparse
- mitigation: keep normalization tolerant and render partial fields when necessary

## 12. Phase 13 - Terminal And Run UX Expansion

### 12.1 Goal

Finish the richer command-launching experience implied by the terminal mockup so the terminal area feels like a command center rather than a single raw launcher.

### 12.2 User outcome

The user can select an environment, pick or save a command, understand risks before production runs, manage multiple sessions, and reopen common commands quickly.

### 12.3 Scope

- improved launch UI
- saved run configurations
- production warning flow
- better terminal session metadata and management

### 12.4 Frontend tasks

#### Launcher improvements

- refine environment picker in the terminal sidebar or modal
- add run command modal if current inline layout feels cramped
- support selecting saved commands
- support creating, renaming, and deleting saved commands

#### Session management

- improve tab naming, such as `dev: npm run dev`
- persist optional recent or saved run definitions separately from active sessions
- support reopening the last command with one click if desirable

#### Production safety

- add a confirmation modal before launching production or similarly dangerous environments
- include command text, environment, and a short warning
- allow the user to opt into a `Do not ask again for this session` behavior only if useful and safe

### 12.5 Backend tasks

- current subprocess architecture is already suitable; only extend if session metadata needs backend support
- preserve existing cleanup guarantees
- ensure command validation remains strict for empty or malformed input

### 12.6 State model tasks

- store saved run configurations in persisted app state
- separate saved run configs from active running processes
- define a stable model with:
  - id
  - label
  - command
  - preferred environment optional
  - last used timestamp

### 12.7 Testing and verification

- verify launching saved commands into new tabs
- verify production warning appears only for designated environments
- verify stopping a process cleans the session state correctly
- verify app close still kills child processes cleanly

### 12.8 Deliverables

- richer run launcher flow
- saved run configuration management
- production warning modal
- better tab and session behavior

### 12.9 Acceptance criteria

- user can save and reuse commands without retyping them
- production launch presents a warning before spawn
- terminal tabs remain understandable under multiple concurrent sessions

### 12.10 Risks and mitigations

- risk: persisting too much terminal state may be confusing
- mitigation: persist saved configs and recent commands, not raw live terminal buffers

## 13. Phase 14 - Product Extensions

### 13.1 Goal

Cover the larger product ideas suggested by the mockups, but only after validating real Varlock support.

### 13.2 Important rule

This phase is conditional. It should not block completion of the core product. If the current CLI does not support these areas, document the gap and treat the work as design-ready future scope.

### 13.3 Candidate extension areas

#### Vault or secret source setup

- research actual CLI support for secret backends
- if supported, design a setup screen for selecting a provider and mapping secret paths
- if unsupported, replace the mockup expectation with a nonfunctional placeholder only if the product specifically wants that preview

#### Team management

- validate whether permissions, invites, or shared env concepts exist in the real ecosystem
- if unsupported, keep this as documentation-only future work

#### Advanced onboarding

- first-run flow for Varlock detection, install, sample project setup, and migration guidance
- only implement what is real and supportable now

### 13.4 Deliverable options

- best case: real supported extensions implemented
- fallback case: documented deferred scope with clear capability notes and no misleading fake functionality

### 13.5 Acceptance criteria

- no unsupported extension is presented to the user as complete functionality
- every implemented extension is backed by a real command surface or documented local-only behavior

## 14. Phase 15 - Docs, Packaging, And Cleanup

### 14.1 Goal

Make the project maintainable for contributors and shippable for users.

### 14.2 Scope

- root README
- developer setup docs
- packaging verification
- asset completion
- warning cleanup
- final consistency pass

### 14.3 Documentation tasks

- write `README.md` at the project root covering:
  - product overview
  - stack
  - prerequisites
  - install and run commands
  - Windows notes
  - architecture summary
  - repo structure
- expand docs where needed for:
  - setup troubleshooting
  - packaging notes
  - known limitations tied to actual Varlock CLI behavior

### 14.4 Packaging tasks

- replace placeholder icon assets with final app assets
- re-enable bundling in `src-tauri/tauri.conf.json`
- verify packaged app builds successfully on Windows
- record any signing or distribution prerequisites if relevant

### 14.5 Codebase cleanup tasks

- clean Rust warnings where reasonable
- remove or resolve temporary workarounds that are no longer needed
- prune unused notes or placeholder files if they no longer provide value
- ensure file and command names in docs match the current repo

### 14.6 Testing and verification

- verify fresh-clone local setup using docs only
- verify `npm install`, frontend build, Rust build, and Tauri dev all succeed
- verify packaging path end to end

### 14.7 Deliverables

- production-ready documentation set
- real assets and packaging config
- reduced warnings and cleanup of temporary debt

### 14.8 Acceptance criteria

- a new contributor can boot the project using the docs
- packaging succeeds without the temporary placeholder path being required
- docs and code references are consistent

## 15. Detailed Technical Decisions To Lock In

These decisions should be treated as the default plan unless implementation proves they need revision.

### 15.1 Editing strategy

- first support editing existing variables reliably
- add create and delete flows only after parser and writer behavior are stable
- represent schema entries as editable blocks rather than line-by-line string hacks where possible

### 15.2 Metadata precedence

- parsed schema metadata wins over heuristic inference
- normalized CLI load data wins for runtime validity and resolved values
- heuristic inference is used only when schema metadata is absent

### 15.3 Migration safety

- preview first, write second
- keep originals by default
- create backups for generated or transformed files
- report exactly which files were created or changed

### 15.4 Persisted app state

- continue using local JSON persistence for projects and run configs
- do not persist sensitive resolved values
- do not persist transient scan output or raw terminal buffers unless there is a clear reason

## 16. Explicit Out-Of-Scope Until Core Completion

These items should not interrupt Phases 9 through 15 unless they become required for a core flow.

- speculative team management screens without confirmed backend capability
- fake vault integrations that imply functionality the CLI does not support
- broad schema syntax support beyond the subset needed for real project files
- full variable create/delete automation before the parser and writer model is stable
- persistence of raw terminal transcript history across app launches

## 17. Release Gates By Milestone

### Gate A - Editable core complete

- Phase 9 finished
- user can edit existing variables and values from the app

### Gate B - Metadata trustworthy

- Phase 10 finished
- dashboard statuses and editor fields are backed by parsed schema metadata

### Gate C - Migration complete

- Phase 11 finished
- app supports guided migration from dotenv projects with previews and backups

### Gate D - Operational workflows complete

- Phases 12 and 13 finished
- scan and run workflows are both product-quality

### Gate E - Ship ready

- Phase 15 finished
- docs, assets, packaging, and cleanup are complete

### Gate F - Optional extension review

- Phase 14 either implemented based on real support or explicitly deferred with documented reasons

## 18. Final Success Criteria

The original concept is effectively complete when all statements below are true.

- a user can add a project and migrate an existing dotenv setup without leaving the app
- a user can inspect, edit, and save `.env.schema` and `.env.*` files from the UI
- the variable list reflects real schema metadata, not only load-result inference
- `varlock load`, `varlock run`, and `varlock scan` are all clearly surfaced in the interface
- the main dashboard, migration, and terminal flows match the intent of the HTML mockups
- the app can be built, run, and packaged with real assets and clear documentation

## 19. Immediate Next Step

The next implementation phase should start with Phase 9.

Most practical first slice:

1. add editable file inventory support for the active project
2. add a variable detail drawer opened from `VariableRow`
3. allow editing the active environment value for an existing variable
4. save and immediately re-run `varlock load --format json-full`
5. only then expand into schema metadata editing

This keeps the first remaining delivery slice narrow, high-value, and low-risk while setting up the parser and migration work that comes next.
