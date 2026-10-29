---
name: grill-me
description: Interviews the user one question at a time, walking a design tree, to settle a plan or design before any work starts. Use when the user says "grill me", asks to stress-test or pressure-test a plan, or wants open decisions resolved before implementing.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it. A decision is **decided** once the user has answered it; a fact is **known** once you have found it.

The **frontier** is every decision whose prerequisites are all decided or known: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask **one question at a time** from the frontier, then wait for the answer. Recompute the frontier after each answer, since decided questions unblock the ones that depended on them.

Skip any question whose answer wouldn't change the plan.

## Asking a question

Ask every question as plain text in the chat. Never use a multiple-choice picker or any other question-asking tool: the user answers in their own words and may choose none of your options.

Each question has three parts:

1. **Options:** a short summary of the choices open to the user, with the pros and cons of each where they differ.
2. **Recommendation:** the option you would pick.
3. **Reasoning:** why, tied to the facts you know about this project.

For a minor decision, one line per part is enough.

Example:

> **Where should retries live?**
>
> **Options**
> - Client: every caller gets retries for free and there are no new states, but a slow upstream blocks the request thread.
> - Job queue: callers stay fast, but they must handle "pending" results and it adds moving parts.
>
> **Recommendation:** the client.
>
> **Reasoning:** current traffic is low, so blocking is not a problem, and the queue adds states nothing else needs.

## Facts and decisions

Finding _facts_ is your job, never the user's. When a question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration leaves its fact unknown, so only the questions downstream of it wait; ask a question that doesn't depend on it meanwhile. The _decisions_ are the user's: put each to them and wait.

Look and feel (layout, placement, emphasis, labels, visual treatment) is not a grilling topic. Record it as a prototype ticket instead of asking.

## Finishing

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Then give the user a short list of every decision, plus any assumption you made, and ask them to confirm. Do not act on any of it until they confirm.
