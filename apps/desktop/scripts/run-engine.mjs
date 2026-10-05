// Dev helper: start the Python engine for browser-only development (`npm run dev` + `npm run engine`).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const venv = resolve(root, ".venv/bin/python");
const winVenv = resolve(root, ".venv/Scripts/python.exe");
const py = process.env.OPTILAB_PYTHON || (existsSync(venv) ? venv : existsSync(winVenv) ? winVenv : "python3");
const p = spawn(py, ["-m", "optilab.server", "--port", process.env.OPTILAB_PORT || "8765"], {
  stdio: "inherit", cwd: resolve(root, "engine"),
});
p.on("exit", (c) => process.exit(c ?? 0));
