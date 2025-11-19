import type { RawRow } from "./csv.js";
export declare function readXlsxToRows(fileBytes: ArrayBuffer): Promise<{
    rows: RawRow[];
    headerMeta?: {
        templateVersion?: string;
        headerChecksum?: string;
    };
}>;
//# sourceMappingURL=xlsx.d.ts.map