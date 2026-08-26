# dsh-git-tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish `dsh-git-tools`, a dependency-free DeepSeek Harness plugin exposing four local git tools (`git_status`, `git_diff`, `git_log`, `git_commit`) that operate on the session workspace.

**Architecture:** A single Host-side Cordis plugin package. Each tool is a `defineTool(...)` definition registered via `ctx.tools.register`. All git I/O flows through one `git-exec.ts` wrapper using `child_process.execFile` (args as arrays, no shell). The default working directory resolves from `exec.agent.session.header.cwd` (the session workspace).

**Tech Stack:** TypeScript, pnpm, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, tsdown (build → `lib/`), vitest (tests against real throwaway git repos). Zero runtime dependencies.

**Design spec:** `docs/superpowers/specs/2026-08-26-dsh-git-tools-design.md`

---

## File Structure

```
dsh-git-tools/
├── package.json            # dsh.bundle manifest, name "dsh-git-tools"
├── cordis.patch.yml        # bundle patch: inserts the plugin row into a profile
├── tsconfig.json           # strict TS, noEmit (tsdown emits)
├── tsdown.config.ts        # builds src/index.ts → lib/index.js (ESM, node)
├── src/
│   ├── index.ts            # plugin entry: name='git-tools', inject=['tools'], registers 4 tools
│   ├── git-exec.ts         # gitExec() safe wrapper + GitError + resolveCwd()
│   └── tools/
│       ├── status.ts       # git_status tool
│       ├── diff.ts         # git_diff tool
│       ├── log.ts          # git_log tool
│       └── commit.ts       # git_commit tool
├── tests/
│   ├── helpers.ts          # makeRepo()/run()/cleanup() against real git
│   ├── git-exec.test.ts
│   ├── status.test.ts
│   ├── diff.test.ts
│   ├── log.test.ts
│   └── commit.test.ts
├── README.md               # exists — update if tool behavior drifts
├── LICENSE                 # exists
├── SECURITY.md             # exists
└── docs/superpowers/...    # spec + this plan
```

Every commit in this plan is small and self-contained. All work happens in `/Users/brocode/uni/github/dsh-git-tools` (already a git repo with `origin` at `git@github.com:Shyboy0499/dsh-git-tools.git`).

---

## Task 1: Scaffold the package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsdown.config.ts`
- Create: `cordis.patch.yml`
- Create: `src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dsh-git-tools",
  "version": "0.1.0",
  "description": "Local git tools for DeepSeek Harness: git_status, git_diff, git_log, git_commit",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.8",
    "@types/node": "^22.20.0",
    "schemastery": "^3.18.0",
    "tsdown": "0.22.2",
    "typescript": "~5.7.2",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `tsdown.config.ts`**

```ts
import type { UserConfig } from 'tsdown'

const lib: UserConfig = {
  name: 'dsh-git-tools',
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', 'schemastery'],
}

export default [lib]
```

- [ ] **Step 4: Create `cordis.patch.yml`**

```yaml
# dsh-git-tools bundle registration.
- insert:
    - id: git-tools
      name: dsh-git-tools
```

- [ ] **Step 5: Create `src/index.ts`** (stub — tools registered in later tasks)

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'git-tools'
export const inject = ['tools']

export function apply(_ctx: Context) {
  // Tool registrations are added in Tasks 3-6.
}
```

- [ ] **Step 6: Install and verify the scaffold builds**

Run: `pnpm install` (ensure corepack is enabled: `corepack enable` first if `pnpm --version` fails).

Run: `pnpm run build`
Expected: `lib/index.js` is emitted, exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tsdown.config.ts cordis.patch.yml src/index.ts
git commit -m "chore: scaffold dsh-git-tools package"
```

---

## Task 2: `git-exec.ts` — safe git runner + workspace resolution

**Files:**
- Create: `tests/git-exec.test.ts`
- Create: `src/git-exec.ts`

- [ ] **Step 1: Write the failing test**

`tests/git-exec.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitExec, GitError, resolveCwd } from '../src/git-exec'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-git-exec-'))
}

