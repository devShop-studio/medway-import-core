export interface CanonicalProduct {
    product: {
        generic_name: string;
        strength: string;
        form: string;
        category?: string | null;
    };
    batch: {
        batch_no: string;
        expiry_date: string;
        on_hand: number;
        unit_price?: number | null;
        coo?: string | null;
    };
    identity?: {
        cat?: string | null;
        frm?: string | null;
        pkg?: string | null;
        coo?: string | null;
        sku?: string | null;
    };
}
export type SourceSchema = "template_v3" | "legacy_items" | "csv_generic" | "unknown";
export interface ParsedRowError {
    row: number;
    field: string;
    code: string;
    message: string;
}
export interface ParsedImportResult {
    rows: CanonicalProduct[];
    errors: ParsedRowError[];
    meta: {
        sourceSchema: SourceSchema;
        templateVersion?: string;
        headerChecksum?: string;
        totalRows: number;
        parsedRows: number;
    };
}
//# sourceMappingURL=types.d.ts.map