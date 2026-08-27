import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolExec } from "./exec";
import { gitExec, GitError, resolveCwd } from "../src/git-exec";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "dsh-git-exec-"));
}

describe("gitExec", () => {
  it("returns stdout for a successful command", async () => {
    const dir = tempDir();
    try {
      const { stdout } = await gitExec(dir, ["--version"]);
      expect(stdout).toMatch(/^git version /);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws GitError carrying git stderr on a bad command", async () => {
    const dir = tempDir();
    try {
      await expect(gitExec(dir, ["this-is-not-a-real-command"])).rejects.toMatchObject({
        name: "GitError",
        stderr: expect.stringContaining("is not a git command"),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("carries git exit code and stderr on a non-repo error", async () => {
    const dir = tempDir(); // not a git repository
    try {
      try {
        await gitExec(dir, ["status"]);
        expect.fail("gitExec should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(GitError);
        const e = err as GitError;
        expect(e.exitCode).toBeTypeOf("number");
        expect(e.stderr).toContain("not a git repository");
        expect(e.message).toContain("not a git repository");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects with a clear error when cwd is not a directory", async () => {
    await expect(gitExec("/nonexistent/dsh-git-tools-xyz", ["status"])).rejects.toThrow(
      "not a directory",
    );
  });

  it("rejects with AbortError (not GitError) when the signal is already aborted", async () => {
    const dir = tempDir();
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(gitExec(dir, ["status"], controller.signal)).rejects.toMatchObject({
        name: "AbortError",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveCwd", () => {
  it("falls back to the session workspace when no cwd is given", () => {
    expect(resolveCwd(undefined, toolExec("/tmp/session-root"))).toBe("/tmp/session-root");
  });

  it("resolves a relative cwd against the session workspace", () => {
    expect(resolveCwd("subdir", toolExec("/tmp/session-root"))).toBe("/tmp/session-root/subdir");
  });

  it("returns an absolute cwd untouched", () => {
    expect(resolveCwd("/abs/path", toolExec("/tmp/session-root"))).toBe("/abs/path");
  });

  it("returns undefined when neither cwd nor session is available", () => {
    expect(resolveCwd(undefined, undefined)).toBeUndefined();
  });
});
