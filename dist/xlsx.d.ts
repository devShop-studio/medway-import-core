import type { RawRow } from "./csv";
export declare function readXlsxToRows(fileBytes: ArrayBuffer): Promise<{
    rows: RawRow[];
    headerMeta?: {
        templateVersion?: string;
        headerChecksum?: string;
    };
}>;
//# sourceMappingURL=xlsx.d.ts.map