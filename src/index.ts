import { parseProductsCore } from "./parseProductsCore";
import { parseCsvToRows } from "./csv";
import { readXlsxToRows } from "./xlsx";
import type { ParsedImportResult } from "./types";

export * from "./types";
export * from "./sanitize";
export { parseProductsCore };

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
