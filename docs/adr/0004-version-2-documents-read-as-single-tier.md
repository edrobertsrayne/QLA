# 0004. Version 2 documents are read as single-tier assessments

## Status

Accepted

## Context

The stored document (browser storage and backup files alike) has had no
shape-conversion machinery. Version 1 was simply declared unreadable when
version 2 arrived; that cost nothing because nothing was in live use yet.
Version 2 and the flat version 3 that followed it stored the same shape, so
one reader accepted both — neither needed a conversion.

Tiered assessments change the stored shape: one paper becomes an
**assessment** holding one or two **tiers**, each with its own breakdown and
grade boundaries. By then version 2 documents and backups hold real class
data, and declaring them unreadable would strand it.

## Decision

The app reads a version 2 document, from storage or a backup, by converting
it on load into an assessment with a single tier: the old paper becomes that
tier, with a blank tier name, its breakdown and grade boundaries; marks,
topic names, AO descriptions and reports carry over unchanged; there are no
common questions. The next save writes the new version. A version 3 document
written before tiers existed has the same flat shape, and is read as one tier
too.

## Consequences

- No live class data or existing backup is lost on upgrade.
- The conversion is lossless because a single-tier assessment is exactly the
  old shape; that only holds because an untiered paper is modelled as a
  one-tier assessment rather than as a separate case.
- This is the app's one migration step, 2 → new. It is not a promise that
  later schema bumps will migrate: each later bump decides that afresh.
