const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Reads <base href> from a build's index.html. `baseHref` is null when the
// file has no <base> tag, `exists` is false when the build is missing.
function readBuild(dir) {
  const file = path.join(dir, "index.html");
  if (!fs.existsSync(file)) return { file, exists: false, baseHref: undefined, builtAt: null };
  const match = fs.readFileSync(file, "utf8").match(/<base\s+href\s*=\s*["']([^"']*)["']/i);
  return {
    file,
    exists: true,
    baseHref: match ? match[1] : null,
    builtAt: fs.statSync(file).mtime,
  };
}

function readPackageVersion(sourceDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(sourceDir, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

function git(sourceDir, args) {
  try {
    return execFileSync("git", ["-C", sourceDir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Returns null when sourceDir is not inside a git work tree.
function readGitInfo(sourceDir) {
  const commit = git(sourceDir, ["rev-parse", "--short", "HEAD"]);
  if (!commit) return null;
  // Tracked files only: untracked scratch files don't end up in a build.
  const status = git(sourceDir, ["status", "--porcelain", "--untracked-files=no"]);
  return {
    commit,
    committedAt: new Date(git(sourceDir, ["log", "-1", "--format=%cI"])),
    dirty: Boolean(status),
  };
}

module.exports = { readBuild, readPackageVersion, readGitInfo };
