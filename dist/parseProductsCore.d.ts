import { RawRow } from "./csv";
import { ParsedImportResult } from "./types";
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