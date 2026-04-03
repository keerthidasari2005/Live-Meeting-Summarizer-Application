import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const children = [];
let shuttingDown = false;
const useShell = process.platform === "win32";

function startProcess(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: useShell,
    windowsHide: false,
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`${name} exited unexpectedly with ${signal ? `signal ${signal}` : `code ${code}`}.`);
      shutdown(code ?? 1);
    }
  });

  children.push(child);
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed && child.pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        child.kill("SIGTERM");
      }
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting Flask upload backend on http://127.0.0.1:5001");
startProcess("backend", "python", ["backend/app.py"]);

console.log("Starting Vite frontend on http://127.0.0.1:8080");
startProcess("frontend", "npm", ["run", "dev:web"]);
