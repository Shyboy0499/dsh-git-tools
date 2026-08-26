import { describe, it, expect } from 'vitest'
import { makeRepo, cleanup, write, git, commitAll } from './helpers'
import { gitCommitTool } from '../src/tools/commit'

const exec = { signal: new AbortController().signal } as never

describe('git_commit', () => {
  it('commits staged changes when paths are given', async () => {
    const dir = makeRepo()
    try {
      write(dir, 'a.txt', 'one\n')
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
