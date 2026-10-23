# Coding standards

The rules code review checks, grounded in YAGNI and KISS.

## Contents

- [How to apply](#how-to-apply)
- [Design](#design)
  - [Build for today's caller](#build-for-todays-caller)
  - [Delete complexity, don't move it](#delete-complexity-dont-move-it)
  - [Every layer earns its keep](#every-layer-earns-its-keep)
  - [Special cases get their own home](#special-cases-get-their-own-home)
- [Structure](#structure)
  - [One reason to change](#one-reason-to-change)
  - [Code lives where its concept lives](#code-lives-where-its-concept-lives)
  - [Extract on the second copy](#extract-on-the-second-copy)
  - [Split a file before it passes 1,000 lines](#split-a-file-before-it-passes-1000-lines)
  - [Production modules export production API](#production-modules-export-production-api)
- [Types, state and errors](#types-state-and-errors)
  - [Make invalid states unreachable](#make-invalid-states-unreachable)
  - [Types state the real contract](#types-state-the-real-contract)
  - [Errors fail loudly](#errors-fail-loudly)
  - [Related updates land together](#related-updates-land-together)
- [Tests and comments](#tests-and-comments)
  - [Tests fail when the behaviour breaks](#tests-fail-when-the-behaviour-breaks)
  - [Comments say why and match the code](#comments-say-why-and-match-the-code)
- [Svelte](#svelte)
  - [Derive, don't sync](#derive-dont-sync)
  - [State only what is reactive](#state-only-what-is-reactive)
  - [Scope shared state](#scope-shared-state)
  - [Use the runes-era syntax](#use-the-runes-era-syntax)
  - [Markup and styling](#markup-and-styling)
- [Smells](#smells)

## How to apply

- Review the diff only; leave what `eslint.config.js` and `svelte-check` enforce to them.
- A rule (`###` heading) can be breached; cite it by heading. A smell is a judgement call: report "possible _Name_". A rule beats a smell.
- When rules conflict, fewer moving parts wins.

## Design

### Build for today's caller

Every new option, parameter, branch, fallback, config key and export has a caller in the same change. An abstraction (interface, generic helper, lookup map, extension point) arrives with its second real use. Smell: _Speculative Generality_.

### Delete complexity, don't move it

Before polishing working code, look for a reframing that makes a branch, flag, helper or layer unnecessary. A refactor that doesn't cut the concepts a reader must hold is not a simplification.

### Every layer earns its keep

A wrapper, pass-through or generic mechanism must make its callers simpler than calling what it wraps. Prefer plain code to a clever mechanism hiding a simple data shape. Smell: _Middle Man_.

### Special cases get their own home

Don't bolt an `if`, one-off boolean or nullable mode onto a shared flow for one caller. Give the case its own function or module, or fold it into the model so the branch disappears.

## Structure

### One reason to change

Each unit does one job: a route wires a request or page to `src/lib`, a component renders, a domain rule lives in one `src/lib` function. If its job needs an "and", split there. Smell: _Divergent Change_.

### Code lives where its concept lives

Shared code (`src/lib/*.ts`, `src/lib/server/*.ts`, `src/lib/components/shell/`) never imports from a feature folder (`marksheet`, `parse`, `report`); a feature helper with a second user moves up. Feature-specific checks stay in the feature. One module owns each decision, such as mapping an error to a status. Smell: _Shotgun Surgery_.

### Extract on the second copy

Logic that already exists (a predicate, normalisation, request pipeline, snapshot-then-mutate) is called or extracted, not rewritten. DRY applies to meaning, not text. A value used twice is one exported constant; values derived from it are computed. Smell: _Duplicated Code_.

### Split a file before it passes 1,000 lines

A change that takes a file past 1,000 lines splits it first, along "One reason to change" seams. Specs count.

### Production modules export production API

Export what production imports, plus a `set…`/`reset…` seam per injected dependency a spec must replace (pattern: `src/lib/server/openrouter.ts`). Spec-only stubs and constants live in `*.spec-helpers.ts` or the spec.

## Types, state and errors

### Make invalid states unreachable

Make the bad state impossible: lock later steps, or model status as one discriminated union (`phase: 'idle' | 'running' | …`), not repeated guards or flags that must agree.

### Types state the real contract

No `as`, `!`, `any` or optional parameter to quiet the compiler where a precise type fits. Outside data (`fetch`, `JSON.parse`, `localStorage`, model output) passes a checking function returning a typed value or a failure; never cast.

### Errors fail loudly

A `try` wraps only the call expected to fail; its `catch` handles that error and rethrows the rest. No `throw` to reach your own fallback, and no `?.`, `?? default` or empty catch that hides a bug.

### Related updates land together

State changes that must agree apply in one step. Independent async work runs in `Promise.all` unless order matters.

## Tests and comments

### Tests fail when the behaviour breaks

A test performs the action it names and asserts its effect: a reload test reloads, an undo test undoes, a "changing X leaves Y alone" test changes X. Reading back a fixture proves nothing.

### Comments say why and match the code

Comments explain intent or constraints the code can't show. A behaviour change updates its comments; delete comments that narrate history ("now uses Y").

## Svelte

Applies to `.svelte` and `.svelte.ts`. Runes mode is forced; ESLint enforces keyed `each` and writable `$derived`.

### Derive, don't sync

Compute from state or props with `$derived` (`$derived.by` for a function), never `$effect`; a prop-dependent value assigned once goes stale. This is the rule most often missed here. `$effect` is a last resort and never writes state: user-caused work goes in the event handler, external-library sync in `{@attach}`, observing outside sources in `createSubscriber`, logging in `$inspect`, one-shot setup reading no reactive state in `onMount`. Effects never run on the server, so no `if (browser)` inside one. `{#key}` remounts its whole subtree: use it for transitions only, not to rerun a child's script.

### State only what is reactive

`$state` only for values an effect, derived or template reads. Large objects that are only reassigned (API responses) use `$state.raw`. A `$derived` object or array is not deeply reactive.

### Scope shared state

Share state through `createContext`, not module-level state, which leaks between users under SSR. Share reactivity through classes with `$state` fields, not stores.

### Use the runes-era syntax

`{#snippet}`/`{@render}` over `<slot>`, `$$slots` and `<svelte:fragment>`; `onclick` over `on:click`; `<Dynamic>` over `<svelte:component>`; a self-import over `<svelte:self>`; `{@attach}` over `use:`; clsx-style `class` arrays and objects over `class:`.

### Markup and styling

- An `each` key uniquely identifies the item, never the index; don't destructure items you mutate.
- Listen on `window`/`document` with `<svelte:window>`/`<svelte:document>`, not `onMount` or `$effect`.
- Pass JS values to CSS with `style:--name`. Parents style children through CSS custom properties; `:global` only for library components.

## Smells

Fowler smells (_Refactoring_, ch. 3) no rule above covers. Quote the hunk.

| Smell                 | Sign                                                   | Fix                                        |
| --------------------- | ------------------------------------------------------ | ------------------------------------------ |
| _Mysterious Name_     | Name doesn't reveal what it does or holds.             | Rename; no honest name means murky design. |
| _Feature Envy_        | Function uses another object's data more than its own. | Move it to that data.                      |
| _Data Clumps_         | The same fields or parameters travel together.         | Bundle them into one type.                 |
| _Primitive Obsession_ | A primitive stands in for a domain concept.            | Give the concept its own type.             |
| _Repeated Switches_   | The same `switch`/`if` cascade on one value recurs.    | One shared map or function.                |
| _Message Chains_      | Callers walk `a.b().c().d()`.                          | Hide the walk behind one function.         |
| _Refused Bequest_     | An implementer ignores most of what it inherits.       | Use composition.                           |
