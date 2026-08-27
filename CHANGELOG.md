# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-26

### Added

- Four local git tools for DeepSeek Harness: `git_status`, `git_diff`, `git_log`,
  and `git_commit`, operating on the session workspace.
- `git-exec` safe `execFile` wrapper (args-as-arrays, no shell) with session-workspace
  resolution and cooperative cancellation.
- 35 vitest tests running against real throwaway git repositories.
- `dsh.bundle` manifest for `dsh plugin add` installs.
- CI (GitHub Actions), Prettier + oxlint tooling, and npm publish metadata with
  `@deepseek-ai/*` peer dependencies.