describe('gitExec', () => {
  it('returns stdout for a successful command', async () => {
    const dir = tempDir()
    try {
      const { stdout } = await gitExec(dir, ['--version'])
      expect(stdout).toMatch(/^git version /)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws GitError with git stderr on a bad command', async () => {
    const dir = tempDir()
    try {
      await expect(gitExec(dir, ['this-is-not-a-real-command'])).rejects.toBeInstanceOf(GitError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects when the signal is already aborted', async () => {
    const dir = tempDir()
    const controller = new AbortController()
    controller.abort()
    try {
      await expect(gitExec(dir, ['status'], controller.signal)).rejects.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveCwd', () => {
  it('falls back to the session workspace when no cwd is given', () => {
    const exec = { agent: { session: { header: { cwd: '/tmp/session-root' } } } }
    expect(resolveCwd(undefined, exec as never)).toBe('/tmp/session-root')
  })

  it('resolves a relative cwd against the session workspace', () => {
    const exec = { agent: { session: { header: { cwd: '/tmp/session-root' } } } }
    expect(resolveCwd('subdir', exec as never)).toBe('/tmp/session-root/subdir')
  })

  it('returns an absolute cwd untouched', () => {
    const exec = { agent: { session: { header: { cwd: '/tmp/session-root' } } } }
    expect(resolveCwd('/abs/path', exec as never)).toBe('/abs/path')
  })

  it('returns undefined when neither cwd nor session is available', () => {
    expect(resolveCwd(undefined, undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../src/git-exec'`.

- [ ] **Step 3: Implement `src/git-exec.ts`**

```ts
import { execFile } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class GitError extends Error {
  readonly exitCode: number | null
  readonly stderr: string

  constructor(stderr: string, exitCode: number | null) {
    super(stderr.trim().split('\n').slice(-3).join('\n') || 'git failed')
    this.name = 'GitError'
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export interface GitExecResult {
  stdout: string
}

export async function gitExec(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<GitExecResult> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-c', 'color.ui=false', '--no-pager', ...args],
      { cwd, env: { ...process.env, LC_ALL: 'C' }, signal, maxBuffer: 10 * 1024 * 1024 },
    )
    return { stdout }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).name === 'AbortError') throw err
    const e = err as NodeJS.ErrnoException & { stderr?: string }
    throw new GitError(e.stderr ?? e.message ?? String(err), (e.code as number) ?? null)
  }
}

interface WorkspaceExec {
  agent?: { session?: { header?: { cwd?: string } } }
}

export function resolveCwd(modelCwd: string | undefined, exec: WorkspaceExec | undefined): string | undefined {
  const headerCwd = exec?.agent?.session?.header?.cwd
  const sessionCwd = headerCwd === undefined ? undefined : resolve(headerCwd)
  if (modelCwd === undefined) return sessionCwd
  if (sessionCwd !== undefined && !isAbsolute(modelCwd)) return resolve(sessionCwd, modelCwd)
  return modelCwd
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/git-exec.test.ts src/git-exec.ts
git commit -m "feat: safe git exec wrapper and session cwd resolution"
```

---

## Task 3: `git_status` tool

**Files:**
- Create: `tests/status.test.ts`
- Create: `src/tools/status.ts`
- Modify: `src/index.ts` (register the tool)

- [ ] **Step 1: Write the failing test**

`tests/status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeRepo, cleanup, write, commitAll, git } from './helpers'
import { gitStatusTool } from '../src/tools/status'

const exec = { signal: new AbortController().signal } as never

describe('git_status', () => {
  it('reports a clean repo on main', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'hello\n')
      commitAll(dir, 'initial')
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any
      expect(value.branch).toBe('main')
      expect(value.ahead).toBe(0)
      expect(value.behind).toBe(0)
      expect(value.staged).toEqual([])
      expect(value.unstaged).toEqual([])
      expect(value.untracked).toEqual([])
    } finally {
      cleanup(dir)
    }
  })

  it('separates staged, unstaged, and untracked files', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'hello\n')
      commitAll(dir, 'initial')
      write(dir, 'a.txt', 'changed\n')     // modified, not yet staged
      write(dir, 'b.txt', 'ready\n')
      commitAll(dir, 'second')             // staged + committed
      write(dir, 'a.txt', 'changed again\n')
      git(dir, 'add', 'a.txt')             // staged modification
      write(dir, 'c.txt', 'new\n')         // untracked
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any
      expect(value.staged.map((s: any) => s.path).sort()).toEqual(['a.txt'])
      expect(value.unstaged).toEqual([])
      expect(value.untracked).toEqual(['c.txt'])
    } finally {
      cleanup(dir)
    }
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../src/tools/status'` and/or `'./helpers'`.

- [ ] **Step 3: Create the shared test helper `tests/helpers.ts`**

```ts
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'

export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
}

export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-git-tools-'))
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.name', 'Test User')
  git(dir, 'config', 'user.email', 'test@example.com')
  return dir
}

export function write(dir: string, name: string, content: string): void {
  const file = join(dir, name)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

export function commitAll(dir: string, message: string): void {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-m', message)
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
```

- [ ] **Step 4: Implement `src/tools/status.ts`**

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'
import { gitExec, resolveCwd } from '../git-exec'

interface StatusEntry {
  path: string
  status: string
}

export interface GitStatusValue {
  branch: string
  ahead: number
  behind: number
  staged: StatusEntry[]
  unstaged: StatusEntry[]
  untracked: string[]
}

function parseStatus(stdout: string): GitStatusValue {
  const value: GitStatusValue = { branch: 'HEAD', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue
    if (line.startsWith('## ')) {
      const head = line.slice(3)
      if (head.startsWith('No commits yet on ')) {
        value.branch = head.slice('No commits yet on '.length)
      } else if (head.startsWith('HEAD (no branch)')) {
        value.branch = 'HEAD'
      } else {
        const m = head.match(/^([^.\s]+)/)
        value.branch = m ? m[1] : 'HEAD'
      }
      const ahead = head.match(/ahead (\d+)/)
      const behind = head.match(/behind (\d+)/)
      value.ahead = ahead ? Number(ahead[1]) : 0
      value.behind = behind ? Number(behind[1]) : 0
      continue
    }
    const status = line.slice(0, 2)
    const path = line.slice(3).trim()
    if (status === '??') {
      value.untracked.push(path)
    } else {
      const x = status[0]
      const y = status[1]
      if (x !== ' ') value.staged.push({ path, status: x })
      if (y !== ' ') value.unstaged.push({ path, status: y })
    }
  }
  return value
}

function formatStatus(v: GitStatusValue): string {
  const lines = [`Branch: ${v.branch}${v.ahead || v.behind ? ` (ahead ${v.ahead}, behind ${v.behind})` : ''}`]
  if (v.staged.length) lines.push(`Staged (${v.staged.length}):`, ...v.staged.map((s) => `  ${s.status} ${s.path}`))
  if (v.unstaged.length) lines.push(`Unstaged (${v.unstaged.length}):`, ...v.unstaged.map((s) => `  ${s.status} ${s.path}`))
  if (v.untracked.length) lines.push(`Untracked (${v.untracked.length}):`, ...v.untracked.map((p) => `  ?? ${p}`))
  return lines.join('\n')
}

export const gitStatusTool = defineTool({
  name: 'git_status',
  description: 'Show the working tree status: current branch, ahead/behind, and staged, unstaged, and untracked files.',
  parameters: {
    cwd: { type: 'string', description: 'Working directory for git commands. Defaults to the session workspace.' },
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        branch: { type: 'string' },
        ahead: { type: 'number' },
        behind: { type: 'number' },
        staged: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, status: { type: 'string' } }, additionalProperties: false } },
        unstaged: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, status: { type: 'string' } }, additionalProperties: false } },
        untracked: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [{ type: 'text', text: formatStatus(value) }],
  },
  async execute(args, exec) {
    const cwd = resolveCwd(args.cwd, exec as never)
    if (cwd === undefined) throw new Error('No working directory available; pass cwd explicitly.')
    const { stdout } = await gitExec(cwd, ['status', '--short', '--branch'], exec.signal)
    return parseStatus(stdout)
  },
})
```

- [ ] **Step 5: Register the tool in `src/index.ts`**

Replace the whole file:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { gitStatusTool } from './tools/status'

export const name = 'git-tools'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(gitStatusTool)
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm test`
Expected: PASS (status tests + git-exec tests).

- [ ] **Step 7: Commit**

```bash
git add tests/helpers.ts tests/status.test.ts src/tools/status.ts src/index.ts
git commit -m "feat: git_status tool"
```

---

## Task 4: `git_diff` tool

**Files:**
- Create: `tests/diff.test.ts`
- Create: `src/tools/diff.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

`tests/diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeRepo, cleanup, write, commitAll, git } from './helpers'
import { gitDiffTool } from '../src/tools/diff'

const exec = { signal: new AbortController().signal } as never

describe('git_diff', () => {
  it('returns an empty stat on a clean repo', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'hello\n')
      commitAll(dir, 'initial')
      const value = (await gitDiffTool.execute({ cwd: dir }, exec)) as any
      expect(value.stat).toEqual([])
      expect(value.total.files).toBe(0)
      expect(value.patch).toBeNull()
    } finally {
      cleanup(dir)
    }
  })

  it('returns numstat for unstaged changes by default', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\ntwo\nthree\n')
      commitAll(dir, 'initial')
      write(dir, 'a.txt', 'one\nthree\n')
      const value = (await gitDiffTool.execute({ cwd: dir }, exec)) as any
      expect(value.total.files).toBe(1)
      expect(value.stat[0]).toMatchObject({ file: 'a.txt', added: 0, deleted: 1 })
    } finally {
      cleanup(dir)
    }
  })

  it('diffs the index when staged is true', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      commitAll(dir, 'initial')
      write(dir, 'a.txt', 'one\ntwo\n')
      git(dir, 'add', 'a.txt')
      const unstaged = (await gitDiffTool.execute({ cwd: dir }, exec)) as any
      expect(unstaged.total.files).toBe(0)
      const staged = (await gitDiffTool.execute({ cwd: dir, staged: true }, exec)) as any
      expect(staged.total.files).toBe(1)
      expect(staged.stat[0]).toMatchObject({ added: 1, deleted: 0 })
    } finally {
      cleanup(dir)
    }
  })

  it('returns the full patch when statOnly is false', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      commitAll(dir, 'initial')
      write(dir, 'a.txt', 'one\ntwo\n')
      const value = (await gitDiffTool.execute({ cwd: dir, statOnly: false }, exec)) as any
      expect(value.patch).toContain('diff --git a/a.txt b/a.txt')
      expect(value.patch).toContain('+two')
    } finally {
      cleanup(dir)
    }
  })

  it('filters by path', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      write(dir, 'b.txt', 'x\n')
      commitAll(dir, 'initial')
      write(dir, 'a.txt', 'one\ntwo\n')
      write(dir, 'b.txt', 'x\ny\n')
      const value = (await gitDiffTool.execute({ cwd: dir, path: 'b.txt' }, exec)) as any
      expect(value.total.files).toBe(1)
      expect(value.stat[0].file).toBe('b.txt')
    } finally {
      cleanup(dir)
    }
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../src/tools/diff'`.

