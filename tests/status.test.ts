import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo, cleanup, write, commitAll, git } from "./helpers";
import { gitStatusTool } from "../src/tools/status";

const exec = { signal: new AbortController().signal } as never;

describe("git_status", () => {
  it("reports a clean repo on main", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "hello\n");
      commitAll(dir, "initial");
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any;
      expect(value.branch).toBe("main");
      expect(value.ahead).toBe(0);
      expect(value.behind).toBe(0);
      expect(value.staged).toEqual([]);
      expect(value.unstaged).toEqual([]);
      expect(value.untracked).toEqual([]);
    } finally {
      cleanup(dir);
    }
  });

  it("separates staged, unstaged, and untracked files", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "hello\n");
      commitAll(dir, "initial");
      write(dir, "a.txt", "changed\n");
      git(dir, "add", "a.txt"); // staged modification (M in index column)
      write(dir, "a.txt", "changed again\n"); // modified again -> AM: both columns
      write(dir, "c.txt", "new\n"); // untracked
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any;
      expect(value.staged.map((s: any) => s.path).sort()).toEqual(["a.txt"]);
      expect(value.unstaged.map((s: any) => s.path).sort()).toEqual(["a.txt"]);
      expect(value.untracked).toEqual(["c.txt"]);
    } finally {
      cleanup(dir);
    }
  });

  it("reports a branch name containing dots correctly", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "hello\n");
      commitAll(dir, "initial");
      git(dir, "checkout", "-b", "release/1.0");
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any;
      expect(value.branch).toBe("release/1.0");
    } finally {
      cleanup(dir);
    }
  });

  it("reports an unborn branch (no commits yet)", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "hello\n");
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any;
      expect(value.branch).toBe("main");
      expect(value.staged).toEqual([]);
      expect(value.untracked).toEqual(["a.txt"]);
    } finally {
      cleanup(dir);
    }
  });

  it("reports a detached HEAD", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "hello\n");
      commitAll(dir, "initial");
      git(dir, "checkout", "--detach");
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any;
      expect(value.branch).toBe("HEAD");
    } finally {
      cleanup(dir);
    }
  });

  it("reports ahead of the upstream", async () => {
    const dir = makeRepo();
    const remote = mkdtempSync(join(tmpdir(), "dsh-git-tools-remote-"));
    try {
      write(dir, "a.txt", "one\n");
      commitAll(dir, "initial");
      git(remote, "init", "--bare");
      git(dir, "remote", "add", "origin", remote);
      git(dir, "push", "-u", "origin", "main");
      write(dir, "b.txt", "x\n");
      commitAll(dir, "local only");
      const value = (await gitStatusTool.execute({ cwd: dir }, exec)) as any;
      expect(value.ahead).toBe(1);
      expect(value.behind).toBe(0);
    } finally {
      rmSync(remote, { recursive: true, force: true });
      cleanup(dir);
    }
  });
});
