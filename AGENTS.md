## Svelte MCP tools

Comprehensive Svelte 5 and SvelteKit documentation via the Svelte MCP server.

### 1. list-sections

Call first, always, when asked about Svelte or SvelteKit topics. Returns a structured list of sections (titles, use_cases, paths).

### 2. get-documentation

Fetches full documentation for one or more sections. After `list-sections`, fetch every section whose `use_cases` matches the task — partial coverage is not done.

### 3. svelte-autofixer

Analyzes Svelte code, returns issues and suggestions. Run on every piece of Svelte code before sending it to the user; keep calling until it returns clean.

### 4. playground-link

Generates a Svelte Playground link. Offer it once code lives purely in the response; call it only after the user confirms.

## UI components

Prefer shadcn-svelte components when adding new features.

Resolve UI decisions — layout, placement, emphasis, labels, visual treatment — with a prototype, never in a grilling session. Grilling settles structure, invariants and what exists; anything whose answer depends on seeing it needs something concrete to react to, and gets iterated through testing. When a grilling session reaches a look-and-feel question, hand it to a prototype ticket and move on.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `edrobertsrayne/QLA`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Coding standards

Before writing or reviewing code, read `CODING_STANDARDS.md`: the judgement-call rules ESLint can't check. Code review checks every diff against it.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`. Lowercase, imperative description (`add`, not `added`). Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

## Models

Never assume anything about an LLM: its id, generation, price or capabilities. Before you name, add or change a model (the default, the curated list, or a plan), check the live OpenRouter listing:

`curl -s https://openrouter.ai/api/v1/models | jq -r '.data[] | select(.id|test("<name>")) | "\(.id)\t\(.pricing.prompt)\t\(.pricing.completion)\t\(.supported_parameters|join(","))"'`

There is one default model: `DEFAULT_MODEL_ID` in `src/lib/server/parse/pdf.ts`. Every model call resolves its id with `resolveModelId(override?)` (per-run override, else `OPENROUTER_MODEL`, else `DEFAULT_MODEL_ID`). Never add a per-route model constant. When the default changes, keep it first in `CURATED_MODELS` and priced in `CURATED_PRICING` (`src/lib/server/parse/models.ts`).

Pick the latest generation the listing shows, and pin its exact id rather than a `~…-latest` alias. A model called through the structured transport (`src/lib/server/openrouter.ts`) must list `structured_outputs` and `response_format`; the default must also accept native PDF input (`supportsNativePdf`).
