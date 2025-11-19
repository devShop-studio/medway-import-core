import { parseProductsCore } from "./parseProductsCore.js";
import type { ParsedImportResult } from "./types.js";
export * from "./types.js";
export * from "./sanitize.js";
export { parseProductsCore };
/**
 * Parse a products file (XLSX or CSV) from bytes and produce canonical rows with errors and meta.
 * Accepts ArrayBuffer input to work in web and React Native environments.
 */
export declare function parseProductsFileFromBuffer(fileBytes: ArrayBuffer, filename: string): Promise<ParsedImportResult>;
//# sourceMappingURL=index.d.ts.map