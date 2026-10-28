# Coding standards

QLA's own rules on top of YAGNI and KISS. Review the diff only; ESLint, `svelte-check` and the tests cover the rest. Cite a breached rule by its bold name. When rules conflict, fewer moving parts wins.

## Design

- **Build for today's caller.** Every new option, parameter, branch, config key and export has a caller in the same change. An abstraction arrives with its second real use.
- **Special cases get their own home.** A one-caller `if`, flag or nullable mode gets its own function, or folds into the model so the branch disappears.

## Structure

- **Shared code stays shared.** `src/lib/*.ts`, `src/lib/server/*.ts` and `src/lib/components/shell/` import nothing from a feature folder (`marksheet`, `parse`, `report`). A feature helper with a second user moves up.
- **Files stay under 1,000 lines**, specs included. A change that would cross the line splits the file first.
- **Production modules export production API**, plus a `set…`/`reset…` seam per dependency a spec replaces (pattern: `src/lib/server/openrouter.ts`). Spec-only stubs live in `*.spec-helpers.ts` or the spec.

## Types, state and errors

- **Outside data is checked.** `fetch`, `JSON.parse`, `localStorage` and model output pass a checking function that returns a typed value or a failure. Types state the real contract, with no `as`, `!` or `any` to quiet the compiler.
- **Status is one union** (`phase: 'idle' | 'running' | …`), so invalid states are unreachable.
- **Errors fail loudly.** A `catch` handles the error it expects and rethrows the rest. Defaults (`?.`, `??`) are for values that are genuinely optional.
- **Tests perform the action they name** and assert its effect: a reload test reloads, an undo test undoes.

## Svelte

- **Derive, don't sync.** The rule most often missed here. Compute from state or props with `$derived`. User-caused work goes in the event handler; `$effect` is a last resort and writes no state.
- **Shared state goes through `createContext`.** Module-level state leaks between users under SSR.
- **Write Svelte 5 syntax:** snippets, `onclick`, `{@attach}`, class arrays.
