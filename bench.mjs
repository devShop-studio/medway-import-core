import fs from "fs";
import { performance } from "node:perf_hooks";
import path from "path";
import { parseProductsFileFromBuffer } from "./dist/index.js";

/**
 * bench - Measure parseProductsFileFromBuffer timings.
 * Signed: EyosiyasJ
 */
async function bench(file, opts) {
  const buf = await fs.promises.readFile(file);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const t0 = performance.now();
  const res = await parseProductsFileFromBuffer(bytes, path.basename(file), opts);
  const t1 = performance.now();
  const ms = t1 - t0;
  console.log({ file, mode: opts.mode, validationMode: opts.validationMode, rows: res.rows.length, errors: res.errors.length, ms, msPerRow: ms / Math.max(1, res.rows.length) });
}

/**
 * main - Run benchmarks against BigItems.xlsx.
 * Signed: EyosiyasJ
 */
async function main() {
  const big = path.resolve("./testFiles/BigItems.xlsx");
  await bench(big, { mode: "fast", validationMode: "errorsOnly" });
  await bench(big, { mode: "deep", validationMode: "errorsOnly" });
}

main().catch((e) => { console.error(e); process.exit(1); });