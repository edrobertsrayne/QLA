# Screenshots

Every UI change gets screenshots of each changed screen, before and after, in light and dark mode. Capture them to `/tmp/<branch>/`, outside the repo.

## Capture

1. Serve the change: `npm run dev -- --port 5173`.
2. Serve the base in a worktree:

   ```shell
   git worktree add /tmp/<branch>/base origin/main
   ln -s "$PWD/node_modules" /tmp/<branch>/base/node_modules
   (cd /tmp/<branch>/base && npx vite dev --port 5174)
   ```

3. Run the capture script once per screen and side:

   ```shell
   node .agents/skills/pr/screenshot.mjs http://localhost:5174/<path> /tmp/<branch> before-<screen>
   node .agents/skills/pr/screenshot.mjs http://localhost:5173/<path> /tmp/<branch> after-<screen>
   ```

   Each run writes `<name>-light.png` and `<name>-dark.png`. If launch fails with `Executable doesn't exist`, run `npx playwright install chromium`, or set `CHROMIUM_PATH` to a Chromium already on the machine. A screen that needs state (an uploaded class, an open dialog) needs a Playwright script that drives the page there before capturing; reuse `screenshot.mjs` as its starting point.

4. Open each PNG and confirm it shows the changed screen, not an error page or an empty state.
5. Lay them out as a table under Evidence:

   ```markdown
   |        | Before                                | After                                |
   | ------ | ------------------------------------- | ------------------------------------ |
   | Light  | ![x before, light](/tmp/<branch>/before-x-light.png) | ![x after, light](/tmp/<branch>/after-x-light.png) |
   | Dark   | ![x before, dark](/tmp/<branch>/before-x-dark.png)   | ![x after, dark](/tmp/<branch>/after-x-dark.png)   |
   ```

   The alt text in each reference is what GitHub keeps.

6. Remove the worktree: `git worktree remove /tmp/<branch>/base`.

A brand-new screen has no before; show the after alone. If capture fails, write under Evidence which screen is missing and the error, and fall back to test runs.

## Upload

`gh` uploads images with `--attach`, which needs push access to the repo and a `gh` whose `gh pr create --help` lists `--attach`; upgrade `gh` if it doesn't.

1. Reference each image in the body by the exact path you will pass to `--attach` (the table above does this). `gh` replaces each referenced path with the uploaded URL in place.
2. Post with one `--attach` per file:

   ```shell
   gh pr create --title "..." --body-file /tmp/<branch>/body.md \
     --attach /tmp/<branch>/before-x-light.png \
     --attach /tmp/<branch>/after-x-light.png \
     --attach /tmp/<branch>/before-x-dark.png \
     --attach /tmp/<branch>/after-x-dark.png
   ```

   To update an existing PR, use `gh pr edit <N> --body-file /tmp/<branch>/body.md` with the same `--attach` flags.

3. Check: `gh pr view <N> --json body -q .body | grep /tmp/` prints nothing. An attached file the body never references is appended to the end of the body, so an image at the bottom means a path in the body is misspelt: fix the path and re-run `gh pr edit` with every `--attach`.

Only images and videos upload, and each file attaches once per command. For a video, put `![](/tmp/<branch>/demo.mp4)` alone in its own paragraph to get a player.
