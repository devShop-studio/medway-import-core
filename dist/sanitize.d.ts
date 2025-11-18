import { CanonicalProduct, ParsedRowError } from "./types";
export type IssueLevel = "error" | "warn";
export type Issue = {
    field: string;
    code: string;
    msg: string;
    level: IssueLevel;
};
export type Row = Record<string, unknown>;
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
export declare function sanitizeRow(input: Row): {
    row: Row;
    issues: Issue[];
};
export declare function sanitizeCanonicalRow(raw: Partial<CanonicalProduct>, rowIndex: number): {
    row: CanonicalProduct | null;
    errors: ParsedRowError[];
};
export {};
//# sourceMappingURL=sanitize.d.ts.map