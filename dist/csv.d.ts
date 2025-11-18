export type RawRow = Record<string, string | number | null>;
/**
 * Parse CSV text into rows using simple state machine that handles quoted fields and commas within quotes.
 * Borrowed from the existing web importer to preserve behavior.
 */
export declare function parseCsvToRows(csvText: string): RawRow[];
//# sourceMappingURL=csv.d.ts.map