---
name: ship-issue
description: "Take a GitHub issue through tdd, code review and one commit, then push to main or open a PR."
disable-model-invocation: true
---

Ship issue `#N` end to end. You are the **orchestrator**: subagents read and write the code, and you keep only reports and `git` output. A report is a claim; `git` is the evidence.

**Agents** (OMP bundled, so each step follows its role):

- `reviewer` for every judgement: reviews and the classifier.
- `task` for implementation and fixes that need judgement. Use `designer` instead when the issue is mostly look and feel.
- `sonic` for mechanical fixes: renames, moves, named constants.

**One commit.** Nothing is committed, stashed or reset until step 6; say so in every brief that edits code. After any subagent edits code, run `git add -N .` so new files show in `git diff main`.

**Inputs.** Save the issue once with `gh issue view <N> --comments > local://ship-<N>-issue.md`. The spec is its latest Agent Brief plus later maintainer comments. Before each review, save `git diff main` to `local://ship-<N>-diff.patch`. Review briefs point at these two files. Reports go to `local://ship-<N>-<step>.md`.

## 1. Pin

Stop if the issue is closed. From a clean, up-to-date `main`, create `<type>/<N>-<slug>`: the type is `fix` for a `bug` label, otherwise `feat`.

## 2. Implement

One agent implements the spec using `/tdd`. The acceptance criteria are the agreed seams. Brief it to:

- follow `AGENTS.md` and `CODING_STANDARDS.md`;
- typecheck and run single spec files regularly, then the full suite and lint once at the end;
- smoke any changed UI in the browser;
- report the evidence for each criterion and a proposed commit subject, `<type>(<scope>): <description>`.

## 3. Code review

Run `/code-review` with these overrides:

- **Diff:** the fixed point is `main` and the diff is the saved patch. There is no commit list.
- **Spec:** the saved issue.
- **Agents:** both sub-agents are `reviewer`.

If there are findings, fix them in one round with `sonic` or `task` by size. Then review once more. If Spec findings are still open after that, stop and report; push nothing.

## 4. Gate

A change is **trivial** when `git diff --numstat main -- . ':(exclude)*.spec.ts' ':(exclude)*.spec-helpers.ts'` shows one modified file with 40 or fewer changed lines. If it is trivial, skip step 5.

## 5. Correctness review

Run one `reviewer` over the saved patch against the issue's intent. Brief it with this contract:

- A finding is a provable, actionable, unintended bug that the patch introduces, cited by file and a line range inside the diff. Follow changed values across module boundaries to the code that receives them. For `.svelte` files, use `svelte-core-bestpractices` to judge reactivity and lifecycle bugs.
- Ignore style, naming, documentation and pre-existing defects. Step 3 has already checked standards.
- Give each finding a priority (`P0`–`P3`), a confidence from 0 to 1, the trigger and the impact. End with a verdict, `correct` or `incorrect`, plus its confidence.

Fix every `P0`–`P2` finding, `P0` first, with `sonic` or `task` by size. Leave `P3` findings unfixed and list them in the report. A fix may be skipped only where it would contradict the spec, and the skip is noted.

## 6. Commit

Commit everything as one commit: the proposed subject, with body `Closes #<N>`. If the hook fails, have a `task` fix the cause and retry once. If it fails again, stop with the work staged.

## 7. Classify

Save `git diff main...HEAD`, excluding spec files, to `local://ship-<N>-final.patch`. Run one `reviewer` over it. Brief: each of these is a finding; report nothing else.

- **Visible UI:** rendered output a user would see changes in `src/routes/**` or any `.svelte` file.
- **Stored data:** a change to what is persisted, or how it is read back. This covers `MarksheetDocument`, `DOCUMENT_SCHEMA_VERSION`, `parseStoredDocument` and `STORAGE_KEY` in `src/lib/marksheet/document.ts`, and the backup file format.
- **Doubt:** anything it is unsure about.

With no findings, go to step 8. With any finding, go to step 9.

## 8. Push to main

Rebase the branch onto `origin/main` (on conflict, abort and stop). Fast-forward `main` to it, push, and delete the branch. The issue closes through `Closes #<N>`.

## 9. Open a PR

Rebase as in step 8, then push the branch. A `task` writes the body with the `pr` skill (screenshots through `upload-screenshots` when the UI changed), ending with `Closes #<N>`. It then opens the PR against `main`, titled with the commit subject.

## 10. Report

Report:

- the route taken (main or PR);
- the commit SHA or the PR URL;
- the review finding counts;
- any skipped findings;
- any unfixed `P3` findings.
