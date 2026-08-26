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
        value.branch = head.split('...')[0].trim() || 'HEAD'
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
    render: (_args, value) => [{ type: 'text', text: formatStatus(value as GitStatusValue) }],
  },
  async execute(args, exec) {
    const cwd = resolveCwd(args.cwd, exec)
    if (cwd === undefined) throw new Error('No working directory available; pass cwd explicitly.')
    const { stdout } = await gitExec(cwd, ['status', '--short', '--branch'], exec.signal)
    return parseStatus(stdout)
  },
})
