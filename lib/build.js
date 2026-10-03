const { spawn } = require("node:child_process");

// Runs `npm run <script>` in the app's repo, with its output on our terminal.
// Resolves on exit code 0, rejects otherwise — a failed app build must fail
// the site build rather than ship the previous one.
function runBuild(app, script) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      cwd: app.sourceDir,
      stdio: "inherit",
      // npm is npm.cmd on Windows, which spawn only finds through a shell.
      shell: process.platform === "win32",
    });
    child.on("error", (error) => reject(new Error(`[apps] ${app.name}: could not run npm — ${error.message}`)));
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`[apps] ${app.name}: \`npm run ${script}\` failed (${signal ?? `exit code ${code}`})`));
    });
  });
}

module.exports = { runBuild };
