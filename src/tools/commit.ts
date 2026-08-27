import { defineTool } from "@deepseek-ai/dsh-tools";
import { gitExec, resolveCwd } from "../git-exec";

export interface GitCommitValue {
  success: boolean;
  hash: string | null;
  branch: string | null;
  filesStaged: number;
}

export const gitCommitTool = defineTool({
  name: "git_commit",
  description:
    "Create a git commit with a required non-empty message. Stage specific files with paths, or stage everything with all: true. With neither, commits the already-staged changes.",
  parameters: {
    cwd: {
      type: "string",
      description: "Working directory for git commands. Defaults to the session workspace.",
    },
    message: { type: "string", required: true, description: "Commit message. Must be non-empty." },
    paths: {
      type: "array",
      items: { type: "string" },
      description: "Files to stage before committing.",
    },
    all: {
      type: "boolean",
      description: "Stage all changes with git add -A before committing. Default false.",
    },
  },
  output: {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        hash: { oneOf: [{ type: "string" }, { type: "null" }] },
        branch: { oneOf: [{ type: "string" }, { type: "null" }] },
        filesStaged: { type: "number" },
      },
      additionalProperties: false,
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.success
          ? `Committed ${value.hash} on ${value.branch ?? "detached HEAD"} (${value.filesStaged} file(s) staged).`
          : "Commit failed.",
      },
    ],
  },
  async execute(args, exec) {
    const message = args.message.trim();
    if (message.length === 0) throw new Error("Commit message must be non-empty.");
    const cwd = resolveCwd(args.cwd, exec);
    if (cwd === undefined) throw new Error("No working directory available; pass cwd explicitly.");

    if (args.paths && args.paths.length > 0) {
      await gitExec(cwd, ["add", "--", ...args.paths], exec.signal);
    } else if (args.all) {
      await gitExec(cwd, ["add", "-A"], exec.signal);
    }

    const staged = await gitExec(cwd, ["diff", "--cached", "--name-only"], exec.signal);
    const filesStaged = staged.stdout.split("\n").filter((l) => l.length > 0).length;

    await gitExec(cwd, ["commit", "-m", message], exec.signal);

    const [hashOut, branchOut] = await Promise.all([
      gitExec(cwd, ["rev-parse", "HEAD"], exec.signal),
      gitExec(cwd, ["branch", "--show-current"], exec.signal),
    ]);
    return {
      success: true,
      hash: hashOut.stdout.trim(),
      branch: branchOut.stdout.trim() || null,
      filesStaged,
    };
  },
});
