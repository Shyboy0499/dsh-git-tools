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
      write(dir, 'a.txt', 'changed\n')
      write(dir, 'b.txt', 'ready\n')
      commitAll(dir, 'second')
      write(dir, 'a.txt', 'changed again\n')
      git(dir, 'add', 'a.txt')
      write(dir, 'c.txt', 'new\n')
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any
      expect(value.staged.map((s: any) => s.path).sort()).toEqual(['a.txt'])
      expect(value.unstaged).toEqual([])
      expect(value.untracked).toEqual(['c.txt'])
    } finally {
      cleanup(dir)
    }
  })

  it('reports a branch name containing dots correctly', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'hello\n')
      commitAll(dir, 'initial')
      git(dir, 'checkout', '-b', 'release/1.0')
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any
      expect(value.branch).toBe('release/1.0')
    } finally {
      cleanup(dir)
    }
  })
})
