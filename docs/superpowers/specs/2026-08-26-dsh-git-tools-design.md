# Design: `dsh-git-tools` — local git tools for DeepSeek Harness

**Date:** 2026-08-26
**Status:** Approved by user (approach A + design)
**Type:** DeepSeek Harness (dsh) plugin — agent tool/capability

## Overview

A dependency-free DeepSeek Harness plugin that gives the coding agent four local git
tools: **`git_status`**, **`git_diff`**, **`git_log`**, and **`git_commit`**. The tools
operate on the repository in the session workspace by shelling out to the `git` CLI.
No UI, Host-side only. Published to the community with the `dsh-plugin` GitHub topic.

## Goal & success criteria

- The agent can, within a conversation, inspect repo state (status, diff, log) and
  create commits through explicit, non-destructive commands.
- Plugin installs via `dsh plugin --profile web add dsh-git-tools`.
- Zero runtime npm dependencies; tests pass via `pnpm test` against real throwaway git repos.
- Repo published with `dsh-plugin` topic, MIT license, README, and SECURITY.md.

## Architecture

Everything is a plugin in dsh (Cordis). This plugin is a Host-side Cordis plugin that
registers four tools through `ctx.tools.register(defineTool(...))`. All git interaction
flows through a single `git-exec.ts` chokepoint.

### Repo layout (single pnpm package)

```
dsh-git-tools/
├── package.json          # name "dsh-git-tools", dsh.bundle manifest, main → lib/index.js
├── cordis.patch.yml      # mounts the plugin into dsh (referenced by dsh.bundle.patch)
├── tsconfig.json
├── tsdown.config.ts      # builds lib/
├── src/
│   ├── index.ts          # entry: export name='git-tools', inject=['tools'], apply() registers 4 tools
│   ├── git-exec.ts       # safe execFile wrapper
│   └── tools/
│       ├── status.ts
│       ├── diff.ts
│       ├── log.ts
│       └── commit.ts
├── tests/
│   ├── git-exec.test.ts
│   ├── status.test.ts
│   ├── diff.test.ts
│   ├── log.test.ts
│   └── commit.test.ts
├── README.md
├── LICENSE            # MIT
└── SECURITY.md
```

Key `package.json` fields: `dsh.bundle.patch → ./cordis.patch.yml`, `type: module`,
`main: lib/index.js`, `types: lib/types/index.d.ts`. Dev deps: `@deepseek-ai/dsh-tools`,
`@deepseek-ai/cordis`, `tsdown`, `typescript`, `vitest`, `@types/node`.

## Component: `git-exec.ts` — the single I/O chokepoint

```
gitExec(cwd: string, args: string[], opts?: { signal?: AbortSignal }): Promise<{ stdout: string }>
```

- Uses `child_process.execFile('git', args)` — args passed as an **array**, never a
  shell string, so user/model-controlled params (`path`, `message`) are injection-safe.
- Always prefixes `-c color.ui=false --no-pager`; env sets `LC_ALL=C` for stable output.
- Runs with `cwd` = the session workspace.
- Honors `exec.signal`: aborts the child process when the outer tool call is cancelled.
- Non-zero exit → throws structured `GitError` carrying `code` and `stderr` so the model
  sees git's real message (e.g. "not a git repository", empty commit rejection).

## Tools (canonical JSON out, `output.render` for the model)

### `git_status`
- Params: `cwd?` (default session workspace)
- Command: `git status --short --branch`
- Returns: `{ branch, ahead, behind, staged: [{ path, status }], unstaged: [...], untracked: [...] }`
- Parses porcelain lines: index column, worktree column, untracked `??`, and the branch
  header line for `ahead/behind`.

### `git_diff`
- Params: `cwd?`, `staged?` (bool, default false), `path?`, `statOnly?` (bool, default true)
- Commands: `git diff [--cached] --numstat [-- <path>]`; full patch when `statOnly` is false
- Returns: `{ stat: [{ file, added, deleted }], total: { files, insertions, deletions }, patch }`
  (`patch` is `null` in stat-only mode; binary files report `added`/`deleted` as 0; staged
  renames report the new path).
- Parses `--numstat` rows; patch captured verbatim.

### `git_log`
- Params: `cwd?`, `count?` (default 10, max 100), `path?`
- Command: `git log --pretty=format:%H%x1f%an%x1f%ad%x1f%s%x1e --date=short -n <count> [-- <path>]`
- Returns: `{ commits: [{ hash, author, date, subject }], total }`
- Parses NUL-delimited records (`\x1e` record sep, `\x1f` field sep); empty repo → empty
  `commits` list (the specific "no commits yet" git error is handled and returned as `[]`).

### `git_commit`
- Params: `cwd?`, `message` (required), `paths?` (string[]), `all?` (bool, default false)
- Behavior:
  - `paths` provided → `git add <paths>`
  - else `all: true` → `git add -A`
  - then `git commit -m <message>`
  - `message` must be non-empty and non-whitespace (rejected with structured error otherwise).
- Returns: `{ success, hash?, branch?, filesStaged }`
- **Never** stages everything implicitly: needs explicit `paths` or `all: true`.

## Error handling & safety

- All I/O through `gitExec`; `GitError` propagates `stderr` so the agent can self-correct.
- `cwd` validated to be a directory; otherwise rejected before exec.
- Args arrays only — no shell interpolation.
- `git_commit` is the only mutation tool. No `--amend`, `--force`, or destructive flags in
  the core scope. Empty/whitespace messages rejected.
- Cancellation: `exec.signal` aborts the running git child.

## Testing

vitest, no git mocking — each test builds a real throwaway repo in `fs.mkdtemp` and runs
real git against it.

- **git-exec.test.ts:** exit codes, stderr capture, signal abort.
- **status.test.ts:** clean repo, staged vs unstaged vs untracked parsing, branch + ahead/behind.
- **diff.test.ts:** stat-only vs patch, `staged`, `path` filter, empty diff.
- **log.test.ts:** commit ordering, count cap, path filter, empty repo.
- **commit.test.ts:** commit with paths, with `all`, empty-message rejection, empty-commit error.

## Publishing

- GitHub repo named `dsh-git-tools`, topic `dsh-plugin` for discoverability.
- README: install (`dsh plugin --profile web add dsh-git-tools`), tool reference, safety notes.
- MIT license, SECURITY.md.
- Optional: submit to `awesome-dsh-plugin/awesome-dsh-plugin` per its contributing guide.

## Non-goals

- No UI/settings panel (tools only).
- No GitHub remote API integration (local git only).
- No advanced ops (rebase, reset, cherry-pick, worktree, stash, push/pull) in core scope.
