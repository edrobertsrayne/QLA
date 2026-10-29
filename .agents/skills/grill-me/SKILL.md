---
name: grill-me
description: Interviews the user one question at a time, walking a design tree, to settle a plan or design before any work starts. Use when the user says "grill me", asks to stress-test or pressure-test a plan, or wants open decisions resolved before implementing.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it. A decision is **decided** once the user has answered it; a fact is **known** once you have found it.

The **frontier** is every decision whose prerequisites are all decided or known: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask **one question at a time** from the frontier, then wait for the answer. Recompute the frontier after each answer, since decided questions unblock the ones that depended on them.

Skip any question whose answer wouldn't change the plan.

## Asking a question

For a decision with real tradeoffs, explain its implications, lay out the options with their advantages and disadvantages, and give your recommendation with the reasons for it. For a minor decision, one line plus your recommendation is enough.

Example:

> **Where should retries live?** If the client retries, every caller gets it for free but a slow upstream blocks the request thread; if the job queue retries, callers stay fast but must handle "pending" results.
> - Client: simpler, no new states.
> - Queue: more moving parts, better under load.
>
> Recommend the client: current traffic is low and it adds no new states.

## Facts and decisions

Finding _facts_ is your job, never the user's. When a question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration leaves its fact unknown, so only the questions downstream of it wait; ask a question that doesn't depend on it meanwhile. The _decisions_ are the user's: put each to them and wait.

Look and feel (layout, placement, emphasis, labels, visual treatment) is not a grilling topic. Record it as a prototype ticket instead of asking.

## Finishing

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Then give the user a short list of every decision, plus any assumption you made, and ask them to confirm. Do not act on any of it until they confirm.
