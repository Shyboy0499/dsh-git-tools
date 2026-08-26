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
  deps: {
    neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
  },
}

export default [lib]
