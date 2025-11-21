/**
 * Parse CSV text into `RawRow[]` using a simple state machine that handles quoted fields
 * and commas within quotes. Mirrors behavior of the web importer to preserve UI expectations.
 * Signed: EyosiyasJ
 */
export function parseCsvToRows(csvText) {
    var _a, _b;
    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;
    const pushField = () => {
        current.push(field);
        field = "";
    };
    const pushRow = () => {
        rows.push(current);
        current = [];
    };
    for (let i = 0; i < csvText.length; i++) {
        const c = csvText[i];
        if (inQuotes) {
            if (c === `"`) {
                if (csvText[i + 1] === `"`) {
                    field += `"`;
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += c;
            }
        }
        else {
            if (c === `"`) {
                inQuotes = true;
            }
            else if (c === ",") {
                pushField();
            }
            else if (c === "\n") {
                pushField();
                pushRow();
            }
            else if (c === "\r") {
                // ignore CR
            }
            else {
                field += c;
            }
        }
    }
    pushField();
    pushRow();
    // Trim possible trailing empty last row
    if (rows.length && rows[rows.length - 1].every((v) => v === ""))
        rows.pop();
    const headers = (_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.map((h) => String(h !== null && h !== void 0 ? h : "").trim())) !== null && _b !== void 0 ? _b : [];
    const out = [];
    for (let r = 1; r < rows.length; r++) {
        const rowVals = rows[r];
        const obj = {};
        headers.forEach((h, idx) => {
            var _a;
            obj[h] = (_a = rowVals[idx]) !== null && _a !== void 0 ? _a : null;
        });
        out.push(obj);
    }
    return out;
}
/**
 * Parse CSV text into array-of-arrays preserving all rows.
 * Used for header vs headerless detection and dual-path parsing in the entry API.
 * Signed: EyosiyasJ
 */
export function parseCsvRaw(csvText) {
    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;
    const pushField = () => {
        current.push(field);
        field = "";
    };
    const pushRow = () => {
        rows.push(current);
        current = [];
    };
    for (let i = 0; i < csvText.length; i++) {
        const c = csvText[i];
        if (inQuotes) {
            if (c === '"') {
                if (csvText[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += c;
            }
        }
        else {
            if (c === '"')
                inQuotes = true;
            else if (c === ',')
                pushField();
            else if (c === "\n") {
                pushField();
                pushRow();
            }
            else if (c === "\r") { /* ignore */ }
            else
                field += c;
        }
    }
    pushField();
    pushRow();
    if (rows.length && rows[rows.length - 1].every((v) => v === ""))
        rows.pop();
    return rows;
}
/**
 * parseDsvRaw
 * Generalized delimiter-separated values parser with quote handling.
 * Supports ',', ';', '\t', '|'. Returns array-of-arrays without headers.
 * Signed: EyosiyasJ
 */
export function parseDsvRaw(text, delim) {
    const rows = [];
    let current = [];
    let field = "";
    let inQuotes = false;
    const pushField = () => { current.push(field); field = ""; };
    const pushRow = () => { rows.push(current); current = []; };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += c;
            }
        }
        else {
            if (c === '"')
                inQuotes = true;
            else if (c === delim)
                pushField();
            else if (c === "\n") {
                pushField();
                pushRow();
            }
            else if (c === "\r") { /* ignore */ }
            else
                field += c;
        }
    }
    pushField();
    pushRow();
    if (rows.length && rows[rows.length - 1].every((v) => v === ""))
        rows.pop();
    return rows;
}
/**
 * detectDelimiterFromText
 * Sniffs best delimiter among ',', ';', '\t', '|' based on column count stability.
 * Signed: EyosiyasJ
 */
export function detectDelimiterFromText(text) {
    const cands = [",", ";", "\t", "|"];
    let best = ",";
    let bestScore = -1;
    for (const d of cands) {
        const rows = parseDsvRaw(text, d);
        const counts = rows.slice(0, 25).map((r) => r.length);
        const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
        const varc = counts.length ? counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length : 0;
        const score = avg - varc; // prefer many columns with low variance
        if (score > bestScore) {
            bestScore = score;
            best = d;
        }
    }
    return best;
}
const looksDateLike = (s) => {
    const t = s.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{2}[\/-]\d{2}[\/-]\d{2,4}$/.test(t) || /^\d{3,5}$/.test(t);
};
const looksNumeric = (s) => /^[-+]?\d+(?:[.,]\d+)?$/.test(s.trim());
const looksHeaderToken = (s) => {
    const k = s.toLowerCase().trim();
    return [
        "generic",
        "name",
        "brand",
        "strength",
        "dosage",
        "form",
        "category",
        "batch",
        "lot",
        "expiry",
        "exp_date",
        "unit price",
        "price",
        "on_hand",
        "quantity",
        "qty",
        "country",
        "coo",
        "serial",
        "sku",
    ].some((t) => k.includes(t));
};
/**
 * Decide whether the first row is a real header or data.
 * Uses header-vs-data scoring heuristics; returns "none" for data-like first rows.
 * Signed: EyosiyasJ
 */
