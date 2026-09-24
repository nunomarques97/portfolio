# Portfolio

Nuno Marques's personal portfolio.

Status: **empty scaffold, private repository.** Product, stack and design are not decided yet; the Sponsor states the goal in the first session. Do not pick a stack, write UI or start a FORJA run before that. The repository will be made public later, so everything committed must be safe to publish.

## Rules

1. **No secrets, ever.** Keys come only from environment variables or git-ignored local files. Never write a real key into code, tests, fixtures, docs, logs, screenshots or commit messages. A fake key-shaped value in a fixture must end its line with `guard-allow-secret`.
2. **Never name a file with `token`, `secret`, `apikey`, `api_key` or `api-key` in it**: `.gitignore` ignores those names, so such a file would silently never be committed. Use names like `auth`, `credentials-store`, `usage`.
3. **Keep the pre-commit hook enabled**: `git config core.hooksPath .githooks` (runs `scripts/guard-keys.mjs`). Never bypass it with `--no-verify`. Before any change of repository visibility, run `node scripts/guard-keys.mjs --all`.
4. **English only** in everything that ships: code, comments, identifiers, docs, UI copy, error messages, commit messages.
5. **No internal process material in the product.** Chat logs, transcripts, notes to or about the Sponsor, run reports and agent chatter live only in `docs/forja/` and `.claude/`, never in `README.md`, product docs, code comments or anywhere else.
6. **Commit messages read like a senior developer wrote them**: English, imperative mood, subject of 72 characters or less, optional body saying why; no task IDs, `Forja`, `checkpoint`, AI/agent wording or emoji. Author: the identity configured in this repo (GitHub noreply address); do not change it.
7. **UI work follows `docs/design/DESIGN.md`** once it exists (created by the `ui-kickoff` process).
8. **Publishing is a Sponsor decision.** Pushing to the private `origin` is normal work. Making the repository public, deploying, publishing packages or anything that spends money goes to the Sponsor.
9. **No LICENSE yet.** The Sponsor picks one before the repository goes public.

<!-- forja-core:begin -->
## FORJA core
New FORJA tasks use Core. The conversation agent prepares the goal, starts the controller and reports its result; it does not act as Lead or manually dispatch the legacy crew.
Resolve `<forja>` from the caller-provided installation, `FORJA_ROOT`, or an existing FORJA hook path in `.claude/settings.json`. If unavailable, ask for the installation path; do not guess or install another copy.
Read `<forja>/docs/CORE.md` and `<forja>/docs/CORE-RUNBOOK.md`. From this project: `node "<forja>/bin/forja.mjs" start --goal "..." --provider claude|codex`. Supply the explicitly selected profile with `--config`; installing or updating FORJA does not select models.
The controller owns planning, development, checks and independent review. Workers read only the phase and applicable domain methods supplied in `specialist_context`. Do not load `forja-lead` or other legacy crew skills for Core work.
Core state and usage live in `.forja/`. Inspect existing changes before starting; preserve them and use `--allow-dirty` only when work on that snapshot is authorized. Git delivery requires explicit configuration and the controller delivery contract.
Preparation does not start a run. Never silently resume or replace an active Core or legacy run. Stop existing executors before an explicitly authorized handover; preserve their state and unfinished work.
Legacy `runner` and `run start` are compatibility commands only when explicitly requested. Their state remains in `docs/forja/`; read legacy methods as files for that workflow. Restart the conversation after migration to discard previously loaded legacy instructions.
<!-- forja-core:end -->
