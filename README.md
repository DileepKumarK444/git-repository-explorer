# Git Repository Explorer

A local, read-only-by-default visual Git explorer. It runs on your machine, talks only to the Git on your machine,
sends nothing anywhere, and has no telemetry. Think GitLens, but as a standalone app.

**Status: all six phases complete (v0.1.0).** See `docs/ARCHITECTURE.md` for how it is built, and `docs/ui-prototype.html`
for the original design prototype.

## Features
- **Dashboard:** open a repository by path or folder dialog (macOS), recent and favourite repositories with live status.
- **Overview, Files, Commits, Branches:** read-only exploration. File viewer (Monaco) with inline blame and file history,
  commit graph with filters and lazy loading, branch list with upstream and ahead/behind.
- **Changes and Compare:** staged and unstaged diffs (split or unified), branch, commit and working-tree comparison.
- **Git management:** stage, unstage, discard, commit, create/checkout/rename/delete branches, fetch, pull (fast-forward only), push (never forced).
- **Search, Tags, Stashes, Insights:** content search (case, whole word, regex, types, excludes), tags, stashes, activity charts.
- **Command palette** (Ctrl/Cmd+K), keyboard shortcuts, right-click menus, light/dark/system theme, and a Settings screen.

## Requirements
Git, Python 3.10+, Node 20+. The native folder picker works on macOS; elsewhere paste the path.

## Run
```bash
./dev.sh          # backend on http://127.0.0.1:8787 serving the built frontend
./dev.sh dev      # backend + Vite dev server on http://localhost:5173 (hot reload)
```
The first run builds the frontend (`cd frontend && npm install && npm run build`). Rebuild after frontend changes.

## Test
```bash
cd backend && .venv/bin/python -m pytest      # Git behaviour is tested against temporary repositories
cd frontend && npm test && npm run typecheck
```
The backend suite creates real repositories, remotes, merges, stashes, a 3,000-commit repository and
repositories with Unicode and special-character file names. It also checks that read-only requests leave every
file in a repository, including `.git`, untouched.

## Safety model
- Opening or browsing a repository only runs read-only Git commands (with optional locks disabled).
- Only repositories you opened from the dashboard are reachable through the API. Paths are resolved and must stay
  inside the repository; `.git`, `..` and symlink escapes are refused. File names are matched literally, never as globs.
- Git is always started with an argument list and no shell. Branch, tag and revision names are validated first.
- The server accepts only `localhost` Host headers, and writes only from this app's own origin, so other websites cannot drive it.
- Commit only commits what you staged. Pull is fast-forward only. Push never forces. Checkout never stashes or discards.
- Discarding changes and deleting branches, tags and stashes ask for confirmation (a setting can turn the dialog off;
  the backend still requires an explicit confirm flag for them).
- Not implemented on purpose: force push, hard reset, merge, rebase, hunk/line staging, deleting remote branches.

## Configuration
Settings live in the app (Settings screen) and are stored in `~/.git-repository-explorer/app.db`.
Environment variables: `GRX_DATA_DIR` (data folder), `GRX_GIT` (git executable, overrides the setting).

## Known limits
- No hunk or line staging, no merge or rebase, no remote branch deletion. Pull stops if history diverged.
- Content search covers the working tree, not history. Regex search uses PCRE when your Git has it, otherwise POSIX.
- Contributors are merged by email only (no `.mailmap`). File statistics in Insights cover the latest 3,000 commits.
- The file tree is not virtualised; it renders only expanded folders and caps at 2,000 rows.
- Keyboard shortcuts are fixed (not customisable). Ctrl/Cmd+R refreshes repository data instead of reloading the page; use F5 to reload.
- Tested with Git 2.46 on macOS. Other platforms and older Git versions are untested.

## Possible next steps (not started)
Optional AI features (explain a commit, summarise a branch, review a diff) fit the existing service layer but are not part of this version.
