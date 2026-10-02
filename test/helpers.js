const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apps-plugin-"));
}

function writeIndex(dir, baseHref) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><html><head><base href="${baseHref}"></head></html>`);
}

// A minimal app repo: package.json plus optional web/native builds and git.
function makeApp(root, name, { web, native, version = "1.2.3", git = false } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version }));
  if (git) {
    const run = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
    run("init", "-q");
    run("-c", "user.name=t", "-c", "user.email=t@t", "add", "package.json");
    run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  }
  // Builds are written after the commit, like a real build.
  if (web !== undefined) writeIndex(path.join(dir, "dist/web"), web);
  if (native !== undefined) writeIndex(path.join(dir, "www/browser"), native);
  return dir;
}

function fakeEleventyConfig() {
  const handlers = {};
  return {
    passthrough: [],
    globalData: {},
    filters: {},
    shortcodes: {},
    addPassthroughCopy(mapping) {
      this.passthrough.push(mapping);
    },
    addGlobalData(name, value) {
      this.globalData[name] = value;
    },
    addFilter(name, fn) {
      this.filters[name] = fn;
    },
    addShortcode(name, fn) {
      this.shortcodes[name] = fn;
    },
    on(event, fn) {
      handlers[event] = fn;
    },
    async fire(event, payload) {
      return handlers[event]?.(payload);
    },
    has(event) {
      return Boolean(handlers[event]);
    },
  };
}

module.exports = { tmpDir, writeIndex, makeApp, fakeEleventyConfig };
