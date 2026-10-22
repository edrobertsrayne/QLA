# QLA

## Simplest thing that works

QLA is a small personal project. YAGNI and KISS come first: build what the current task asks for, in the most boring shape that works, and leave the future to the change that needs it. DRY and single responsibility serve that aim. `CODING_STANDARDS.md` turns these into the rules code review checks; read it before writing or reviewing code.

## Svelte

For any `.svelte` or `.svelte.ts` work, use the Svelte MCP server. Call `list-sections`, then `get-documentation` for every section whose `use_cases` match the task. Then run `svelte-autofixer` on each changed component until it returns clean.

## UI

Build new UI from shadcn-svelte components. Settle look and feel (layout, placement, emphasis, labels, visual treatment) with a prototype, and iterate by testing it. Grilling settles structure, invariants and what exists. When grilling reaches a look-and-feel question, it becomes a prototype ticket.

## Models

Treat what you know about any LLM (its id, generation, price, capabilities) as stale. Before you name, add or change a model, check the live OpenRouter listing:

`curl -s https://openrouter.ai/api/v1/models | jq -r '.data[] | select(.id|test("<name>")) | "\(.id)\t\(.pricing.prompt)\t\(.pricing.completion)\t\(.supported_parameters|join(","))"'`

- Pick the latest generation the listing shows, and pin its exact id rather than a `~…-latest` alias.
- A model called through the structured transport (`src/lib/server/openrouter.ts`) must list `structured_outputs` and `response_format`.
- `DEFAULT_MODEL_ID` in `src/lib/server/parse/pdf.ts` is the one default. Every model call resolves its id with `resolveModelId(override?)`: the per-run override, else `OPENROUTER_MODEL`, else the default.
- When the default changes, it must accept native PDF input (`supportsNativePdf`), stay first in `CURATED_MODELS`, and stay priced in `CURATED_PRICING` (`src/lib/server/parse/models.ts`).

## Agent skills

### Issue tracker

GitHub issues in `edrobertsrayne/QLA`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

`CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`, where type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`. Write the description in lowercase and the imperative (`add`). Mark a breaking change with `!` or a `BREAKING CHANGE:` footer.

Changes to agent skills (`.agents/skills/`, `skills-lock.json`) are a `chore`, not a `feat`.
