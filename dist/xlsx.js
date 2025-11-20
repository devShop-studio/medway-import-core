import * as XLSX from "xlsx";
/**
 * Read an Excel workbook from `ArrayBuffer` and return normalized rows plus optional header metadata.
 * - Chooses the main sheet (prefers `Products`) and converts to `RawRow[]`.
 * - Extracts `__meta` sheet keys: `template_version`, `header_checksum` when present.
 * Signed: EyosiyasJ
 */
export async function readXlsxToRows(fileBytes) {
    const data = new Uint8Array(fileBytes);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetNames = workbook.SheetNames;
    const mainSheetName = chooseMainSheet(sheetNames);
    const sheet = workbook.Sheets[mainSheetName];
    const json = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
    });
    const rows = json.map((row) => {
        const out = {};
        for (const key of Object.keys(row)) {
            out[key] = row[key];
        }
        return out;
    });
    const meta = extractMetaFromWorkbook(workbook);
    return { rows, headerMeta: meta };
}
/**
 * Select the primary sheet to parse. Prefers a sheet named `Products` otherwise falls back to the first sheet.
 * Signed: EyosiyasJ
 */
function chooseMainSheet(sheetNames) {
    const preferred = sheetNames.find((name) => name.toLowerCase() === "products");
    return preferred !== null && preferred !== void 0 ? preferred : sheetNames[0];
}
/**
 * Extract template metadata from the `__meta` sheet.
 * Recognized keys (A1/B1, A2/B2): `template_version`, `header_checksum`.
 * Signed: EyosiyasJ
 */
function extractMetaFromWorkbook(workbook) {
    var _a, _b;
    const metaSheet = workbook.Sheets["__meta"];
    if (!metaSheet)
        return {};
    const readCell = (cell) => {
        var _a;
        const val = metaSheet[cell];
        return val ? String((_a = val.v) !== null && _a !== void 0 ? _a : "").trim() : undefined;
    };
    const kv = {};
    const key1 = (_a = readCell("A1")) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    const val1 = readCell("B1");
    if (key1 === "template_version")
        kv.templateVersion = val1;
    const key2 = (_b = readCell("A2")) === null || _b === void 0 ? void 0 : _b.toLowerCase();
    const val2 = readCell("B2");
    if (key2 === "header_checksum")
        kv.headerChecksum = val2;
    return kv;
}
