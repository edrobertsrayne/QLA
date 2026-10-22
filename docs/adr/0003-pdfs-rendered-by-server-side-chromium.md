# 0003. PDFs rendered by server-side headless Chromium

## Status

Accepted

## Context

Reports and the question analysis can be printed, and a teacher can "Save as
PDF" from the browser's print dialog. The maintainer wants a true PDF download
beside Print, for one report, for a whole class (one PDF or a zip of one per
student) and for the analysis.

The PDF must look exactly like the print: the same markup, the same print CSS,
the same fit and scale. A client-side PDF library would need the A4 report
layout and the analysis layout drawn a second time in its own vocabulary, and
the two would drift.

## Decision

Render PDFs on the server with headless Chromium, through one route,
`POST /api/pdf`.

- The browser sends the self-contained HTML of what Print would print: the
  printed elements, every stylesheet of the page, and the fonts the page loaded
  as data URLs. The server loads it with `page.setContent` and answers
  `page.pdf({ preferCSSPageSize: true })`, A4 when the document names no size.
- The HTML is untrusted, in the spirit of ADR 0001. Chromium runs with
  JavaScript disabled and every network request blocked, so nothing in the
  payload can reach the network or the host. The body is size-capped
  (`MAX_PDF_HTML_BYTES`) while it is read, a render has a timeout, and request
  bodies and PDFs are never logged.
- One Chromium is launched on first use and reused; each render gets its own
  throwaway context. A zip of thirty students is thirty renders in one browser,
  not thirty launches.
- Playwright is a runtime dependency. The report and analysis pages stay
  client-rendered; only the PDF files are made on the server.
- The analysis CSV is built in the browser as a pure `QlaFile`, like the marks
  export, and is not part of this route.

## Consequences

- Report and analysis content, including student names and feedback, leaves the
  browser for this feature. Print and the CSVs still do not send anything. This
  is a deliberate exception, accepted because the alternative is a second
  layout.
- The production host must have Chromium available to the Node process, for
  example `npx playwright install --with-deps chromium` in the deploy.
- Any change to the print CSS changes the PDF with it: there is nothing to keep
  in step.
- A server that cannot launch Chromium fails PDF downloads only; everything else
  keeps working.
