const BEGIN = "# BEGIN eleventy-plugin-apps";
const END = "# END eleventy-plugin-apps";

// FallbackResource (mod_dir) rather than mod_rewrite: a RewriteEngine in a
// subdirectory .htaccess replaces the parent's rewrite rules for everything
// below it (unless RewriteOptions Inherit is set), which would silently
// disable site-wide rules such as a www -> apex redirect. FallbackResource
// only kicks in for paths that don't exist, so real files and directories
// inside the app folder (e.g. a help page) are served as usual.
function toFallbackBlock(urlPath) {
  return [
    BEGIN,
    `# Deep links into the single-page app at ${urlPath} fall back to its index.html.`,
    `FallbackResource ${urlPath}index.html`,
    END,
    "",
  ].join("\n");
}

// Puts our block in front of whatever else the file contains, replacing an
// earlier block of ours, so repeated builds don't stack copies.
function mergeFallbackBlock(existing, urlPath) {
  const pattern = new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`, "g");
  const rest = (existing ?? "").replace(pattern, "");
  return toFallbackBlock(urlPath) + rest;
}

module.exports = { toFallbackBlock, mergeFallbackBlock };