- [ ] **Step 3: Implement `src/tools/diff.ts`**

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'
import { gitExec, resolveCwd } from '../git-exec'

interface DiffStat {
  file: string
  added: number
  deleted: number
}

export interface GitDiffValue {
  stat: DiffStat[]
  total: { files: number; insertions: number; deletions: number }
  patch: string | null
}

function parseNumstat(stdout: string): { stat: DiffStat[]; total: GitDiffValue['total'] } {
  const stat: DiffStat[] = []
  let files = 0
  let insertions = 0
  let deletions = 0
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (!match) continue
    files++
    const added = match[1] === '-' ? 0 : Number(match[1])
    const deleted = match[2] === '-' ? 0 : Number(match[2])
    stat.push({ file: match[3], added, deleted })
    insertions += added
    deletions += deleted
  }
  return { stat, total: { files, insertions, deletions } }
}

function formatDiff(v: GitDiffValue): string {
  const lines: string[] = []
  for (const s of v.stat) lines.push(`  ${s.added}${s.deleted ? `-${s.deleted}` : ''}  ${s.file}`)
  lines.push(`${v.total.files} file(s) changed, ${v.total.insertions} insertion(s), ${v.total.deletions} deletion(s)`)
  if (v.patch) lines.push('\n--- patch ---\n' + v.patch)
  return lines.join('\n')
}

