import { parseProductsCore } from "./parseProductsCore.js";
import { parseCsvToRows } from "./csv.js";
import { readXlsxToRows } from "./xlsx.js";
import type { ParsedImportResult } from "./types.js";

export * from "./types.js";
export * from "./sanitize.js";
export { parseProductsCore };

/**
 * Parse a products file (XLSX or CSV) from bytes and produce canonical rows with errors and meta.
 * Accepts ArrayBuffer input to work in web and React Native environments.
 */
export async function parseProductsFileFromBuffer(
  fileBytes: ArrayBuffer,
  filename: string
): Promise<ParsedImportResult> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".xlsx")) {
    const { rows, headerMeta } = await readXlsxToRows(fileBytes);
    return parseProductsCore({ rows, headerMeta, filename });
  }

  const text = new TextDecoder("utf-8").decode(fileBytes);
  const rows = parseCsvToRows(text);
  return parseProductsCore({ rows, filename });
}
