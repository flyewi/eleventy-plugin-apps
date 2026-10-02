const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appsPlugin = require("../lib/apps");
const { tmpDir, makeApp, writeIndex, fakeEleventyConfig } = require("./helpers");

function setup(apps, extra = {}) {
  const cwd = tmpDir();
  const messages = [];
  const config = fakeEleventyConfig();
  appsPlugin(config, { apps: apps(cwd), cwd, log: (m) => messages.push(m), ...extra });
  return { cwd, config, messages };
}

test("passthrough-copies each build straight from the app to its subpath", () => {
  const { config } = setup((cwd) => {
    makeApp(cwd, "crosswind", { web: "/crosswind/" });
    return { crosswind: { path: "/crosswind/", source: "crosswind" } };
  });
  assert.deepEqual(config.passthrough, [{ "crosswind/dist/web": "crosswind" }]);
});

test("resolves sources outside the project root", () => {
  const root = tmpDir();
  makeApp(root, "navsim", { web: "/navsim/" });
  const cwd = path.join(root, "site");
  fs.mkdirSync(cwd);
  const config = fakeEleventyConfig();
  appsPlugin(config, { apps: { navsim: { source: "../navsim" } }, cwd, log: false });
  assert.deepEqual(config.passthrough, [{ "../navsim/dist/web": "navsim" }]);
});

test("defaults the subpath to the app name and normalizes slashes", () => {
  const { config } = setup((cwd) => {
    makeApp(cwd, "a", { web: "/a/" });
    makeApp(cwd, "b", { web: "/x/y/" });
    return { a: { source: "a" }, b: { path: "x/y", source: "b" } };
  });
  assert.equal(config.filters.appUrl("a"), "/a/");
  assert.equal(config.filters.appUrl("b"), "/x/y/");
});

test("appUrl throws on an unknown app instead of producing a dead link", () => {
  const { config } = setup((cwd) => {
    makeApp(cwd, "navsim", { web: "/navsim/" });
    return { navsim: { source: "navsim" } };
  });
  assert.throws(() => config.filters.appUrl("navsimm"), /unknown app "navsimm" \(known: navsim\)/);
  assert.equal(config.shortcodes.appUrl, config.filters.appUrl);
});

test("global data exposes url, version, commit and build time", () => {
  const { config } = setup((cwd) => {
    makeApp(cwd, "timeCalc", { web: "/timeCalc/", version: "2.0.0", git: true });
    return { timeCalc: { source: "timeCalc" } };
  });
  const data = config.globalData.apps().timeCalc;
  assert.equal(data.url, "/timeCalc/");
  assert.equal(data.version, "2.0.0");
  assert.match(data.commit, /^[0-9a-f]{7,}$/);
  assert.equal(data.dirty, false);
  assert.ok(Date.parse(data.builtAt));
});

test("global data has null commit outside git", () => {
  const { config } = setup((cwd) => {
    makeApp(cwd, "a", { web: "/a/" });
    return { a: { source: "a" } };
  });
  assert.equal(config.globalData.apps().a.commit, null);
});

test("passes when the build has the right base href", async () => {
  const { config, messages } = setup((cwd) => {
    makeApp(cwd, "a", { web: "/a/", native: "/", git: true });
    return { a: { source: "a", nativeWebDir: "www/browser" } };
  });
  await config.fire("eleventy.before");
  assert.deepEqual(messages, []);
});

test("fails the build when the web build has the wrong base href", async () => {
  const { config } = setup((cwd) => {
    makeApp(cwd, "a", { web: "/" });
    return { a: { source: "a" } };
  });
  await assert.rejects(config.fire("eleventy.before"), /has <base href="\/">, expected "\/a\/"/);
});

test("checkBaseHref: 'warn' reports without failing", async () => {
  const { config, messages } = setup(
    (cwd) => {
      makeApp(cwd, "a", { web: "/" });
      return { a: { source: "a" } };
    },
    { checkBaseHref: "warn" }
  );
  await config.fire("eleventy.before");
  assert.match(messages[0], /^warning: a: .*expected "\/a\/"/);
});

test("always fails when the build is missing", async () => {
  const { config } = setup(
    (cwd) => {
      makeApp(cwd, "a");
      return { a: { source: "a" } };
    },
    { checkBaseHref: "off" }
  );
  await assert.rejects(config.fire("eleventy.before"), /no build at .*index\.html/);
});

test("warns when the native Capacitor build lost its root base href", async () => {
  const { config, messages } = setup((cwd) => {
    makeApp(cwd, "navsim", { web: "/navsim/", native: "/navsim/" });
    return { navsim: { source: "navsim", nativeWebDir: "www/browser" } };
  });
  await config.fire("eleventy.before");
  assert.match(messages[0], /^warning: navsim: native build .* the Capacitor app needs "\/"/);
});

test("warns about a build older than the latest commit", async () => {
  const { config, messages } = setup((cwd) => {
    const dir = makeApp(cwd, "a", { web: "/a/", git: true });
    const old = new Date(Date.now() - 3600_000);
    fs.utimesSync(path.join(dir, "dist/web/index.html"), old, old);
    return { a: { source: "a" } };
  });
  await config.fire("eleventy.before");
  assert.match(messages.join("\n"), /older than the latest commit/);
});

test("warns about uncommitted changes in the app repo", async () => {
  const { config, messages } = setup((cwd) => {
    const dir = makeApp(cwd, "a", { web: "/a/", git: true });
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    return { a: { source: "a" } };
  });
  await config.fire("eleventy.before");
  assert.match(messages.join("\n"), /uncommitted changes/);
});

test("rejects invalid options", () => {
  const config = fakeEleventyConfig();
  assert.throws(() => appsPlugin(config, { apps: { a: {} }, log: false }), /needs a `source`/);
  assert.throws(() => appsPlugin(config, { apps: { a: { source: ".", path: "/" } }, log: false }), /subpath/);
  assert.throws(() => appsPlugin(config, { apps: {}, stale: "loud", log: false }), /`stale` must be one of/);
});

test("apache: writes an idempotent SPA fallback .htaccess per app", async () => {
  const { cwd, config } = setup(
    (cwd) => {
      makeApp(cwd, "crosswind", { web: "/crosswind/" });
      return { crosswind: { source: "crosswind" } };
    },
    { apache: true }
  );
  const file = path.join(cwd, "_site/crosswind/.htaccess");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "Header set X-Test 1\n");

  await config.fire("eleventy.after", { dir: { output: "_site" } });
  await config.fire("eleventy.after", { dir: { output: "_site" } });

  const contents = fs.readFileSync(file, "utf8");
  assert.equal(contents.match(/FallbackResource \/crosswind\/index\.html/g).length, 1);
  assert.ok(contents.endsWith("Header set X-Test 1\n"));
});

test("apache: off by default", () => {
  const { config } = setup((cwd) => {
    writeIndex(path.join(cwd, "a/dist/web"), "/a/");
    return { a: { source: "a" } };
  });
  assert.equal(config.has("eleventy.after"), false);
});
