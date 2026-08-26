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
    throw new GitError(e.stderr ?? e.message ?? String(err), typeof e.code === 'number' ? e.code : null)
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
