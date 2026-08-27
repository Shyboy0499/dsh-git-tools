import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, cleanup, write, commitAll, git } from "./helpers";
import { gitDiffTool } from "../src/tools/diff";

const exec = { signal: new AbortController().signal } as never;

describe("git_diff", () => {
  it("returns an empty stat on a clean repo", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "hello\n");
      commitAll(dir, "initial");
      const value = (await gitDiffTool.execute({ cwd: dir }, exec)) as any;
      expect(value.stat).toEqual([]);
      expect(value.total.files).toBe(0);
      expect(value.patch).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it("returns numstat for unstaged changes by default", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\ntwo\nthree\n");
      commitAll(dir, "initial");
      write(dir, "a.txt", "one\nthree\n");
      const value = (await gitDiffTool.execute({ cwd: dir }, exec)) as any;
      expect(value.total.files).toBe(1);
      expect(value.stat[0]).toMatchObject({ file: "a.txt", added: 0, deleted: 1 });
    } finally {
      cleanup(dir);
    }
  });

  it("diffs the index when staged is true", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      commitAll(dir, "initial");
      write(dir, "a.txt", "one\ntwo\n");
      git(dir, "add", "a.txt");
      const unstaged = (await gitDiffTool.execute({ cwd: dir }, exec)) as any;
      expect(unstaged.total.files).toBe(0);
      const staged = (await gitDiffTool.execute({ cwd: dir, staged: true }, exec)) as any;
      expect(staged.total.files).toBe(1);
      expect(staged.stat[0]).toMatchObject({ added: 1, deleted: 0 });
    } finally {
      cleanup(dir);
    }
  });

  it("returns the full patch when statOnly is false", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      commitAll(dir, "initial");
      write(dir, "a.txt", "one\ntwo\n");
      const value = (await gitDiffTool.execute({ cwd: dir, statOnly: false }, exec)) as any;
      expect(value.patch).toContain("diff --git a/a.txt b/a.txt");
      expect(value.patch).toContain("+two");
    } finally {
      cleanup(dir);
    }
  });

  it("filters by path", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      write(dir, "b.txt", "x\n");
      commitAll(dir, "initial");
      write(dir, "a.txt", "one\ntwo\n");
      write(dir, "b.txt", "x\ny\n");
      const value = (await gitDiffTool.execute({ cwd: dir, path: "b.txt" }, exec)) as any;
      expect(value.total.files).toBe(1);
      expect(value.stat[0].file).toBe("b.txt");
    } finally {
      cleanup(dir);
    }
  });

  it("maps binary files to zero counts", async () => {
    const dir = makeRepo();
    try {
      writeFileSync(join(dir, "b.bin"), Buffer.from([0, 1, 2, 255]));
      commitAll(dir, "initial");
      writeFileSync(join(dir, "b.bin"), Buffer.from([9, 9, 9]));
      const value = (await gitDiffTool.execute({ cwd: dir }, exec)) as any;
      expect(value.total.files).toBe(1);
      expect(value.stat[0]).toMatchObject({ file: "b.bin", added: 0, deleted: 0 });
    } finally {
      cleanup(dir);
    }
  });

  it("sums totals across multiple files", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      write(dir, "b.txt", "x\n");
      commitAll(dir, "initial");
      write(dir, "a.txt", "one\ntwo\n"); // +1
      write(dir, "b.txt", "x\ny\nz\n"); // +2
      const value = (await gitDiffTool.execute({ cwd: dir }, exec)) as any;
      expect(value.total.files).toBe(2);
      expect(value.total.insertions).toBe(3);
      expect(value.total.deletions).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("returns an empty patch string (not null) for statOnly=false with no changes", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "hello\n");
      commitAll(dir, "initial");
      const value = (await gitDiffTool.execute({ cwd: dir, statOnly: false }, exec)) as any;
      expect(value.patch).toBe("");
    } finally {
      cleanup(dir);
    }
  });

  it("reports the new path for a staged rename", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      commitAll(dir, "initial");
      git(dir, "mv", "a.txt", "b.txt");
      git(dir, "add", "-A");
      const value = (await gitDiffTool.execute({ cwd: dir, staged: true }, exec)) as any;
      expect(value.total.files).toBe(1);
      expect(value.stat[0].file).toBe("b.txt");
    } finally {
      cleanup(dir);
    }
  });
});
