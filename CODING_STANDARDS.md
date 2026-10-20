# Coding standards

Judgement calls for the reviewer. Each rule came from a mistake a review caught or from the project's first principles, YAGNI and KISS; anything a linter can check lives in `eslint.config.js` instead. Apply these to the diff under review, not to untouched code, and when two rules pull apart, the design with fewer moving parts wins.

## Build for today's caller

Every new option, parameter, branch, fallback, config key and export has a caller in the same change. A new abstraction (an interface, a generic helper, a lookup map, an extension point) arrives with its second real use, which is the same moment "Extract on the second copy" fires. Between two designs that both work, choose the one with fewer moving parts.

## Extract on the second copy

When a change writes logic that already exists (a predicate, a normalisation, a request pipeline, a snapshot-then-mutate sequence), it calls or extracts the existing one. One rule lives in one function that the page, the store and the server share. DRY applies to meaning, not text: two passages that look alike but encode different rules stay separate.

## One reason to change

Each module, component and function does one job: a route wires a request or a page to `src/lib`, a component renders, and a domain rule lives in one `src/lib` function. When describing a unit's job needs an "and", split it along that "and".

## Tests fail when the behaviour breaks

An acceptance test performs the action it names and asserts its effect. A reload test writes and then reloads. An undo test undoes the action under test. A "changing X leaves Y alone" test actually changes X. A test that only reads back its own fixture proves nothing.

## Make invalid states unreachable

Prefer a flow or a type in which the bad state cannot occur: lock the later steps, or model status as one discriminated union (`phase: 'idle' | 'running' | …`). Avoid a guard repeated on every action, or several flags that must agree.

## Svelte

For any `.svelte` or `.svelte.ts` change, also apply `.agents/skills/svelte-core-bestpractices/SKILL.md` (the same text as https://svelte.dev/docs/svelte/best-practices); reviewers read it as part of these standards. ESLint and runes mode already enforce keyed `each`, writable `$derived` and the legacy-syntax bans. The judgement calls are left to review, and the one most often missed here is state written inside `$effect` that should be a `$derived`. Phase 3 shipped three of these.

## Production modules export production API

A module exports what production code imports, plus a `set…`/`reset…` seam for each injected dependency (the existing pattern in `src/lib/server/openrouter.ts`). Stub data, stub transports and constants that only specs use live in a `*.spec-helpers.ts` file or in the spec itself. Add such a seam only when a spec needs to replace that dependency; production code calls its collaborators directly.
