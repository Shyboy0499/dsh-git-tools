import type { Context } from '@deepseek-ai/cordis'
import { gitStatusTool } from './tools/status'

export const name = 'git-tools'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(gitStatusTool)
}
