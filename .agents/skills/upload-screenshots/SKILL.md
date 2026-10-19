---
name: upload-screenshots
description: "Use when putting screenshots or videos into a GitHub PR, issue, or comment."
---

`gh` uploads local images and videos with `--attach` on `gh pr create|edit|comment` and `gh issue create|edit|comment`. Uploading requires push access to the repo.

## Steps

1. **Capture** each screenshot to `/tmp/<branch>/`, outside the repo, so it never lands in a commit. Name files for what they show (`before-login.png`, `after-login.png`).
2. **Write the body** to a file (e.g. `/tmp/<branch>/body.md`) and reference each image by the exact path you will pass to `--attach`:

   ```markdown
   **Before:** ![login form shows a 500 error](/tmp/fix-login/before-login.png)
   **After:** ![login form renders](/tmp/fix-login/after-login.png)
   ```

   For a video, put `![](/tmp/fix-login/demo.mp4)` alone in its own paragraph to get a player; inside a sentence it renders as a bare link.

3. **Post** with one `--attach` per file:

   ```shell
   gh pr create --title "..." --body-file /tmp/fix-login/body.md \
     --attach /tmp/fix-login/before-login.png \
     --attach /tmp/fix-login/after-login.png
   ```

   `gh` rewrites each matching reference in place to the uploaded URL. Attached files the body never references are appended to the end of the body instead, so a misspelt path shows up as an image dumped at the bottom.

4. **Check** the exit status. Non-zero after a URL was printed means a partial upload: the PR/issue exists with only the files that succeeded. Re-run `gh pr edit <N> --body-file <body> --attach <every file>` to replace the body with a complete one.

Done when the command exits 0 and `gh pr view <N> --json body -q .body` contains no `/tmp/` paths.

## Rules

- Alt text comes from the Markdown reference. The `'path#alt text'` form on `--attach` applies only to appended (unreferenced) files. Videos take no alt text.
- Each file may be attached once per command; 50 files max.
- `gh pr edit` without `--body`/`--body-file` keeps the existing body and appends the attachments.
- Only image and video types upload; logs and other files go in the body as fenced text.
