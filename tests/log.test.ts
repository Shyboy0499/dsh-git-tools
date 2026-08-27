import { describe, it, expect } from "vitest";
import { makeRepo, cleanup, write, commitAll } from "./helpers";
import { toolExec } from "./exec";
import { gitLogTool } from "../src/tools/log";

const exec = toolExec();

describe("git_log", () => {
  it("returns commits newest-first with hash, author, date, subject", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      commitAll(dir, "first commit");
      write(dir, "a.txt", "one\ntwo\n");
      commitAll(dir, "second commit");
      const value = (await gitLogTool.execute({ cwd: dir }, exec)) as any;
      expect(value.commits.length).toBe(2);
      expect(value.commits[0].subject).toBe("second commit");
      expect(value.commits[1].subject).toBe("first commit");
      expect(value.commits[0].hash).toMatch(/^[0-9a-f]{40}$/);
      expect(value.commits[0].author).toBe("Test User");
      expect(value.commits[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(value.total).toBe(2);
    } finally {
      cleanup(dir);
    }
  });

  it("respects count and path filters", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      write(dir, "b.txt", "x\n");
      commitAll(dir, "both files");
      write(dir, "a.txt", "one\ntwo\n");
      commitAll(dir, "only a");
      const all = (await gitLogTool.execute({ cwd: dir, count: 1 }, exec)) as any;
      expect(all.commits.length).toBe(1);
      const path = (await gitLogTool.execute({ cwd: dir, path: "b.txt" }, exec)) as any;
      expect(path.commits.map((c: any) => c.subject)).toEqual(["both files"]);
    } finally {
      cleanup(dir);
    }
  });

  it("returns an empty list for a repo with no commits", async () => {
    const dir = makeRepo();
    try {
      const value = (await gitLogTool.execute({ cwd: dir }, exec)) as any;
      expect(value.commits).toEqual([]);
      expect(value.total).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  it("clamps count to the [1,100] range", async () => {
    const dir = makeRepo();
    try {
      write(dir, "a.txt", "one\n");
      commitAll(dir, "first");
      write(dir, "a.txt", "one\ntwo\n");
      commitAll(dir, "second");
      const low = (await gitLogTool.execute({ cwd: dir, count: 0 }, exec)) as any;
      expect(low.commits.length).toBe(1);
      const high = (await gitLogTool.execute({ cwd: dir, count: 1000 }, exec)) as any;
      expect(high.commits.length).toBe(2);
      const frac = (await gitLogTool.execute({ cwd: dir, count: 2.9 }, exec)) as any;
      expect(frac.commits.length).toBe(2);
    } finally {
      cleanup(dir);
    }
  });
});
