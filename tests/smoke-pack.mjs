import { execSync } from "node:child_process";
import fs from "fs";
import path from "path";

/**
 * run - Execute a shell command in cwd.
 * Signed: EyosiyasJ
 */
function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

/**
 * main - Pack import-core and install into a temp project, then run a smoke parse.
 * Signed: EyosiyasJ
 */
async function main() {
  const root = path.resolve(".");
  const tarName = execSync("npm pack", { cwd: root }).toString().trim();
  const tmp = path.join(root, "tmp-smoke");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  run("npm init -y", tmp);
  run(`npm install ../${tarName}`, tmp);
  const code = `import { parseProductsFileFromBuffer } from "@medway/import-core";\nimport fs from "fs";\n(async () => {\n  const buf = fs.readFileSync("../testFiles/Items.xlsx");\n  const res = await parseProductsFileFromBuffer(buf, "Items.xlsx", { mode: "fast", validationMode: "full" });\n  console.log(res.meta.sourceSchema, res.rows.length, res.errors.length);\n})();`;
  fs.writeFileSync(path.join(tmp, "index.mjs"), code);
  run("node index.mjs", tmp);
}

main().catch((e) => { console.error(e); process.exit(1); });