export const gitDiffTool = defineTool({
  name: 'git_diff',
  description: 'Show changes in the working tree (unstaged) or in the index (staged). Returns a stat summary, or the full patch when statOnly is false.',
  parameters: {
    cwd: { type: 'string', description: 'Working directory for git commands. Defaults to the session workspace.' },
    staged: { type: 'boolean', description: 'Diff staged changes (--cached). Default false.' },
    path: { type: 'string', description: 'Limit to a single file path.' },
    statOnly: { type: 'boolean', description: 'Return only a stat summary (default true).' },
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        stat: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, added: { type: 'number' }, deleted: { type: 'number' } }, additionalProperties: false } },
        total: { type: 'object', properties: { files: { type: 'number' }, insertions: { type: 'number' }, deletions: { type: 'number' } }, additionalProperties: false },
        patch: { type: 'string' },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [{ type: 'text', text: formatDiff(value) }],
  },
  async execute(args, exec) {
    const cwd = resolveCwd(args.cwd, exec as never)
    if (cwd === undefined) throw new Error('No working directory available; pass cwd explicitly.')
    const base = ['diff']
    if (args.staged) base.push('--cached')
    const pathArgs = args.path ? ['--', args.path] : []
    const { stdout } = await gitExec(cwd, [...base, '--numstat', ...pathArgs], exec.signal)
    const { stat, total } = parseNumstat(stdout)
    if (args.statOnly !== false) return { stat, total, patch: null }
    const { stdout: patchOut } = await gitExec(cwd, [...base, ...pathArgs], exec.signal)
    return { stat, total, patch: patchOut }
  },
})
```

- [ ] **Step 4: Register the tool in `src/index.ts`**

```ts
import type { Context } from '@deepseek-ai/cordis'
import { gitStatusTool } from './tools/status'
import { gitDiffTool } from './tools/diff'

