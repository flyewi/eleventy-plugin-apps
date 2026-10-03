const path = require("node:path");

// "/crosswind" | "crosswind/" | "/crosswind/" -> "/crosswind/"
function normalizeUrlPath(urlPath) {
  const trimmed = String(urlPath).replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new Error('[apps] an app cannot be mounted at "/" — use a subpath');
  return `/${trimmed}/`;
}

// Turns the user's `apps` option into a list of fully resolved app entries.
// Relative directories resolve against `cwd` (the Eleventy project root).
function normalizeApps(apps, { output, cwd, build = false, buildScript = "build:web" }) {
  if (!apps || typeof apps !== "object" || Array.isArray(apps)) {
    throw new Error("[apps] `apps` must be an object map of { name: { path, source } }");
  }
  return Object.entries(apps).map(([name, entry]) => {
    if (!entry?.source) throw new Error(`[apps] app "${name}" needs a \`source\` directory`);
    const sourceDir = path.resolve(cwd, entry.source);
    if (entry.build !== undefined && typeof entry.build !== "boolean") {
      throw new Error(`[apps] app "${name}": \`build\` must be true or false`);
    }
    const script = entry.buildScript ?? buildScript;
    if (typeof script !== "string" || !script) {
      throw new Error(`[apps] app "${name}": \`buildScript\` must be an npm script name`);
    }
    return {
      name,
      urlPath: normalizeUrlPath(entry.path ?? name),
      sourceDir,
      distDir: path.resolve(sourceDir, entry.output ?? output),
      nativeWebDir: entry.nativeWebDir ? path.resolve(sourceDir, entry.nativeWebDir) : null,
      // npm script to run before the build, or null to use the existing build as is.
      buildScript: (entry.build ?? build) ? script : null,
    };
  });
}

module.exports = { normalizeApps, normalizeUrlPath };
