const fs = require("node:fs");
const path = require("node:path");

const { normalizeApps } = require("./normalize");
const { readBuild, readPackageVersion, readGitInfo } = require("./inspect");
const { mergeFallbackBlock } = require("./htaccess");
const { runBuild } = require("./build");

const DEFAULTS = {
  apps: {},
  output: "dist/web",
  build: false,
  buildScript: "build:web",
  checkBaseHref: "error",
  checkNative: "warn",
  stale: "warn",
  apache: false,
  log: true,
  cwd: undefined,
};

const LEVELS = ["error", "warn", "off"];

function describe(app) {
  const build = readBuild(app.distDir);
  const git = readGitInfo(app.sourceDir);
  return {
    name: app.name,
    url: app.urlPath,
    version: readPackageVersion(app.sourceDir),
    commit: git?.commit ?? null,
    dirty: git?.dirty ?? null,
    builtAt: build.builtAt ? build.builtAt.toISOString() : null,
  };
}

// Collects [level, message] pairs; "off" checks are skipped entirely.
function verify(app, options) {
  const problems = [];
  const add = (level, message) => {
    if (level !== "off") problems.push([level, `${app.name}: ${message}`]);
  };

  const build = readBuild(app.distDir);
  if (!build.exists) {
    // Without a build there is nothing to copy, so this is always an error.
    add("error", `no build at ${build.file} — build the app first`);
  } else if (build.baseHref !== app.urlPath) {
    add(options.checkBaseHref, `${build.file} has <base href="${build.baseHref}">, expected "${app.urlPath}"`);
  }

  if (app.nativeWebDir) {
    const native = readBuild(app.nativeWebDir);
    if (native.exists && native.baseHref !== "/") {
      add(
        options.checkNative,
        `native build ${native.file} has <base href="${native.baseHref}"> — the Capacitor app needs "/"`
      );
    }
  }

  const git = readGitInfo(app.sourceDir);
  if (git && build.exists) {
    if (git.committedAt > build.builtAt) {
      add(options.stale, `build is older than the latest commit ${git.commit} — rebuild`);
    }
    if (git.dirty) {
      add(options.stale, `${app.sourceDir} has uncommitted changes — the build may not match ${git.commit}`);
    }
  }
  return problems;
}

module.exports = function appsPlugin(eleventyConfig, userOptions = {}) {
  const options = { ...DEFAULTS, ...userOptions };
  for (const key of ["checkBaseHref", "checkNative", "stale"]) {
    if (!LEVELS.includes(options[key])) {
      throw new Error(`[apps] \`${key}\` must be one of ${LEVELS.join(", ")}`);
    }
  }
  if (typeof options.build !== "boolean") {
    throw new Error("[apps] `build` must be true or false");
  }
  const cwd = options.cwd ?? process.cwd();
  const apps = normalizeApps(options.apps, {
    output: options.output,
    cwd,
    build: options.build,
    buildScript: options.buildScript,
  });
  const byName = new Map(apps.map((app) => [app.name, app]));

  const log =
    typeof options.log === "function"
      ? options.log
      : options.log
        ? (message) => console.log(`[apps] ${message}`)
        : () => {};

  for (const app of apps) {
    // Copied straight from the app's build output — no intermediate copy in
    // the site's input directory. Eleventy resolves passthrough sources
    // relative to the project root.
    eleventyConfig.addPassthroughCopy({
      [path.relative(cwd, app.distDir) || "."]: app.urlPath.slice(1, -1),
    });
  }

  // A function, so Eleventy re-reads version/commit on every (watch) build.
  eleventyConfig.addGlobalData("apps", () =>
    Object.fromEntries(apps.map((app) => [app.name, describe(app)]))
  );

  // Fails the build on a typo instead of shipping a dead link.
  function appUrl(name) {
    const app = byName.get(name);
    if (!app) {
      throw new Error(`[apps] unknown app "${name}" (known: ${[...byName.keys()].join(", ") || "none"})`);
    }
    return app.urlPath;
  }
  eleventyConfig.addFilter("appUrl", appUrl);
  eleventyConfig.addShortcode("appUrl", appUrl);

  eleventyConfig.on("eleventy.before", async ({ runMode } = {}) => {
    const toBuild = apps.filter((app) => app.buildScript);
    // Not in --watch/--serve: every saved template would rebuild every app.
    if (toBuild.length && runMode && runMode !== "build") {
      log(`skipping app builds in ${runMode} mode — using the existing builds`);
    } else {
      // One after another: parallel Angular builds fight over the CPU and
      // interleave their output.
      for (const app of toBuild) {
        log(`building ${app.name}: npm run ${app.buildScript}`);
        await runBuild(app, app.buildScript);
      }
    }

    const problems = apps.flatMap((app) => verify(app, options));
    for (const [level, message] of problems) log(`${level === "error" ? "ERROR" : "warning"}: ${message}`);
    const errors = problems.filter(([level]) => level === "error");
    if (errors.length) {
      throw new Error(`[apps] ${errors.length} check(s) failed:\n  ${errors.map(([, m]) => m).join("\n  ")}`);
    }
  });

  if (options.apache) {
    eleventyConfig.on("eleventy.after", ({ dir }) => {
      const outputDir = path.resolve(cwd, dir?.output || "_site");
      for (const app of apps) {
        const file = path.join(outputDir, app.urlPath, ".htaccess");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
        fs.writeFileSync(file, mergeFallbackBlock(existing, app.urlPath));
      }
      log(`wrote SPA fallback .htaccess for ${apps.length} app(s)`);
    });
  }
};

module.exports.normalizeApps = normalizeApps;
module.exports.verify = verify;
module.exports.describe = describe;
