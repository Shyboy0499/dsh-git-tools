# dsh-git-tools

> Local git tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

`dsh-git-tools` is a dependency-free DeepSeek Harness plugin that gives the coding agent
four local git tools — **`git_status`**, **`git_diff`**, **`git_log`**, and **`git_commit`** —
so it can inspect the repo in the session workspace and create commits, all through the
official tool API. No UI, Host-side only.

## Features

| Tool | What it does |
|------|--------------|
| `git_status` | Branch, ahead/behind, and staged / unstaged / untracked files |
| `git_diff` | Stat summary or full patch, staged or unstaged, optional path filter |
| `git_log` | Recent commits as `{ hash, author, date, subject }` |
| `git_commit` | Stage specific paths (or all) and commit with a required message |

## Installation

```sh
dsh plugin --profile web add dsh-git-tools
```

Requires `git` on your `PATH` (present in any development environment).

## Tool reference

All tools accept an optional `cwd` (defaults to the session workspace).

### `git_status`

Inspect the working tree and branch state.

```json
{ "branch": "main", "ahead": 0, "behind": 2,
  "staged": [{ "path": "src/index.ts", "status": "M" }],
  "unstaged": [], "untracked": ["scratch.txt"] }
```

### `git_diff`

View changes. `staged` diffs the index, `statOnly: true` (default) returns a stat summary,
`statOnly: false` returns the full patch. `path` filters to a single file.

```json
{ "stat": [{ "file": "src/index.ts", "added": 3, "deleted": 1 }],
  "total": { "files": 1, "insertions": 3, "deletions": 1 }, "patch": null }
```

### `git_log`

List recent commits. `count` defaults to 10 (max 100); `path` filters to a file.

```json
[{ "hash": "a1b2c3d", "author": "Shyboy0499", "date": "2026-08-26", "subject": "Fix typo" }]
```

### `git_commit`

Create a commit. `message` is **required** (non-empty). Stage specific files with `paths`,
or everything with `all: true`. Never stages implicitly.

```json
{ "success": true, "hash": "e5f6g7h", "branch": "main", "filesStaged": 2 }
```

## Safety

- All git calls run through `execFile` with arguments passed as arrays — no shell
  interpolation, so user/model-controlled values are injection-safe.
- `git_commit` requires an explicit `message` and never stages files on its own
  (pass `paths` or `all: true`).
- No destructive operations (`--amend`, `--force`, rebase, reset) in the core scope.

## Development

```sh
pnpm install
pnpm run build     # tsdown → lib/
pnpm test          # vitest against real throwaway git repos
```

## License

[MIT](LICENSE)
