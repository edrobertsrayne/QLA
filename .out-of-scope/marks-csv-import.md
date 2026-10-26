# Importing marks from a CSV file

QLA does not import marks from a file. Marks come in by typing in the marksheet grid or by pasting a block copied from a spreadsheet.

## Why this is out of scope

**Paste already does the job.** A block copied from Excel or Sheets can be pasted into the marksheet. Pasted from the name column, its first column is read as names, its rows line up with that tier's students in order, and rows past the class become new students. Pasted from a mark cell, it fills marks from that entry onwards. Non-numbers are skipped and reported, blanks clear a mark, extra columns are clipped, and over-max marks are counted: the same rules as typing. A teacher holding a CSV opens it in a spreadsheet, copies, and pastes. A file import would save that one copy.

**The marks export is one-way on purpose.** The obvious file to import is QLA's own marks export, but `CONTEXT.md` defines it as lossy, a file that "cannot be restored from". That keeps the **backup** as the only file that brings a marksheet back, so a teacher never mistakes a spreadsheet for a copy of their work. Reading the export back in would blur that line.

**One rule for which row is which student.** Paste matches rows to students by position. A file import that matches by name, as proposed, would be a second rule, and one that has to handle duplicate names, different spellings and surname/first-name order.

## When to reconsider

If teachers need to bring in marks from a source that cannot be opened in a spreadsheet and copied (for example, a school system that only hands out files), revisit this. The shape to start from is a thin "Open CSV…" that reads the file and sends its rows through the existing paste path, with paste's rules and matching. Not a separate import with its own rules.

## Prior requests

- #156: "Import marks from a CSV file"
