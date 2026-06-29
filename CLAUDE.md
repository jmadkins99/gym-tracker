# gym_app — working agreements for Claude

## Push workflow — ALWAYS test in Firefox before pushing
Never run `git push` until the user has tested the change in their browser and
explicitly approved. Before asking for that approval:
1. Ensure the localhost server is running (from the repo root, in the
   background): `python3 -m http.server 8000`
2. Open the app in the user's browser: `firefox "http://localhost:8000/index.html"`
3. Tell the user to hard-refresh (Ctrl+Shift+R) and wait for their explicit
   "push it" before committing/pushing.

## Cache-busting
Whenever you change any file under `js/` or `css/`, bump the `?v=NN` query on
every `<script>`/`<link>` in `index.html`. Without it, the user's browser and
production (GitHub Pages) users serve stale cached code.

## Tests
Run the suite before pushing (the pre-push git hook also enforces this). Keep
cardio/full-body tests weekday-independent by selecting the day type explicitly
in tests.

ALWAYS show the user the full suite results on every push. IMPORTANT: the user's
terminal collapses ALL tool/command output (Bash, Read, etc.) to a one-line
summary like "Ran 1 shell command" — `cat`/`echo`/`grep` of the output do NOT
reach their screen. The ONLY thing they see is the assistant's reply text. So:
run the suite, read its output yourself, then TRANSCRIBE the per-test PASS/FAIL
lines (or at minimum the failures + the "N/N passed" line) into your reply as a
code block.
