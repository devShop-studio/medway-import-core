import { RawRow } from "./csv.js";
import { detectSourceSchema, mapRawRowToCanonical } from "./schema.js";
import { sanitizeCanonicalRow } from "./sanitize.js";
import {
  CanonicalProduct,
  ParsedImportResult,
  ParsedRowError,
  SourceSchema,
} from "./types.js";

interface ParseProductsCoreInput {
  rows: RawRow[];
  filename: string;
  headerMeta?: {
    templateVersion?: string;
    headerChecksum?: string;
  };
}

export function parseProductsCore(
  input: ParseProductsCoreInput
): ParsedImportResult {
  const { rows, headerMeta } = input;

  const sourceSchema: SourceSchema = detectSourceSchema(rows, headerMeta);

  const canonicalRows: CanonicalProduct[] = [];
  const errors: ParsedRowError[] = [];
  let parsedRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    const mapped = mapRawRowToCanonical(rawRow, i + 2, sourceSchema);
    if (!mapped) continue;
    const { row, errors: rowErrors } = sanitizeCanonicalRow(mapped, i + 2);
    errors.push(...rowErrors);
    if (row) {
      canonicalRows.push(row);
      parsedRows++;
    }
  }

  return {
    rows: canonicalRows,
    errors,
    meta: {
      sourceSchema,
      templateVersion: headerMeta?.templateVersion,
      headerChecksum: headerMeta?.headerChecksum,
      totalRows: rows.length,
      parsedRows,
    },
  };
}
