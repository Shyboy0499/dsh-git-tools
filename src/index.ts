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
