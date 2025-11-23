import { detectSourceSchema, mapRawRowToCanonical, inferHeaderlessAssignments, inferConcatenatedColumns, } from "./schema.js";
import { sanitizeCanonicalRow } from "./sanitize.js";
import { decomposeConcatenatedCell, splitNameGenericStrengthForm } from "./concatDecompose.js";
import { suggestHeaderMappings } from "./semantics.js";
import { ENGINE_VERSION } from "./types.js";
/**
 * Module: Core Parsing Pipeline
 * Purpose: Convert loosely-typed raw rows to canonical product+batch structure with
 * opportunistic text decomposition and schema-aware validation.
 * Design:
 * - Analysis mode (`fast|deep`) tunes sampling for detection (headers, concat columns);
 *   per-row splitting/decomposition/validation remain identical across modes.
 * - Column hygiene classifier prevents heavy decomposition on clean numeric/ID columns.
 * - Concat modes: `none` | `name_only` | `full` determine where decomposition is applied.
 * Meta:
 * - Emits `analysisMode`, `sampleSize`, `concatMode`, `dirtyColumns`, `decomposedColumns`, `engineVersion`.
 * Signed: EyosiyasJ
 */
/**
 * Parse raw rows into canonical products, applying:
 * - Pre-sanitize concatenation overlay for flagged columns
 * - Row-level opportunistic decomposition on textual fields
 * Opportunistic tuning: use `minSignals: 2` for `product.generic_name` (Name column)
 * to better split embedded strength/form/pack without harming formulas.
 * Signed: EyosiyasJ
 */
/**
 * Parse core with analysis mode affecting sampling for detection only.
 * Per-row splitting/decomposition/validation remains identical.
 * Signed: EyosiyasJ
 */
