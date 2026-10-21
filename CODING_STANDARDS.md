# Coding standards

Judgement calls for the reviewer. Each rule came from a mistake a review caught or from the project's first principles, YAGNI and KISS; anything `eslint.config.js` or `svelte-check` already enforces is left to them. Apply these to the diff under review, not to untouched code, and when two rules pull apart, the design with fewer moving parts wins.

## Build for today's caller

Every new option, parameter, branch, fallback, config key and export has a caller in the same change. A new abstraction (an interface, a generic helper, a lookup map, an extension point) arrives with its second real use, which is the same moment "Extract on the second copy" fires. Between two designs that both work, choose the one with fewer moving parts.

## Delete complexity, don't move it

Working code is not done if a reframing would make a branch, flag, helper or layer unnecessary; look for that reframing before polishing what is there. A refactor that moves logic around without cutting the number of concepts a reader must hold is not a simplification.

## Extract on the second copy

When a change writes logic that already exists (a predicate, a normalisation, a request pipeline, a snapshot-then-mutate sequence), it calls or extracts the existing one. One rule lives in one function that the page, the store and the server share. DRY applies to meaning, not text: two passages that look alike but encode different rules stay separate. A limit or other value used in two places is one named, exported constant, and values derived from it are computed, not retyped.

## One reason to change

Each module, component and function does one job: a route wires a request or a page to `src/lib`, a component renders, and a domain rule lives in one `src/lib` function. When describing a unit's job needs an "and", split it along that "and".

## Code lives where its concept lives

Shared code (`src/lib/*.ts`, `src/lib/server/*.ts`, `src/lib/components/shell/`) never imports from a feature folder (`marksheet`, `parse`, `report`); when a feature helper gains a second user, move it to the shared level. Feature-specific checks stay in the feature, not in a shared path. One module owns each decision, such as turning an error into a status, rather than splitting it across a helper and its caller.

## Special cases get their own home

A change does not bolt a new `if`, one-off boolean or nullable mode onto an existing flow for one caller's sake. Give the case its own function or module, or fold it into the model (see "Make invalid states unreachable") so the branch disappears.

## Every layer earns its keep

A wrapper, pass-through helper or generic mechanism must make its callers simpler than calling the thing it wraps. Delete identity wrappers, and prefer plain code over a clever mechanism that hides a simple data shape.

## Split a file before it passes 1,000 lines

A change that pushes a file from under 1,000 lines to over it splits the file first, along the "One reason to change" seams. Specs count too.

## Make invalid states unreachable

Prefer a flow or a type in which the bad state cannot occur: lock the later steps, or model status as one discriminated union (`phase: 'idle' | 'running' | …`). Avoid a guard repeated on every action, or several flags that must agree.

## Types state the real contract

Do not use `as`, `!`, `any` or an optional parameter to quiet the compiler where a precise type would say what is true. Data from outside the program (`fetch` responses, `JSON.parse`, `localStorage`, model output) goes through a checking function that returns a typed value or a failure; it is never cast.

## Errors fail loudly

A `try` wraps only the call that is expected to fail, and its `catch` handles that expected error and rethrows anything else. Do not use `throw` to jump to your own fallback, and do not add a `?.`, `?? default` or empty catch that would hide a bug.

## Related updates land together

State changes that must agree are applied in one step, so a failure part-way cannot leave them half-applied. Independent async work runs together (`Promise.all`) unless its order matters.

## Tests fail when the behaviour breaks

An acceptance test performs the action it names and asserts its effect. A reload test writes and then reloads. An undo test undoes the action under test. A "changing X leaves Y alone" test actually changes X. A test that only reads back its own fixture proves nothing.

## Comments say why and match the code

A comment explains intent or a constraint the code cannot show. A change that alters behaviour updates the comments that describe it, and deletes comments that narrate history ("removed X", "now uses Y").

## Svelte

For any `.svelte` or `.svelte.ts` change, also apply `.agents/skills/svelte-core-bestpractices/SKILL.md` (the same text as https://svelte.dev/docs/svelte/best-practices); reviewers read it as part of these standards. ESLint and runes mode already enforce keyed `each`, writable `$derived` and the legacy-syntax bans. The judgement calls are left to review, and the one most often missed here is state written inside `$effect` that should be a `$derived`. Phase 3 shipped three of these. Side effects caused by a user action run in the event handler, and one-shot setup that reads no reactive state runs in `onMount`; `$effect` is only for keeping something outside Svelte in sync with state.

## Production modules export production API

A module exports what production code imports, plus a `set…`/`reset…` seam for each injected dependency (the existing pattern in `src/lib/server/openrouter.ts`). Stub data, stub transports and constants that only specs use live in a `*.spec-helpers.ts` file or in the spec itself. Add such a seam only when a spec needs to replace that dependency; production code calls its collaborators directly.
