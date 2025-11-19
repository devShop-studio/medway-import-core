import { RawRow } from "./csv.js";
import { ParsedImportResult } from "./types.js";
interface ParseProductsCoreInput {
    rows: RawRow[];
    filename: string;
    headerMeta?: {
        templateVersion?: string;
        headerChecksum?: string;
    };
}
export declare function parseProductsCore(input: ParseProductsCoreInput): ParsedImportResult;
export {};
//# sourceMappingURL=parseProductsCore.d.ts.map