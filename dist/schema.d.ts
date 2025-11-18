import { RawRow } from "./csv";
import { CanonicalProduct, SourceSchema } from "./types";
export declare function detectSourceSchema(rows: RawRow[], headerMeta?: {
    templateVersion?: string;
    headerChecksum?: string;
}): SourceSchema;
export declare function mapRawRowToCanonical(raw: RawRow, excelRowIndex: number, schema: SourceSchema): Partial<CanonicalProduct> | null;
//# sourceMappingURL=schema.d.ts.map