import { defineTool } from "@deepseek-ai/dsh-tools";
import { gitExec, resolveCwd, GitError } from "../git-exec";

export interface LogEntry {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitLogValue {
  commits: LogEntry[];
  total: number;
}

// Records are delimited by \x1e (unit-record sep) and fields by \x1f (unit sep) via git's
// %x1e/%x1f pretty placeholders — robust against spaces, pipes, and other printable chars
// in subjects and author names. A literal control byte in a commit message would break a
// record, but that is effectively never in practice.
function parseLog(stdout: string): LogEntry[] {
  const commits: LogEntry[] = [];
  for (const record of stdout.split("\x1e")) {
    if (record.length === 0) continue;
    const [hash, author, date, subject] = record.split("\x1f");
    commits.push({ hash, author, date, subject: subject ?? "" });
  }
  return commits;
}

function formatLog(v: GitLogValue): string {
  if (v.commits.length === 0) return "(no commits)";
  return v.commits
    .map((c) => `${c.hash.slice(0, 7)} ${c.date} ${c.author}: ${c.subject}`)
    .join("\n");
}

export const gitLogTool = defineTool({
  name: "git_log",
  description:
    "Show recent commit history as a list of { hash, author, date, subject }, newest first.",
  parameters: {
    cwd: {
      type: "string",
      description: "Working directory for git commands. Defaults to the session workspace.",
    },
    count: { type: "number", description: "Number of commits to show (default 10, max 100)." },
    path: { type: "string", description: "Limit to commits that touched this file path." },
  },
  output: {
    schema: {
      type: "object",
      properties: {
        commits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hash: { type: "string" },
              author: { type: "string" },
              date: { type: "string" },
              subject: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        total: { type: "number" },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [{ type: "text", text: formatLog(value as GitLogValue) }],
  },
  async execute(args, exec) {
    const cwd = resolveCwd(args.cwd, exec);
    if (cwd === undefined) throw new Error("No working directory available; pass cwd explicitly.");
    const count = Math.min(Math.max(Math.floor(args.count ?? 10), 1), 100);
    const logArgs = [
      "log",
      "--pretty=format:%H%x1f%an%x1f%ad%x1f%s%x1e",
      "--date=short",
      "-n",
      String(count),
    ];
    if (args.path) logArgs.push("--", args.path);
    let stdout: string;
    try {
      ({ stdout } = await gitExec(cwd, logArgs, exec.signal));
    } catch (err) {
      // git log fails with a non-zero exit on a repo with no commits yet.
      if (err instanceof GitError && err.stderr.includes("does not have any commits")) {
        return { commits: [], total: 0 };
      }
      throw err;
    }
    const commits = parseLog(stdout);
    return { commits, total: commits.length };
  },
});
