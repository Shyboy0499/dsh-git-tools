# Security Policy

## Scope

`dsh-git-tools` runs git commands on your local machine with your user's
permissions. Installing any dsh plugin executes third-party code in your Harness
environment — review the source before installing.

## Reporting a vulnerability

Do **not** open a public issue for security vulnerabilities.

Report privately to the repository owner via GitHub's private vulnerability
reporting feature, or open a private advisory at:

https://github.com/Shyboy0499/dsh-git-tools/security/advisories

## Security design

- Git commands are executed with `child_process.execFile` using argument arrays —
  never a shell string — so command injection via tool parameters is not possible.
- `git_commit` never stages files implicitly; callers must pass `paths` or `all: true`.
- No credentials are read, stored, or transmitted by this plugin.
