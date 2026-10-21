---
name: review-pr
description: Review a PR against CODING_STANDARDS.md, post the findings, fix each one in its own commit, then push and re-verify.
disable-model-invocation: true
---

Take the PR on the current branch through review, fixes and re-verification. Argument: the PR number (default: the PR for the current branch).

## 1. Pin the PR

`gh pr view <N> --json number,baseRefName,headRefName`. Work on the head branch with a clean tree (`git status --short` is empty).

Done when `git diff <base>...HEAD` is non-empty and both refs resolve.

## 2. Review

Spawn one subagent on the strongest available model, in a fresh context so the reviewer is not the author. Brief:

- The rulebook is `CODING_STANDARDS.md`, plus `.agents/skills/svelte-core-bestpractices/SKILL.md` when the diff touches `.svelte` or `.svelte.ts` files. Nothing else.
- Review `git diff <base>...HEAD`. Flag only lines the diff adds or changes, and skip anything `npm run lint` or `npm run check` already catches.
- Each finding names the standard it breaks by its heading. A problem no standard covers goes in an unnumbered **Outside the standards** list at the end; this skill does not fix those (they are `retro` material).
- Before writing a finding, reread the code it cites and confirm the problem is real. Drop it if you can't.
- Order findings by leverage: a fix that deletes a branch, layer or file comes before a rename. No style nits.
- Write `local://review-<N>.md`. A review with no findings lists the standards it checked.

Every finding in that file is numbered and carries:

- **Problem** and **fix**.
- **Standard**: the `CODING_STANDARDS.md` heading it breaks.
- **Files** it touches.
- **behaviour:** `none`, or the change.
- **size:** `mechanical` (moves, renames, named constants) or `judgement` (restructuring).
- **after:** the findings it depends on.

Done when every finding has all six fields.

## 3. Post and gate

`gh pr comment <N> --body-file local://review-<N>.md`, then ask the user once which findings to apply (default: all). Apply only the approved set.

## 4. Fix loop

Run the approved findings one at a time, in `after` order. Put findings that change shared code first: later fixes edit the same files.

Per finding, one subagent: `sonic` for `mechanical`, `task` for `judgement`. Its brief is the finding, plus:

1. Make that one fix.
2. Update any test that pins the old behaviour. When `behaviour` is not `none`, add a test for the new behaviour.
3. Run the targeted tests and `npm run check`.
4. Commit with a Conventional Commit message (`refactor(scope): ...`).

The commit hook runs the full suite, so there is no separate full run per fix.

Before the next finding, check the commit yourself: `git show --stat HEAD` lists the files the finding named, and `git status --short` is empty. A subagent's report is not evidence. If the check fails, stop and report.

## 5. Ship

1. `git push`.
2. `npm test`, `npm run check`, `npm run lint`.
3. Smoke the changed surface: run it live if a route or the UI changed. Screenshots go through `upload-screenshots` only when the UI changed visibly.
4. Update the PR body's Evidence section with `gh pr edit <N> --body-file`, following the `pr` skill.

Done when the tests pass, the smoke ran, and the PR body reflects the fixes.
