import { detectSourceSchema, mapRawRowToCanonical } from "./schema";
import { sanitizeCanonicalRow } from "./sanitize";
export function parseProductsCore(input) {
    const { rows, headerMeta } = input;
    const sourceSchema = detectSourceSchema(rows, headerMeta);
    const canonicalRows = [];
    const errors = [];
    let parsedRows = 0;
    for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];
        const mapped = mapRawRowToCanonical(rawRow, i + 2, sourceSchema);
        if (!mapped)
            continue;
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
            templateVersion: headerMeta === null || headerMeta === void 0 ? void 0 : headerMeta.templateVersion,
            headerChecksum: headerMeta === null || headerMeta === void 0 ? void 0 : headerMeta.headerChecksum,
            totalRows: rows.length,
            parsedRows,
        },
    };
}
