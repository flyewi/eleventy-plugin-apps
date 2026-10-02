# eleventy-plugin-apps

[![Buy me a coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/flyewiy)

Eleventy plugin that mounts separately built single-page apps (Angular, Ionic, Vue, …) under subpaths of your site — straight from each app's build output, with checks that catch the classic mistakes before they go live.

## Why

Embedding an SPA under `/myapp/` sounds like one `addPassthroughCopy` line. In practice it breaks in quiet ways:

- the app was built with `<base href="/">` and every script 404s under `/myapp/`,
- the same app also ships as a Capacitor/Ionic native app, whose build must keep `<base href="/">` — and a config change for the web silently breaks the store build,
- a deep link like `/myapp/settings` works in the browser until someone reloads it,
- links to the app are hardcoded across templates and rot when a path changes,
- nobody knows which commit of the app is actually online.

This plugin copies each app's build to its subpath and, on every Eleventy build:

- **fails** if the web build's `<base href>` doesn't match its subpath (or the build is missing),
- **warns** if the native (Capacitor) build lost `<base href="/">`,
- **warns** if the build is older than the app's latest commit or the app repo has uncommitted changes,
- exposes URL, version and commit to templates, with an `appUrl` filter that **fails** on unknown app names,
- optionally writes an Apache `.htaccess` per app so deep links fall back to the app's `index.html`.

It never builds or modifies the apps — building stays a separate step in each app's repo.

## Installation

```
npm install --save-dev @flyewi/eleventy-plugin-apps
```

```js
const appsPlugin = require("@flyewi/eleventy-plugin-apps");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(appsPlugin, {
    apps: {
      crosswind: { source: "../crosswind-calculator", nativeWebDir: "www/browser" },
      navsim: { path: "/tools/navsim/", source: "../ew_navsimulator" },
    },
    apache: true,
  });
};
```

Each app's web build must be made for its subpath, e.g. an Angular build configuration with `"baseHref": "/crosswind/"` and `"outputPath": { "base": "dist/web", "browser": "" }`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `apps` | `{}` | Map of app name → app config (see below). |
| `output` | `"dist/web"` | Default build output directory, relative to each app's `source`. |
| `checkBaseHref` | `"error"` | Web build's `<base href>` must equal its subpath. `"error"`, `"warn"` or `"off"`. A missing build is always an error. |
| `checkNative` | `"warn"` | `nativeWebDir` build must have `<base href="/">`. Skipped if that build doesn't exist. |
| `stale` | `"warn"` | Build older than the app's latest git commit, or uncommitted changes in the app repo. |
| `apache` | `false` | Write `<output>/<path>/.htaccess` with a `FallbackResource` for deep links. |
| `log` | `true` | `false` to silence, or a function receiving each message. |

App config:

| Key | Default | Description |
| --- | --- | --- |
| `source` | — (required) | App repo directory, relative to the Eleventy project root. May lie outside it. |
| `path` | `/<name>/` | Subpath on the site. Slashes are normalized. |
| `output` | plugin `output` | Build output directory, relative to `source`. |
| `nativeWebDir` | — | Capacitor `webDir` (e.g. `www/browser`), relative to `source`, for the native check. |

## In templates

```njk
<a href="{{ 'crosswind' | appUrl }}">Crosswind Calculator</a>
<small>v{{ apps.crosswind.version }} ({{ apps.crosswind.commit }})</small>
```

`apps.<name>` has `url`, `version` (from the app's `package.json`), `commit`, `dirty` (both `null` outside git) and `builtAt` (ISO date of the build's `index.html`). `appUrl` is available as filter and shortcode.

## Apache deep links

With `apache: true` each app folder gets:

```apache
# BEGIN eleventy-plugin-apps
FallbackResource /crosswind/index.html
# END eleventy-plugin-apps
```

`FallbackResource` (mod_dir) only applies to paths that don't exist, so real files and folders inside the app's subpath keep working. It's used instead of `mod_rewrite` on purpose: a `RewriteEngine` in a subdirectory `.htaccess` replaces the parent directory's rewrite rules, which would silently disable site-wide rules like a `www` → apex redirect. An existing `.htaccess` in the app's build is kept; the plugin only owns its marked block.

For Netlify, add a rewrite like `/crosswind/*  /crosswind/index.html  200` to your `_redirects` instead.

## Guarding the native build from the app side

The plugin only runs when the site is built. To stop a wrong build from reaching the native app at the source, add a Capacitor hook to the app's `package.json` that checks `$CAPACITOR_WEB_DIR/index.html` for `<base href="/">` — `capacitor:copy:before` runs before every `cap copy`, `cap sync` and `cap run`.

## License

MIT