export function parseProductsCore(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    const { rows, headerMeta } = input;
    const mode = ((_b = (_a = input.options) === null || _a === void 0 ? void 0 : _a.mode) !== null && _b !== void 0 ? _b : "fast");
    const computeSampleSize = (total, m) => {
        if (m === "fast")
            return Math.min(32, total);
        const byFraction = Math.ceil(total * 0.25);
        return Math.min(256, Math.max(64, byFraction));
    };
    const sampleSize = computeSampleSize(rows.length, mode);
    const sampleRows = rows.slice(0, sampleSize);
    const sourceSchema = detectSourceSchema(rows, headerMeta, input.origin);
    // Headerless detection via synthetic column keys
    const firstKeys = Object.keys(rows[0] || {});
    const isHeaderless = firstKeys.length > 0 && firstKeys.every((k) => /^col_\d+$/.test(k));
    const headerlessAssign = isHeaderless ? inferHeaderlessAssignments(sampleRows) : undefined;
    const concatColsSample = inferConcatenatedColumns(sampleRows);
    const DOSE_UNIT_RE = /(mg|mcg|g|ml|iu|%)/i;
    const FORM_WORDS = new Set([
        "tablet", "tablets", "tab", "capsule", "capsules", "syrup", "suspension", "injection", "cream", "ointment", "gel", "drops", "drop", "spray", "lotion", "patch", "solution", "powder"
    ]);
    const classifyColumnHygiene = (keys, samples) => {
        var _a;
        const dirty = new Set();
        for (let colIdx = 0; colIdx < keys.length; colIdx++) {
            const k = keys[colIdx];
            let n = 0, numOnly = 0, idLike = 0, freeText = 0;
            for (let i = 0; i < samples.length; i++) {
                const v = (_a = samples[i]) === null || _a === void 0 ? void 0 : _a[k];
                if (v === undefined || v === null)
                    continue;
                const s = String(v).trim();
                if (!s)
                    continue;
                n++;
                const isNum = /^[-+]?\d+(?:[.,]\d+)?$/.test(s);
                if (isNum) {
                    numOnly++;
                    continue;
                }
                const noSpace = !/\s/.test(s);
                const shortId = s.length <= 6 && noSpace && !DOSE_UNIT_RE.test(s);
                if (shortId) {
                    idLike++;
                    continue;
                }
                const tokens = s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
                const hasFormWord = tokens.some((t) => FORM_WORDS.has(t));
                const looksCountry = /\b(ethiopia|india|germany|china|united states|united kingdom|france|italy|spain|kenya|south africa)\b/i.test(s);
                const hasUnitsOrSpaces = /\s/.test(s) || DOSE_UNIT_RE.test(s) || hasFormWord || looksCountry;
                if (hasUnitsOrSpaces)
                    freeText++;
            }
            const freeRatio = n ? freeText / n : 0;
            const numRatio = n ? numOnly / n : 0;
            const idRatio = n ? idLike / n : 0;
            if (freeRatio >= 0.3 && numRatio < 0.8)
                dirty.add(colIdx);
        }
        return dirty;
    };
    const dirtyColumns = classifyColumnHygiene(firstKeys, sampleRows);
    const detectConcatMode = () => {
        var _a;
        if (concatColsSample.length)
            return "full";
        const nameKey = firstKeys.find((k) => k.toLowerCase() === "name");
        if (nameKey) {
            const vals = [];
            for (let i = 0; i < sampleRows.length; i++) {
                const v = (_a = sampleRows[i]) === null || _a === void 0 ? void 0 : _a[nameKey];
                if (v !== undefined && v !== null && String(v).trim() !== "")
                    vals.push(String(v));
            }
            const hasDoseSignal = vals.some((s) => {
                const { extractions } = decomposeConcatenatedCell(String(s));
                return extractions.some((e) => e.field === "product.strength");
            });
            if (hasDoseSignal)
                return "name_only";
        }
        const anyDoseCell = (() => {
            var _a;
            for (const k of firstKeys) {
                for (let i = 0; i < sampleRows.length; i++) {
                    const val = (_a = sampleRows[i]) === null || _a === void 0 ? void 0 : _a[k];
                    if (val === undefined || val === null)
                        continue;
                    const s = String(val);
                    if (!s.trim())
                        continue;
                    const { extractions } = decomposeConcatenatedCell(s);
                    const mixedDose = extractions.some((e) => e.field === "product.strength");
                    if (mixedDose)
                        return true;
                }
            }
            return false;
        })();
        if (anyDoseCell)
            return "name_only";
        return "none";
    };
    const concatMode = detectConcatMode();
    const headerHints = suggestHeaderMappings(firstKeys, rows.slice(0, Math.min(rows.length, 25)));
    const columnRemainderPaths = new Map();
    for (const key of firstKeys) {
        let path;
        if (headerlessAssign === null || headerlessAssign === void 0 ? void 0 : headerlessAssign[key]) {
            path = flatKeyToCanonicalPath(headerlessAssign[key]);
        }
        else {
            const hint = headerHints.find((h) => h.header === key);
            if ((hint === null || hint === void 0 ? void 0 : hint.key) && hint.confidence >= 0.65) {
                const flatKey = CANONICAL_KEY_TO_FLAT[hint.key];
                path = flatKeyToCanonicalPath(flatKey);
            }
        }
        if (!path) {
            const lower = key.toLowerCase();
            if (lower.includes("batch") || lower.includes("lot")) {
                path = "batch.batch_no";
            }
            else if (lower.includes("description") || lower.includes("notes")) {
                path = "product.description";
            }
        }
        columnRemainderPaths.set(key, path);
    }
    const canonicalRows = [];
    const errors = [];
    let parsedRows = 0;
    const decomposedSet = new Set();
    for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];
        const mapped = mapRawRowToCanonical(rawRow, i + 2, sourceSchema, headerlessAssign);
        if (!mapped)
            continue;
        // Pre-sanitize concatenation pass: gated by concatMode
        try {
            // Name-only mode: split Name column only
            if (concatMode === "name_only" || concatMode === "full") {
                const nameRaw = String((_c = rawRow["Name"]) !== null && _c !== void 0 ? _c : "").trim();
                if (nameRaw) {
                    const parts = splitNameGenericStrengthForm(nameRaw);
                    if (parts.generic_name) {
                        const prod = ((_d = mapped.product) !== null && _d !== void 0 ? _d : (mapped.product = { generic_name: "", strength: "", form: "", category: null }));
                        const curr = String((_e = prod.generic_name) !== null && _e !== void 0 ? _e : "").trim();
                        const shouldForce = !curr || curr === nameRaw || /-\s*\d+/.test(curr);
                        if (shouldForce)
                            prod.generic_name = parts.generic_name;
                    }
                    if (parts.strength)
                        applyExtractionToCanonical(mapped, { field: "product.strength", value: parts.strength });
                    if (parts.form)
                        applyExtractionToCanonical(mapped, { field: "product.form", value: parts.form });
                    const { extractions } = decomposeConcatenatedCell(nameRaw, { mode: "opportunistic", minSignals: 2 });
                    if (extractions.length) {
                        for (const ex of extractions)
                            applyExtractionToCanonical(mapped, ex, nameRaw);
                    }
                }
            }
            // Full mode: run heavy concat decomposition on flagged columns and fallbacks
            if (concatMode === "full") {
                for (const cc of concatColsSample) {
                    const key = firstKeys[cc.index];
                    const cell = rawRow[key];
                    if (cell === undefined || cell === null)
                        continue;
                    if (!dirtyColumns.has(cc.index))
                        continue;
                    decomposedSet.add(cc.index);
                    const { leftover, extractions } = decomposeConcatenatedCell(String(cell));
                    for (const ex of extractions)
                        applyExtractionToCanonical(mapped, ex, String(cell));
                    if (leftover) {
                        const targetPath = columnRemainderPaths.get(key);
                        assignLeftoverText(mapped, targetPath, leftover, String(cell));
                    }
                }
                const fallbackDescriptionColumns = firstKeys
                    .map((key, index) => ({ key, index, path: columnRemainderPaths.get(key) }))
                    .filter((col) => col.path === "product.description" && !concatColsSample.some((existing) => existing.index === col.index) && dirtyColumns.has(col.index));
                for (const col of fallbackDescriptionColumns) {
                    const cell = rawRow[col.key];
                    if (cell === undefined || cell === null)
                        continue;
                    const parts = splitNameGenericStrengthForm(String(cell));
                    if (parts.strength)
                        applyExtractionToCanonical(mapped, { field: "product.strength", value: parts.strength }, String(cell));
                    if (parts.form)
                        applyExtractionToCanonical(mapped, { field: "product.form", value: parts.form }, String(cell));
                    const descValue = (_g = (_f = parts.generic_name) !== null && _f !== void 0 ? _f : parts.leftover) !== null && _g !== void 0 ? _g : String(cell);
                    assignLeftoverText(mapped, "product.description", descValue, String(cell));
                }
                // description fallback handled above; batch fallback handled outside to always run
                const opportunisticTargets = [
                    { path: "product.generic_name", value: (_h = mapped.product) === null || _h === void 0 ? void 0 : _h.generic_name },
                    { path: "product.brand_name", value: (_k = (_j = mapped.product) === null || _j === void 0 ? void 0 : _j.brand_name) !== null && _k !== void 0 ? _k : undefined },
                    { path: "product.description", value: (_m = (_l = mapped.product) === null || _l === void 0 ? void 0 : _l.description) !== null && _m !== void 0 ? _m : undefined },
                ];
                for (const t of opportunisticTargets) {
                    const v = (_o = (typeof t.value === "string" ? t.value : undefined)) !== null && _o !== void 0 ? _o : "";
                    if (!v || !v.trim())
                        continue;
                    if (t.path === "product.generic_name") {
                        const parts = splitNameGenericStrengthForm(v);
                        if (parts.generic_name)
                            applyExtractionToCanonical(mapped, { field: "product.generic_name", value: parts.generic_name });
                        if (parts.strength)
                            applyExtractionToCanonical(mapped, { field: "product.strength", value: parts.strength });
                        if (parts.form)
                            applyExtractionToCanonical(mapped, { field: "product.form", value: parts.form });
                    }
                    const opportunisticMinSignals = t.path === "product.generic_name" || t.path === "product.description" ? 2 : 3;
                    const { leftover, extractions } = decomposeConcatenatedCell(v, {
                        mode: "opportunistic",
                        minSignals: opportunisticMinSignals,
                    });
                    if (extractions.length) {
                        for (const ex of extractions)
                            applyExtractionToCanonical(mapped, ex, v);
                    }
                    if (leftover && leftover.trim()) {
                        const sourceHint = t.path === "product.generic_name" ? undefined : v;
                        assignLeftoverText(mapped, t.path, leftover, sourceHint);
                    }
                }
            }
        }
        catch { }
        // Always run batch info fallback regardless of concatMode to honor header-independent extraction
        {
            const fallbackBatchColumns = firstKeys
                .map((key, index) => ({ key, index, path: columnRemainderPaths.get(key) }))
                .filter((col) => col.path === "batch.batch_no");
            for (const col of fallbackBatchColumns) {
                const cell = rawRow[col.key];
                if (cell === undefined || cell === null)
                    continue;
                decomposedSet.add(col.index);
                const { extractions } = decomposeConcatenatedCell(String(cell));
                for (const ex of extractions)
                    applyExtractionToCanonical(mapped, ex, String(cell));
            }
            const rawBatch = String((_q = (_p = mapped.batch) === null || _p === void 0 ? void 0 : _p.batch_no) !== null && _q !== void 0 ? _q : "");
            if (rawBatch) {
                const m = rawBatch.match(/\bB[0-9A-Z]{3,}\b/i);
                if (m) {
                    applyExtractionToCanonical(mapped, { field: "batch.batch_no", value: m[0].toUpperCase() }, rawBatch);
                }
            }
        }
        const { row, errors: rowErrors } = sanitizeCanonicalRow(mapped, i + 2, sourceSchema, (_s = (_r = input.options) === null || _r === void 0 ? void 0 : _r.validationMode) !== null && _s !== void 0 ? _s : "full");
        errors.push(...rowErrors);
        if (row) {
            canonicalRows.push(row);
            parsedRows++;
        }
    }
    return {
        rows: canonicalRows,
        errors,
        meta: {
            sourceSchema,
            analysisMode: mode,
            sampleSize,
            concatMode,
            validationMode: (_u = (_t = input.options) === null || _t === void 0 ? void 0 : _t.validationMode) !== null && _u !== void 0 ? _u : "full",
            templateVersion: headerMeta === null || headerMeta === void 0 ? void 0 : headerMeta.templateVersion,
            headerChecksum: headerMeta === null || headerMeta === void 0 ? void 0 : headerMeta.headerChecksum,
            totalRows: rows.length,
            parsedRows,
            concatenatedColumns: concatColsSample,
            dirtyColumns: Array.from(dirtyColumns).map((idx) => ({ index: idx, header: firstKeys[idx] })),
            decomposedColumns: Array.from(decomposedSet).map((idx) => ({ index: idx, header: firstKeys[idx] })),
            engineVersion: ENGINE_VERSION,
        },
    };
}
function applyExtractionToCanonical(target, ex, sourceValue) {
    // Apply a field extraction to the partial canonical row only when the target field is empty.
    // Supports nested paths like `product.generic_name` and `pkg.pieces_per_unit`.
    // Signed: EyosiyasJ
    const set = (obj, path, value) => {
        var _a;
        let curr = obj;
        for (let i = 0; i < path.length - 1; i++) {
            const k = path[i];
            curr[k] = (_a = curr[k]) !== null && _a !== void 0 ? _a : {};
            curr = curr[k];
        }
        const last = path[path.length - 1];
        const existing = curr[last];
        const shouldReplace = sourceValue &&
            typeof existing === "string" &&
            existing.trim() === String(sourceValue).trim();
        const forceReplace = path.join(".") === "batch.batch_no" &&
            typeof existing === "string" &&
            /\b(LOT|EXP)\b|[\/:]/i.test(existing);
        if (existing === undefined ||
            existing === null ||
            (typeof existing === "string" && (existing.trim() === "" || shouldReplace || forceReplace))) {
            curr[last] = value;
        }
    };
    const parts = ex.field.split(".");
    set(target, parts, ex.value);
}
const FLAT_KEY_TO_PATH = {
    generic_name: "product.generic_name",
    brand_name: "product.brand_name",
    manufacturer_name: "product.manufacturer_name",
    strength: "product.strength",
    form: "product.form",
    category: "product.category",
    expiry_date: "batch.expiry_date",
    batch_no: "batch.batch_no",
    on_hand: "batch.on_hand",
    unit_price: "batch.unit_price",
    coo: "batch.coo",
    cat: "identity.cat",
    frm: "identity.frm",
    pkg: "identity.pkg",
    sku: "identity.sku",
    requires_prescription: "product.requires_prescription",
    is_controlled: "product.is_controlled",
    storage_conditions: "product.storage_conditions",
    description: "product.description",
    purchase_unit: "identity.purchase_unit",
    pieces_per_unit: "pkg.pieces_per_unit",
    unit: "identity.unit",
    product_type: "identity.product_type",
};
const CANONICAL_KEY_TO_FLAT = {
    generic_name: "generic_name",
    brand_name: "brand_name",
    strength: "strength",
    form: "form",
    category: "category",
    expiry_date: "expiry_date",
    batch_no: "batch_no",
    pack_contents: "pieces_per_unit",
    on_hand: "on_hand",
    unit_price: "unit_price",
    coo: "coo",
    sku: "sku",
    manufacturer: "manufacturer_name",
    notes: "description",
    requires_prescription: "requires_prescription",
    is_controlled: "is_controlled",
    storage_conditions: "storage_conditions",
    purchase_unit: "purchase_unit",
    pieces_per_unit: "pieces_per_unit",
    unit: "unit",
    product_type: "product_type",
};
const TEXTUAL_TARGETS = new Set([
    "product.generic_name",
    "product.description",
    "product.brand_name",
    "product.manufacturer_name",
    "product.category",
]);
function flatKeyToCanonicalPath(key) {
    if (!key)
        return undefined;
    return FLAT_KEY_TO_PATH[key];
}
function ensureProductContainer(target) {
    if (!target.product) {
        target.product = { generic_name: "", strength: "", form: "", category: null };
    }
    return target.product;
}
function assignLeftoverText(target, targetPath, raw, sourceValue) {
    var _a, _b, _c, _d, _e, _f;
    const text = String(raw !== null && raw !== void 0 ? raw : "").trim();
    if (!text)
        return;
    const UNIT_RE = /\b(mg|mcg|g|kg|ml|l|iu|%|w\/v|w\/w|v\/v)\b/i;
    const HAS_DIGIT_RE = /\d/;
    const defaultRoute = () => {
        var _a, _b;
        const prod = ensureProductContainer(target);
        const current = (_a = prod.generic_name) !== null && _a !== void 0 ? _a : "";
        const shouldReplace = sourceValue && current && current.trim() === String(sourceValue).trim();
        if (!current.trim() || shouldReplace) {
            prod.generic_name = text;
        }
        else {
            const desc = ((_b = prod.description) !== null && _b !== void 0 ? _b : "").trim();
            prod.description = desc ? `${desc} ${text}` : text;
        }
    };
    if (!targetPath || !TEXTUAL_TARGETS.has(targetPath)) {
        defaultRoute();
        return;
    }
    const prod = ensureProductContainer(target);
    switch (targetPath) {
        case "product.description": {
            const curr = ((_a = prod.description) !== null && _a !== void 0 ? _a : "").trim();
            const shouldReplace = sourceValue && curr === String(sourceValue).trim();
            if (curr && curr.trim().toLowerCase() === text.toLowerCase()) {
                prod.description = curr;
            }
            else {
                prod.description = shouldReplace || !curr ? text : `${prod.description} ${text}`;
            }
            if (!prod.generic_name || !String(prod.generic_name).trim()) {
                prod.generic_name = text;
            }
            return;
        }
        case "product.brand_name": {
            const current = (_b = prod.brand_name) !== null && _b !== void 0 ? _b : "";
            const shouldReplace = sourceValue && current && String(current).trim() === String(sourceValue).trim();
            if (!current || !String(current).trim() || shouldReplace) {
                prod.brand_name = text;
            }
            if (!prod.generic_name || !String(prod.generic_name).trim()) {
                prod.generic_name = text;
            }
            return;
        }
        case "product.manufacturer_name": {
            const current = (_c = prod.manufacturer_name) !== null && _c !== void 0 ? _c : "";
            const shouldReplace = sourceValue && current && String(current).trim() === String(sourceValue).trim();
            if (!current || !String(current).trim() || shouldReplace) {
                if (!HAS_DIGIT_RE.test(text) && !UNIT_RE.test(text)) {
                    prod.manufacturer_name = text;
                }
                else {
                    const desc = ((_d = prod.description) !== null && _d !== void 0 ? _d : "").trim();
                    prod.description = desc ? `${desc} ${text}` : text;
                }
            }
            if (!prod.generic_name || !String(prod.generic_name).trim()) {
                prod.generic_name = text;
            }
            return;
        }
        case "product.category": {
            const current = (_e = prod.category) !== null && _e !== void 0 ? _e : "";
            const shouldReplace = sourceValue && current && String(current).trim() === String(sourceValue).trim();
            if (!current || !String(current).trim() || shouldReplace) {
                if (!HAS_DIGIT_RE.test(text) && !UNIT_RE.test(text)) {
                    prod.category = text;
                }
                else {
                    const desc = ((_f = prod.description) !== null && _f !== void 0 ? _f : "").trim();
                    prod.description = desc ? `${desc} ${text}` : text;
                }
            }
            return;
        }
        case "product.generic_name":
        default:
            defaultRoute();
            return;
    }
}
