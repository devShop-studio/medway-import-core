import type { CanonicalProduct, ParsedRowError } from "./types.js";
export type IssueLevel = "error" | "warn";
export type Issue = {
    field: string;
    code: string;
    msg: string;
    level: IssueLevel;
};
export interface CanonicalRowInput {
    generic_name?: unknown;
    strength?: unknown;
    form?: unknown;
    brand_name?: unknown;
    gtin?: unknown;
    category?: unknown;
    requires_prescription?: unknown;
    is_controlled?: unknown;
    storage_conditions?: unknown;
    description?: unknown;
    batch_no?: unknown;
    expiry_date?: unknown;
    on_hand?: unknown;
    unit_price?: unknown;
    reserved?: unknown;
    purchase_unit?: unknown;
    pieces_per_unit?: unknown;
    unit?: unknown;
    cat?: unknown;
    frm?: unknown;
    pkg?: unknown;
    coo?: unknown;
    sku?: unknown;
}
export interface SanitizedRow {
    generic_name: string;
    strength?: string;
    form?: FormEnum;
    brand_name?: string;
    gtin?: string;
    category?: string;
    requires_prescription?: boolean;
    is_controlled?: boolean;
    storage_conditions?: string;
    description?: string;
    batch_no?: string;
    expiry_date?: string;
    on_hand?: number;
    unit_price?: number;
    reserved?: number;
    purchase_unit?: string;
    pieces_per_unit?: string;
    unit?: string;
    cat?: string;
    frm?: string;
    pkg?: string;
    coo?: string;
    sku?: string;
}
declare const FORM_ENUM: readonly ["tablet", "capsule", "syrup", "injection", "cream", "ointment", "drops", "inhaler", "other"];
type FormEnum = (typeof FORM_ENUM)[number];
export declare function sanitizeForm(v: unknown): {
    value?: FormEnum;
    issues: Issue[];
    suggestion?: FormEnum;
};
export declare function sanitizeStrength(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeGTIN(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeBool(v: unknown): {
    value?: boolean;
    issues: Issue[];
};
export declare function sanitizeBatchNo(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeExpiry(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeNumber(v: unknown, { gt, ge }?: {
    gt?: number;
    ge?: number;
}): {
    value?: number;
    issues: Issue[];
};
export declare function sanitizeGenericName(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeCategoryCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeFormCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeCountryCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizePackageCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeRow(input: CanonicalRowInput): {
    row: SanitizedRow;
    issues: Issue[];
};
export declare function sanitizeCanonicalRow(raw: Partial<CanonicalProduct>, rowIndex: number): {
    row: CanonicalProduct | null;
    errors: ParsedRowError[];
};
export {};
//# sourceMappingURL=sanitize.d.ts.map