export const name = 'git-tools'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(gitStatusTool)
  ctx.tools.register(gitDiffTool)
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/diff.test.ts src/tools/diff.ts src/index.ts
git commit -m "feat: git_diff tool"
```

---

## Task 5: `git_log` tool

**Files:**
- Create: `tests/log.test.ts`
- Create: `src/tools/log.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

`tests/log.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeRepo, cleanup, write, commitAll } from './helpers'
import { gitLogTool } from '../src/tools/log'

const exec = { signal: new AbortController().signal } as never

describe('git_log', () => {
  it('returns commits newest-first with hash, author, date, subject', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      commitAll(dir, 'first commit')
      write(dir, 'a.txt', 'one\ntwo\n')
      commitAll(dir, 'second commit')
      const value = (await gitLogTool.execute({ cwd: dir }, exec)) as any
      expect(value.commits.length).toBe(2)
      expect(value.commits[0].subject).toBe('second commit')
      expect(value.commits[1].subject).toBe('first commit')
      expect(value.commits[0].hash).toMatch(/^[0-9a-f]{40}$/)
      expect(value.commits[0].author).toBe('Test User')
      expect(value.commits[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(value.total).toBe(2)
    } finally {
      cleanup(dir)
    }
  })

  it('respects count and path filters', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      write(dir, 'b.txt', 'x\n')
      commitAll(dir, 'both files')
      write(dir, 'a.txt', 'one\ntwo\n')
      commitAll(dir, 'only a')
      const all = (await gitLogTool.execute({ cwd: dir, count: 1 }, exec)) as any
      expect(all.commits.length).toBe(1)
      const path = (await gitLogTool.execute({ cwd: dir, path: 'b.txt' }, exec)) as any
      expect(path.commits.map((c: any) => c.subject)).toEqual(['both files'])
    } finally {
      cleanup(dir)
    }
  })

  it('returns an empty list for a repo with no commits', async () => {
    const dir = makeRepo()
    try {
      const value = (await gitLogTool.execute({ cwd: dir }, exec)) as any
      expect(value.commits).toEqual([])
      expect(value.total).toBe(0)
    } finally {
      cleanup(dir)
    }
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../src/tools/log'`.

