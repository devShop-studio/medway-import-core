export type RawRow = Record<string, string | number | null>;
/**
 * Parse CSV text into `RawRow[]` using a simple state machine that handles quoted fields
 * and commas within quotes. Mirrors behavior of the web importer to preserve UI expectations.
 * Signed: EyosiyasJ
 */
export declare function parseCsvToRows(csvText: string): RawRow[];
/**
 * Parse CSV text into array-of-arrays preserving all rows.
 * Used for header vs headerless detection and dual-path parsing in the entry API.
 * Signed: EyosiyasJ
 */
export declare function parseCsvRaw(csvText: string): string[][];
/**
 * parseDsvRaw
 * Generalized delimiter-separated values parser with quote handling.
 * Supports ',', ';', '\t', '|'. Returns array-of-arrays without headers.
 * Signed: EyosiyasJ
 */
export declare function parseDsvRaw(text: string, delim: "," | ";" | "\t" | "|"): string[][];
/**
 * detectDelimiterFromText
 * Sniffs best delimiter among ',', ';', '\t', '|' based on column count stability.
 * Signed: EyosiyasJ
 */
export declare function detectDelimiterFromText(text: string): "," | ";" | "\t" | "|";
/**
 * Decide whether the first row is a real header or data.
 * Uses header-vs-data scoring heuristics; returns "none" for data-like first rows.
 * Signed: EyosiyasJ
 */
export declare function detectHeaderMode(rows: string[][]): "headers" | "none" | "untrusted";
/**
 * Convert raw CSV rows (array-of-arrays) to `RawRow[]` using either header-based mapping
 * or synthetic `col_{i}` keys for headerless files. Drops purely blank rows.
 * Signed: EyosiyasJ
 */
export declare function buildRawRows(rows: string[][], mode: "headers" | "none"): RawRow[];
//# sourceMappingURL=csv.d.ts.map