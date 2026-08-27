import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tools-"));
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "Test User");
  git(dir, "config", "user.email", "test@example.com");
  return dir;
}

export function write(dir: string, name: string, content: string): void {
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function commitAll(dir: string, message: string): void {
  git(dir, "add", "-A");
  git(dir, "commit", "-m", message);
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