export function detectHeaderMode(rows) {
    const first = rows[0] || [];
    const second = rows[1] || [];
    if (!first.length)
        return "none";
    const isShortLabel = (s) => {
        const t = String(s).trim();
        if (!t)
            return false;
        if (/\d/.test(t))
            return false;
        const tokens = t.replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean);
        if (tokens.length === 0 || tokens.length > 3)
            return false;
        const avgLen = tokens.reduce((a, b) => a + b.length, 0) / tokens.length;
        return avgLen <= 12;
    };
    const isCountry = (s) => /\b(ethiopia|india|germany|china|united states|united kingdom|france|italy|spain|kenya|south africa)\b/i.test(String(s).trim());
    const headerTokenCount = first.filter((v) => looksHeaderToken(String(v))).length;
    const headerShortCount = first.filter((v) => isShortLabel(String(v))).length;
    const dateCount = first.filter((v) => looksDateLike(String(v))).length;
    const strengthCount = first.filter((v) => /\b\d+(?:\.\d+)?\s*(mg|mcg|g|iu|ml|%)\b/i.test(String(v)) || /\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml)\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|ml)\b/i.test(String(v))).length;
    const numericCount = first.filter((v) => looksNumeric(String(v))).length;
    const countryCount = first.filter((v) => isCountry(String(v))).length;
    const headerScore = headerTokenCount + 0.5 * headerShortCount;
    const dataScore = dateCount + strengthCount + numericCount + countryCount;
    if (headerScore >= 2 && headerScore >= dataScore)
        return "headers";
    if (dataScore >= 2 && dataScore > headerScore)
        return "none";
    // Ambiguous: compare type likeness between first and second rows
    const classify = (s) => {
        const t = s.trim();
        if (!t)
            return "empty";
        if (looksDateLike(t))
            return "date";
        if (looksNumeric(t))
            return "num";
        if (/\b(mg|mcg|ml|%|g|iu)\b/i.test(t) || /\//.test(t))
            return "strength";
        if (/^(tablet|tab|capsule|cap|syrup|cream|ointment|inj|injection|solution)$/i.test(t))
            return "form";
        return "text";
    };
    const sameTypeCount = Math.min(first.length, second.length)
        ? first.reduce((acc, v, i) => { var _a; return acc + (classify(String(v)) === classify(String((_a = second[i]) !== null && _a !== void 0 ? _a : "")) ? 1 : 0); }, 0)
        : 0;
    const threshSame = Math.floor(first.length * 0.6);
    if (sameTypeCount >= threshSame)
        return "none";
    // Default to headers only when weak data signals and weak similarity
    return headerScore > 0 ? "headers" : "none";
}
/**
 * Convert raw CSV rows (array-of-arrays) to `RawRow[]` using either header-based mapping
 * or synthetic `col_{i}` keys for headerless files. Drops purely blank rows.
 * Signed: EyosiyasJ
 */
export function buildRawRows(rows, mode) {
    var _a, _b;
    const out = [];
    if (mode === "headers") {
        const headers = (_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.map((h) => String(h !== null && h !== void 0 ? h : "").trim())) !== null && _b !== void 0 ? _b : [];
        for (let r = 1; r < rows.length; r++) {
            const rowVals = rows[r];
            const obj = {};
            headers.forEach((h, idx) => { var _a; obj[h] = (_a = rowVals[idx]) !== null && _a !== void 0 ? _a : null; });
            out.push(obj);
        }
        return out;
    }
    const maxCols = Math.max(...rows.map((r) => r.length), 0);
    const headers = Array.from({ length: maxCols }, (_, i) => `col_${i + 1}`);
    for (let r = 0; r < rows.length; r++) {
        const rowVals = rows[r];
        const obj = {};
        headers.forEach((h, idx) => { var _a; obj[h] = (_a = rowVals[idx]) !== null && _a !== void 0 ? _a : null; });
        // drop purely blank rows
        const hasData = Object.values(obj).some((v) => String(v !== null && v !== void 0 ? v : "").trim() !== "");
        if (hasData)
            out.push(obj);
    }
    return out;
}
