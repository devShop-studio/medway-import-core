import type { RawRow } from "./csv.js";
/**
 * Read an Excel workbook from `ArrayBuffer` and return normalized rows plus optional header metadata.
 * - Chooses the main sheet (prefers `Products`) and converts to `RawRow[]`.
 * - Extracts `__meta` sheet keys: `template_version`, `header_checksum` when present.
 * Signed: EyosiyasJ
 */
export declare function readXlsxToRows(fileBytes: ArrayBuffer): Promise<{
    rows: RawRow[];
    headerMeta?: {
        templateVersion?: string;
        headerChecksum?: string;
    };
}>;
//# sourceMappingURL=xlsx.d.ts.map