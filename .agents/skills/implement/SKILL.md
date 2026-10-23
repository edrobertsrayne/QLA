---
name: implement
description: "Ship a GitHub issue or feature end to end: branch, test-first build, spec check, code review, then push or PR. Use when asked to implement or ship an issue or feature."
---

Ship issue `#N` end to end. You are the **orchestrator**: subagents read and write the code; you run `git` and `gh` and keep only their reports. A report is a claim; `git` is the evidence.

**Agents.** Name the agent in every `task` call; an omitted agent runs as `task`.

| Work                                         | Agent               |
| -------------------------------------------- | ------------------- |
| Implementation, fixes needing judgement      | `task`              |
| Mechanical fixes (renames, moves, constants) | `sonic`             |
| Spec check                                   | `scout`             |
| Code review                                  | `reviewer`          |
| Security audit                               | `security-reviewer` |

**One commit.** Every brief that edits code says: commit, stash and reset nothing. After each editing agent, run `git add -N .` so new files show in `git diff main`.

**Files.** Save the issue once: `gh issue view <N> --comments > local://implement-<N>-issue.md`. The spec is its latest Agent Brief plus later maintainer comments. Before each check or review, save `git diff main` to `local://implement-<N>-diff.patch`. Briefs point at these two files; reports go to `local://implement-<N>-<step>.md`.

## 1. Branch

Given a feature with no issue, open one with `gh issue create`: the request plus testable acceptance criteria, which you confirm with the user first. Use its number from here on.

Stop if the issue is closed. From a clean, up-to-date `main`, create `<type>/<N>-<slug>`: `fix` for a `bug` label, otherwise `feat`.

## 2. Implement

One `task` implements the spec test-first: red-green, one acceptance criterion at a time, each criterion a seam. Brief it to:

- follow `AGENTS.md` and `CODING_STANDARDS.md`;
- typecheck and run single spec files while working, then the full suite and lint once at the end;
- smoke any changed UI in the browser;
- report the evidence for each acceptance criterion and a commit subject, `<type>(<scope>): <description>`.

On a return from step 3, add the spec-check report to the brief; the agent closes those gaps.

## 3. Spec check

One `scout` compares the saved patch with the saved issue. Brief: report (a) acceptance criteria missing or partial, (b) behaviour the spec did not ask for, (c) criteria that look implemented but behave wrongly. Quote the spec line and cite file and line for each. End with a verdict, `match` or `mismatch`.

On `mismatch`, return to step 2. After the third `mismatch`, stop and report; push nothing.

## 4. Code review

Run one `reviewer` over the saved patch. In the same batch, run a `security-reviewer` when the diff crosses a trust boundary: `src/lib/server/`, any `+server.ts`, `*.server.ts` or `hooks.*.ts`, `package.json` dependencies, `{@html}`, or parsing of outside data (uploads, model output, `localStorage`).

Both report only defects the diff introduces, each cited by file and a line range inside the diff, with a priority:

- `P0`: data loss, security hole or crash.
- `P1`: wrong behaviour.
- `P2`: a `CODING_STANDARDS.md` breach or a maintainability cost.
- `P3`: a judgement-call smell or nit.

The `reviewer` brief covers:

- **Standards:** every rule and smell in `CODING_STANDARDS.md`, including its Svelte rules for `.svelte` and `.svelte.ts` files.
- **Correctness:** provable bugs. Follow changed values across module boundaries to the code that receives them.
- **Gate:** whether rendered output a user would see changes, and whether stored data changes: what is persisted or how it is read back (`MarksheetDocument`, `DOCUMENT_SCHEMA_VERSION`, `parseStoredDocument`, `STORAGE_KEY` in `src/lib/marksheet/document.ts`, the backup file format).

Fix every `P0`–`P2` finding, `P0` first, with `sonic` or `task` by size; fixers rerun the full suite and lint. Then save a fresh patch and rerun the same reviewers. The review is **clean** when no `P0`–`P2` finding is open. After two fix rounds, carry any open findings to step 5. `P3` findings stay unfixed and are listed in the report.

## 5. Commit and ship

Commit everything as one commit: the proposed subject, with body `Closes #<N>`. If the hook fails, have a `task` fix the cause and retry once; if it fails again, stop with the work staged.

A **human confirms** the change when any of these holds:

- the reviewer reports a visible UI or stored-data change;
- the security audit reported any finding;
- a `P0`–`P2` finding is still open;
- you doubt the change is safe to ship unseen.

Either way, first rebase the branch onto `origin/main`; on conflict, abort and stop.

- **No human:** fast-forward `main` to the branch, push, and delete the branch. The issue closes through `Closes #<N>`.
- **Human:** push the branch. Write the body with the `pr` skill (screenshots through `upload-screenshots` when the UI changed), listing open findings and the reason a human is needed, ending with `Closes #<N>`. Open the PR against `main`, titled with the commit subject.

## 6. Report

- the route taken (main or PR) and why;
- the commit SHA or the PR URL;
- rounds taken in steps 2–3 and step 4;
- finding counts per reviewer and priority;
- open and `P3` findings.
