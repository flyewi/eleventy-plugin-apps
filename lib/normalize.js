const path = require("node:path");

// "/crosswind" | "crosswind/" | "/crosswind/" -> "/crosswind/"
function normalizeUrlPath(urlPath) {
  const trimmed = String(urlPath).replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new Error('[apps] an app cannot be mounted at "/" — use a subpath');
  return `/${trimmed}/`;
}

// Turns the user's `apps` option into a list of fully resolved app entries.
// Relative directories resolve against `cwd` (the Eleventy project root).
function normalizeApps(apps, { output, cwd }) {
  if (!apps || typeof apps !== "object" || Array.isArray(apps)) {
    throw new Error("[apps] `apps` must be an object map of { name: { path, source } }");
  }
  return Object.entries(apps).map(([name, entry]) => {
    if (!entry?.source) throw new Error(`[apps] app "${name}" needs a \`source\` directory`);
    const sourceDir = path.resolve(cwd, entry.source);
    return {
      name,
      urlPath: normalizeUrlPath(entry.path ?? name),
      sourceDir,
      distDir: path.resolve(sourceDir, entry.output ?? output),
      nativeWebDir: entry.nativeWebDir ? path.resolve(sourceDir, entry.nativeWebDir) : null,
    };
  });
}

module.exports = { normalizeApps, normalizeUrlPath };