- [ ] **Step 3: Implement `src/tools/log.ts`**

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'
import { gitExec, resolveCwd } from '../git-exec'

export interface LogEntry {
  hash: string
  author: string
  date: string
  subject: string
}

export interface GitLogValue {
  commits: LogEntry[]
  total: number
}

function parseLog(stdout: string): LogEntry[] {
  const commits: LogEntry[] = []
  for (const record of stdout.split('\x1e')) {
    if (record.length === 0) continue
    const [hash, author, date, subject] = record.split('\x1f')
    commits.push({ hash, author, date, subject: subject ?? '' })
  }
  return commits
}

function formatLog(v: GitLogValue): string {
  if (v.commits.length === 0) return '(no commits)'
  return v.commits.map((c) => `${c.hash.slice(0, 7)} ${c.date} ${c.author}: ${c.subject}`).join('\n')
}

export const gitLogTool = defineTool({
  name: 'git_log',
  description: 'Show recent commit history as a list of { hash, author, date, subject }, newest first.',
  parameters: {
    cwd: { type: 'string', description: 'Working directory for git commands. Defaults to the session workspace.' },
    count: { type: 'number', description: 'Number of commits to show (default 10, max 100).' },
    path: { type: 'string', description: 'Limit to commits that touched this file path.' },
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        commits: { type: 'array', items: { type: 'object', properties: { hash: { type: 'string' }, author: { type: 'string' }, date: { type: 'string' }, subject: { type: 'string' } }, additionalProperties: false } },
        total: { type: 'number' },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [{ type: 'text', text: formatLog(value) }],
  },
  async execute(args, exec) {
    const cwd = resolveCwd(args.cwd, exec as never)
    if (cwd === undefined) throw new Error('No working directory available; pass cwd explicitly.')
    const count = Math.min(Math.max(Math.floor(args.count ?? 10), 1), 100)
    const logArgs = ['log', '--pretty=format:%H%x1f%an%x1f%ad%x1f%s%x1e', '--date=short', '-n', String(count)]
    if (args.path) logArgs.push('--', args.path)
    const { stdout } = await gitExec(cwd, logArgs, exec.signal)
    const commits = parseLog(stdout)
    return { commits, total: commits.length }
  },
})
```

- [ ] **Step 4: Register the tool in `src/index.ts`**

```ts
import type { Context } from '@deepseek-ai/cordis'
import { gitStatusTool } from './tools/status'
import { gitDiffTool } from './tools/diff'
import { gitLogTool } from './tools/log'

