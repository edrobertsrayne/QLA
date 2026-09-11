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
