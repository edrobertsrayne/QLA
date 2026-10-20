---
name: retro
description: "Turn recurring review findings and agent struggles on a branch into lint rules or coding standards."
disable-model-invocation: true
---

A retro changes the environment, not the code. It finds mistakes that **recur** on a branch and proposes the cheapest permanent catch for each. It only proposes; nothing changes until the user picks.

## Steps

1. **Gather evidence** for the branch the user names (default: the current one).
   - `git log --oneline main..HEAD`. `fix`/`refactor` commits after the `feat` commits are review fallout.
   - Session logs in `~/.omp/agent/sessions/-Projects-QLA/*.jsonl` from the branch's time window. A subagent's report sits in the sibling directory of the same name (e.g. `<session>/StandardsReview-5.md`). Extract with `jq`; never read a whole log. User prompts: `jq -r 'select(.message.role=="user") | .message.content | if type=="string" then . else (map(.text? // empty) | join(" ")) end'`. Failed tool calls: `select(.message.role=="toolResult" and .message.isError)`.
   Done when every review report on the branch is read and every implementation session has been checked for failed checks and user corrections.

2. **Cluster** findings into classes. Keep a class only if it **recurs**: 2+ instances, or raised by more than one review. Every instance cites a session file and timestamp, a review report line, or a commit. Discard anything you cannot cite.

3. **Classify** each class, in this order:
   - **Already caught**: an existing check fired, or exists but is unwired. The finding is the wiring, not a new rule.
   - **Mechanical**: a fixed pattern (banned API, import shape, size). Propose a rule from ESLint core or an installed plugin for `eslint.config.js`'s retro block. Dry-run it with `npx eslint --rule '<json>' src`. Propose it only if the tree is clean or the hits are real bugs (list them). A new dependency is its own candidate, flagged as such.
   - **Judgement**: propose one `CODING_STANDARDS.md` section: a heading that states the target behaviour, then at most three sentences.
   - **Outside the repo**: harness or tool bugs. Report them; propose no repo change.

4. **Prune**: list any `CODING_STANDARDS.md` rule or retro-block lint rule that fired on good code, or never bore on this branch, as a removal candidate.

5. **Present** candidates most severe first, each with its evidence, class and exact proposed text or rule. Wait for the user's picks, then apply only those.