export const name = 'git-tools'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(gitStatusTool)
  ctx.tools.register(gitDiffTool)
  ctx.tools.register(gitLogTool)
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/log.test.ts src/tools/log.ts src/index.ts
git commit -m "feat: git_log tool"
```

---

## Task 6: `git_commit` tool

**Files:**
- Create: `tests/commit.test.ts`
- Create: `src/tools/commit.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

`tests/commit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeRepo, cleanup, write, git } from './helpers'
import { gitCommitTool } from '../src/tools/commit'

const exec = { signal: new AbortController().signal } as never

describe('git_commit', () => {
  it('commits staged changes when paths are given', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      git(dir, 'add', 'a.txt')
      write(dir, 'b.txt', 'x\n') // left untracked on purpose
      const value = (await gitCommitTool.execute({ cwd: dir, message: 'add a', paths: ['a.txt'] }, exec)) as any
      expect(value.success).toBe(true)
      expect(value.hash).toMatch(/^[0-9a-f]{40}$/)
      expect(value.branch).toBe('main')
      expect(value.filesStaged).toBe(1)
      expect(git(dir, 'log', '--oneline').trim()).toBe(value.hash.slice(0, 7) + ' add a')
      expect(git(dir, 'status', '--short').trim()).toBe('?? b.txt')
    } finally {
      cleanup(dir)
    }
  })

  it('stages everything with all: true', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      write(dir, 'b.txt', 'x\n')
      const value = (await gitCommitTool.execute({ cwd: dir, message: 'add all', all: true }, exec)) as any
      expect(value.success).toBe(true)
      expect(value.filesStaged).toBe(2)
      expect(git(dir, 'status', '--short')).toBe('')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects an empty or whitespace-only message', async () => {
    const dir = makeRepo()
    try {
      await expect(gitCommitTool.execute({ cwd: dir, message: '   ' }, exec)).rejects.toThrow('non-empty')
    } finally {
      cleanup(dir)
    }
  })

  it('surfaces git errors when there is nothing to commit', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
      commitAll(dir, 'initial')
      await expect(gitCommitTool.execute({ cwd: dir, message: 'nothing new' }, exec)).rejects.toThrow()
    } finally {
      cleanup(dir)
    }
  })
})

function commitAll(dir: string, message: string) {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-m', message)
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../src/tools/commit'`.

- [ ] **Step 3: Implement `src/tools/commit.ts`**

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'
import { gitExec, resolveCwd } from '../git-exec'

export interface GitCommitValue {
  success: boolean
  hash: string | null
  branch: string | null
  filesStaged: number
}

export const gitCommitTool = defineTool({
  name: 'git_commit',
  description: 'Create a git commit with a required non-empty message. Stage specific files with paths, or stage everything with all: true. With neither, commits the already-staged changes.',
  parameters: {
    cwd: { type: 'string', description: 'Working directory for git commands. Defaults to the session workspace.' },
    message: { type: 'string', required: true, description: 'Commit message. Must be non-empty.' },
    paths: { type: 'array', items: { type: 'string' }, description: 'Files to stage before committing.' },
    all: { type: 'boolean', description: 'Stage all changes with git add -A before committing. Default false.' },
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        hash: { type: 'string' },
        branch: { type: 'string' },
        filesStaged: { type: 'number' },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [
      {
        type: 'text',
        text: value.success
          ? `Committed ${value.hash} on ${value.branch} (${value.filesStaged} file(s) staged).`
          : 'Commit failed.',
      },
    ],
  },
  async execute(args, exec) {
    const message = args.message.trim()
    if (message.length === 0) throw new Error('Commit message must be non-empty.')
    const cwd = resolveCwd(args.cwd, exec as never)
    if (cwd === undefined) throw new Error('No working directory available; pass cwd explicitly.')

    if (args.paths && args.paths.length > 0) {
      await gitExec(cwd, ['add', '--', ...args.paths], exec.signal)
    } else if (args.all) {
      await gitExec(cwd, ['add', '-A'], exec.signal)
    }

    const staged = await gitExec(cwd, ['diff', '--cached', '--name-only'], exec.signal)
    const filesStaged = staged.stdout.split('\n').filter((l) => l.length > 0).length

    await gitExec(cwd, ['commit', '-m', message], exec.signal)

    const [hashOut, branchOut] = await Promise.all([
      gitExec(cwd, ['rev-parse', 'HEAD'], exec.signal),
      gitExec(cwd, ['branch', '--show-current'], exec.signal),
    ])
    return {
      success: true,
      hash: hashOut.stdout.trim(),
      branch: branchOut.stdout.trim() || null,
      filesStaged,
    }
  },
})
```

- [ ] **Step 4: Register the tool in `src/index.ts`**

```ts
import type { Context } from '@deepseek-ai/cordis'
import { gitStatusTool } from './tools/status'
import { gitDiffTool } from './tools/diff'
import { gitLogTool } from './tools/log'
import { gitCommitTool } from './tools/commit'

