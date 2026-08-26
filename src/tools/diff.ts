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
    // Rename entries appear as "old.txt => new.txt" in --cached diffs; report the new path.
    const file = match[3].replace(/^.* => /, '')
    stat.push({ file, added, deleted })
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
        patch: { oneOf: [{ type: 'string' }, { type: 'null' }] },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [{ type: 'text', text: formatDiff(value as GitDiffValue) }],
  },
  async execute(args, exec) {
    const cwd = resolveCwd(args.cwd, exec)
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