export const name = 'git-tools'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(gitStatusTool)
  ctx.tools.register(gitDiffTool)
  ctx.tools.register(gitLogTool)
  ctx.tools.register(gitCommitTool)
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/commit.test.ts src/tools/commit.ts src/index.ts
git commit -m "feat: git_commit tool"
```

---

## Task 7: Full verification (typecheck, build, tests)

**Files:**
- No new files — verify the whole package.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites (git-exec, status, diff, log, commit).

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: `lib/index.js` emitted, exit 0. Confirm the built entry loads:

Run: `node -e "const m = await import('./lib/index.js'); console.log(m.name)"`
Expected: prints `git-tools`.

- [ ] **Step 4: Confirm README matches the shipped tools**

Verify README tool table, params, and safety section match the four implementations. Edit if any drift.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: sync README with final tool behavior"
```

---

## Task 8: Install and smoke-test in dsh, then push

**Files:** none (runtime verification).

- [ ] **Step 1: Install the plugin into a local dsh profile** (requires `dsh` CLI / DeepSeek Harness installed; if not installed, skip to Step 4)

From the repo root:

```sh
dsh plugin --profile web add ./dsh-git-tools
```

- [ ] **Step 2: Smoke test the tools**

Start the Web UI: `dsh --profile web web` (or `npx @deepseek-ai/dsh web`), open `http://127.0.0.1:3080`, and in a workspace that is a git repo ask:

> Use git_status, git_diff, git_log, and git_commit to show repo state and make a test commit.

Verify each tool returns structured results and the commit appears in `git log`.

- [ ] **Step 3: Verify the plugin surfaces in the UI**

Confirm the four tools appear in the tool list / are callable by the model, and that a non-git workspace returns a helpful error from `git_status`.

- [ ] **Step 4: Push to GitHub**

```bash
git push -u origin main
```

- [ ] **Step 5: Optional — submit to the awesome list**

Follow `awesome-dsh-plugin/awesome-dsh-plugin` contributing guide to add `dsh-git-tools` under **Git & Code Review**.

---

## Self-Review (run after writing the plan)

**Spec coverage:**
- Repo layout ✓ (Task 1)
- `git-exec` chokepoint + cancellation + GitError ✓ (Task 2)
- 4 tools with canonical outputs + render ✓ (Tasks 3–6)
- `git_commit` safety (explicit paths / all, non-empty message) ✓ (Task 6)
- Testing against real throwaway repos ✓ (Tasks 2–6 via `tests/helpers.ts`)
- Publishing: topic (already set), README, MIT, SECURITY, bundle manifest ✓ (Task 1 + 8)

**No placeholders** — every code step contains full, compilable code.

**Type consistency** — `gitExec(cwd, args, signal)`, `resolveCwd(modelCwd, exec)`, `GitStatusValue`, `GitDiffValue`, `GitLogValue`, `GitCommitValue` are defined once and reused; tool exports are `gitStatusTool`/`gitDiffTool`/`gitLogTool`/`gitCommitTool` and are imported under those exact names in `index.ts`.
