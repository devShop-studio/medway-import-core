import { classifyUmbrellaCategory, mapCategoryCodeToUmbrella, UMBRELLA_CATEGORY_INDEX } from "./category.js";
import { normalizeCountryToIso2 } from "./country.js";
const FORM_ENUM = ["tablet", "capsule", "syrup", "injection", "cream", "ointment", "drops", "inhaler", "suspension", "solution", "gel", "spray", "lotion", "patch", "powder", "other"];
const FORM_SYNONYMS = {
    tab: "tablet",
    tablet: "tablet",
    tablets: "tablet",
    pill: "tablet",
    pills: "tablet",
    pillz: "tablet",
    tabb: "tablet",
    cap: "capsule",
    capsule: "capsule",
    capsules: "capsule",
    capsul3: "capsule",
    syr: "syrup",
    syrup: "syrup",
    sirup: "syrup",
    syrp: "syrup",
    liq: "syrup",
    inj: "injection",
    injection: "injection",
    injectable: "injection",
    crm: "cream",
    cream: "cream",
    ont: "ointment",
    ointment: "ointment",
    drop: "drops",
    drops: "drops",
    inh: "inhaler",
    inhaler: "inhaler",
    suspension: "suspension",
    solution: "solution",
    gel: "gel",
    spray: "spray",
    lotion: "lotion",
    patch: "patch",
    powder: "powder",
    suppository: "other",
    suppositories: "other",
    "topical medicines": "other",
    other: "other",
};
const asciiLower = (s) => String(s !== null && s !== void 0 ? s : "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7F]/g, "")
    .toLowerCase()
    .trim();
const collapseWS = (s) => s.replace(/\s+/g, " ").trim();
const onlyDigits = (s) => s.replace(/\D+/g, "");
const hasDigit = (s) => /\d/.test(String(s !== null && s !== void 0 ? s : ""));
const hasUnitToken = (s) => /(mg|mcg|g|ml|iu|%)/i.test(String(s !== null && s !== void 0 ? s : ""));
const lev = (a, b) => {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        d[i][0] = i;
    for (let j = 0; j <= n; j++)
        d[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
    return d[m][n];
};
/**
 * Normalize free-text dosage form to canonical enum with fuzzy match and hygiene checks.
 * Enforces no-digits rule (warn) and autocorrects close variants; errors on unknowns.
 * Signed: EyosiyasJ
 */
export function sanitizeForm(v) {
    var _a;
    const issues = [];
    const raw = asciiLower(v);
    if (!raw)
        return { issues: [{ field: "form", code: "E_FORM_MISSING", msg: "form required", level: "error" }] };
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
        return { issues: [{ field: "form", code: "E_FORM_NUMERIC", msg: "form cannot be numeric", level: "error" }] };
    }
    if (hasDigit(raw) || hasUnitToken(raw)) {
        issues.push({ field: "form", code: "E_TEXT_DIGITS_SUSPECT", msg: "form must not contain digits/units", level: "warn" });
    }
    if (FORM_SYNONYMS[raw])
        return { value: FORM_SYNONYMS[raw], issues };
    const candidates = [...Object.keys(FORM_SYNONYMS), ...FORM_ENUM];
    let best = null;
    for (const k of candidates) {
        const dist = lev(raw, k);
        const mapped = (_a = FORM_SYNONYMS[k]) !== null && _a !== void 0 ? _a : (FORM_ENUM.includes(k) ? k : "other");
        if (!best || dist < best.dist)
            best = { key: k, dist, mapped };
    }
    if (best && best.dist <= 2) {
        return {
            value: best.mapped,
            issues: [{ field: "form", code: "W_FORM_AUTOCORRECT", msg: `autocorrected "${v}"→"${best.mapped}"`, level: "warn" }, ...issues],
            suggestion: best.mapped,
        };
    }
    return { issues: [...issues, { field: "form", code: "E_FORM_INVALID", msg: `invalid form "${v}"`, level: "error" }] };
}
export function sanitizeStrength(v) {
    const issues = [];
    if (!v)
        return { issues };
    let s = String(v);
    s = s.replace(/[μµ]/g, "mc"); // μg -> mcg
    s = s.replace(/\s+/g, ""); // "500 mg" -> "500mg"
    s = s.replace(/MCG/gi, "mcg").replace(/MG/gi, "mg").replace(/ML/gi, "ml").replace(/G(?!\/)/g, "g");
    if (!/^(\d+(\.\d+)?(mg|g|mcg|ml|%)|( \d+)?(mg|g|mcg|ml)\/\d+(mg|g|mcg|ml))$/i.test(s)) {
        s = s.replace(/(\d+)\s*\/\s*(\d+)/g, "$1/$2");
    }
    const ok = /^(\d+(\.\d+)?(mg|g|mcg|ml|%)|\d+(\.\d+)?(mg|g|mcg|ml)\/\d+(\.\d+)?(mg|g|mcg|ml))$/i.test(s);
    if (!ok)
        issues.push({ field: "strength", code: "E_STRENGTH_FORMAT", msg: "use like 500mg, 5mg/5ml, 1%", level: "error" });
    return { value: s, issues };
}
export function sanitizeGTIN(v) {
    const issues = [];
    if (!v)
        return { issues };
    const raw = String(v);
    const digits = onlyDigits(raw);
    if (digits.length === 0) {
        issues.push({ field: "gtin", code: "E_GTIN_DIGITS", msg: "GTIN must be digits only", level: "error" });
        return { issues };
    }
    if (digits.length < 8 || digits.length > 14) {
        issues.push({ field: "gtin", code: "E_GTIN_LEN", msg: "GTIN length must be 8–14", level: "error" });
    }
    return { value: digits, issues };
}
export function sanitizeBool(v) {
    const s = asciiLower(v);
    if (!s)
        return { issues: [] };
    if (["true", "yes", "1", "y", "rx"].includes(s))
        return { value: true, issues: [] };
    if (["false", "no", "0", "n", "otc"].includes(s))
        return { value: false, issues: [] };
    return { issues: [{ field: "boolean", code: "E_BOOL", msg: `not a boolean: "${v}"`, level: "error" }] };
}
export function sanitizeBatchNo(v) {
    const issues = [];
    if (!v)
        return { issues };
    let s = String(v).toUpperCase();
    const labeled = s.match(/\bB[0-9A-Z]{3,}\b/);
    if (labeled)
        s = labeled[0];
    s = s.replace(/[^A-Z0-9./-]/g, "");
    s = s.replace(/\.{2,}/g, ".");
    s = s.replace(/-{2,}/g, "-");
    s = s.replace(/\/{2,}/g, "/");
    s = s.replace(/^[./-]+|[./-]+$/g, "");
    if (s.length > 20) {
        s = s.slice(0, 20);
        issues.push({ field: "batch_no", code: "W_BATCH_TRUNCATED", msg: "trimmed to max 20 chars", level: "warn" });
    }
    if (s) {
        const hasAlpha = /[A-Z]/.test(s);
        const hasDigitAny = /\d/.test(s);
        if (!(hasAlpha && hasDigitAny)) {
            issues.push({ field: "batch_no", code: "E_BATCH_ALPHA_NUM_MIX", msg: "batch_no must contain letters and digits", level: "error" });
        }
    }
    return { value: s, issues };
}
export function sanitizeExpiry(v) {
    const issues = [];
    if (!v)
        return { issues };
    const s = String(v).trim();
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (!m) {
        issues.push({ field: "expiry_date", code: "E_DATE_FMT", msg: "use DD/MM/YYYY", level: "error" });
        return { issues };
    }
    const dd = +m[1], mm = +m[2], yy = +m[3];
    if (mm < 1 || mm > 12)
        issues.push({ field: "expiry_date", code: "E_DATE_MM", msg: "month 01–12", level: "error" });
    const daysInMonth = new Date(yy, mm, 0).getDate();
    if (dd < 1 || dd > daysInMonth)
        issues.push({ field: "expiry_date", code: "E_DATE_DD", msg: `day 01–${daysInMonth}`, level: "error" });
    const today = new Date();
    const dt = new Date(yy, mm - 1, dd);
    if (dt.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) {
        issues.push({ field: "expiry_date", code: "W_EXPIRED", msg: "date is in the past", level: "warn" });
    }
    return { value: s, issues };
}
export function sanitizeNumber(v, { gt, ge } = {}) {
    const issues = [];
    if (v === undefined || v === null || v === "")
        return { issues };
    const n = Number(String(v).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) {
        issues.push({ field: "number", code: "E_NUM", msg: "not a number", level: "error" });
        return { issues };
    }
    if (ge !== undefined && n < ge)
        issues.push({ field: "number", code: "E_NUM_GE", msg: `must be ≥ ${ge}`, level: "error" });
    if (gt !== undefined && n <= gt)
        issues.push({ field: "number", code: "E_NUM_GT", msg: `must be > ${gt}`, level: "error" });
    return { value: n, issues };
}
export function sanitizeGenericName(v) {
    const issues = [];
    let s = collapseWS(String(v !== null && v !== void 0 ? v : "")).trim();
    if (!s)
        return { issues: [{ field: "generic_name", code: "E_GENERIC_MISSING", msg: "generic_name required", level: "error" }] };
    s = s.replace(/[0-9]/g, "");
    s = s.replace(/\b(mg|mcg|ml|iu|%|g)\b/gi, "");
    s = s.replace(/\s{2,}/g, " ").trim();
    if (!s) {
        issues.push({ field: "generic_name", code: "E_GENERIC_INVALID", msg: "name must not contain numbers", level: "error" });
        return { issues };
    }
    return { value: s, issues };
}
export function sanitizeCategoryCode(v) {
    const issues = [];
    const s = String(v !== null && v !== void 0 ? v : "").trim().toUpperCase();
    if (!s)
        return { issues: [{ field: "cat", code: "E_CAT_MISSING", msg: "category code required", level: "error" }] };
    if (!/^[A-Z]{3}$/.test(s))
        issues.push({ field: "cat", code: "E_CAT_FORMAT", msg: "use 3-letter code (e.g., ANT)", level: "error" });
    return { value: s, issues };
}
export function sanitizeFormCode(v) {
    const issues = [];
    const s = String(v !== null && v !== void 0 ? v : "").trim().toUpperCase();
    if (!s)
        return { issues: [{ field: "frm", code: "E_FRM_MISSING", msg: "form code required", level: "error" }] };
    if (!/^[A-Z]{2,3}$/.test(s))
        issues.push({ field: "frm", code: "E_FRM_FORMAT", msg: "use 2–3 letter code (e.g., TB, CP, SY)", level: "error" });
    return { value: s, issues };
}
export function sanitizeCountryCode(v) {
    const issues = [];
    const s = String(v !== null && v !== void 0 ? v : "").trim().toUpperCase();
    if (!s)
        return { issues: [{ field: "coo", code: "E_COO_MISSING", msg: "country code required", level: "error" }] };
    if (!/^[A-Z]{2}$/.test(s))
        issues.push({ field: "coo", code: "E_COO_FORMAT", msg: "use 2-letter ISO-2 code (e.g., IN, ET)", level: "error" });
    return { value: s, issues };
}
export function sanitizePackageCode(v) {
    const issues = [];
    const s = String(v !== null && v !== void 0 ? v : "").trim().toUpperCase();
    if (!s)
        return { issues: [{ field: "pkg", code: "E_PKG_MISSING", msg: "package code required", level: "error" }] };
    const ok = /^(\d+[A-Z]+(X\d+[A-Z]+)?)$/.test(s);
    if (!ok)
        issues.push({ field: "pkg", code: "E_PKG_FORMAT", msg: "use 30TAB, 1BTLX100ML, 1VIALX10ML", level: "error" });
    return { value: s, issues };
}
export function sanitizeRow(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const issues = [];
    const out = { generic_name: "" };
    const generic = collapseWS(String((_a = input.generic_name) !== null && _a !== void 0 ? _a : "")).trim();
    if (!generic)
        issues.push({ field: "generic_name", code: "E_GENERIC_MISSING", msg: "generic_name required", level: "error" });
    out.generic_name = generic || "";
    const f = sanitizeForm(input.form);
    if (f.value)
        out.form = f.value;
    issues.push(...f.issues);
    out.brand_name = collapseWS(String((_b = input.brand_name) !== null && _b !== void 0 ? _b : "")).trim() || undefined;
    out.manufacturer_name = collapseWS(String((_c = input.manufacturer_name) !== null && _c !== void 0 ? _c : "")).trim() || undefined;
    // No-digits rule: text-only fields should not contain digits or unit tokens
    if (out.manufacturer_name && (hasDigit(out.manufacturer_name) || hasUnitToken(out.manufacturer_name))) {
        issues.push({ field: "manufacturer_name", code: "E_TEXT_DIGITS_SUSPECT", msg: "manufacturer must not contain digits/units", level: "warn" });
    }
    const st = sanitizeStrength(input.strength);
    if (st.value !== undefined)
        out.strength = st.value;
    issues.push(...st.issues);
    const gt = sanitizeGTIN(input.gtin);
    if (gt.value !== undefined)
        out.gtin = gt.value;
    issues.push(...gt.issues);
    out.category = collapseWS(String((_d = input.category) !== null && _d !== void 0 ? _d : "")).trim() || undefined;
    if (out.category && /^\d+(?:\.\d+)?$/.test(out.category)) {
        issues.push({ field: "category", code: "E_CATEGORY_NUMERIC", msg: "category cannot be numeric", level: "error" });
        out.category = undefined;
    }
    if (out.category && (hasDigit(out.category) || hasUnitToken(out.category))) {
        issues.push({ field: "category", code: "E_TEXT_DIGITS_SUSPECT", msg: "category must not contain digits/units", level: "warn" });
    }
    const rp = sanitizeBool(input.requires_prescription);
    if (rp.value !== undefined)
        out.requires_prescription = rp.value;
    issues.push(...rp.issues);
    const ic = sanitizeBool(input.is_controlled);
    if (ic.value !== undefined)
        out.is_controlled = ic.value;
    issues.push(...ic.issues);
    out.storage_conditions = collapseWS(String((_e = input.storage_conditions) !== null && _e !== void 0 ? _e : "")).trim() || undefined;
    out.description = collapseWS(String((_f = input.description) !== null && _f !== void 0 ? _f : "")).trim() || undefined;
    const bn = sanitizeBatchNo(input.batch_no);
    const expiryIsoFlex = parseDateFlexible(input.expiry_date);
    const q = sanitizeNumber(input.on_hand, { ge: 0 });
    const pr = sanitizeNumber(input.unit_price, { gt: 0 });
    const rv = sanitizeNumber((_g = input.reserved) !== null && _g !== void 0 ? _g : 0, { ge: 0 });
    issues.push(...bn.issues, ...q.issues, ...pr.issues, ...rv.issues);
    out.batch_no = bn.value;
    out.expiry_date = expiryIsoFlex !== null && expiryIsoFlex !== void 0 ? expiryIsoFlex : (collapseWS(String((_h = input.expiry_date) !== null && _h !== void 0 ? _h : "")).trim() || undefined);
    out.on_hand = q.value;
    out.unit_price = pr.value;
    out.reserved = (_j = rv.value) !== null && _j !== void 0 ? _j : 0;
    out.purchase_unit = collapseWS(String((_k = input.purchase_unit) !== null && _k !== void 0 ? _k : "")).trim() || undefined;
    out.pieces_per_unit = collapseWS(String((_l = input.pieces_per_unit) !== null && _l !== void 0 ? _l : "")).trim() || undefined;
    out.unit = collapseWS(String((_m = input.unit) !== null && _m !== void 0 ? _m : "")).trim() || undefined;
    const hasVal = (v) => String(v !== null && v !== void 0 ? v : "").trim() !== "";
    if (input.cat !== undefined && hasVal(input.cat)) {
        const c = sanitizeCategoryCode(input.cat);
        if (c.value !== undefined)
            out.cat = c.value;
        issues.push(...c.issues);
    }
    if (input.frm !== undefined && hasVal(input.frm)) {
        const fc = sanitizeFormCode(input.frm);
        if (fc.value !== undefined)
            out.frm = fc.value;
        issues.push(...fc.issues);
    }
    if (input.pkg !== undefined && hasVal(input.pkg)) {
        const pc = sanitizePackageCode(input.pkg);
        if (pc.value !== undefined)
            out.pkg = pc.value;
        issues.push(...pc.issues);
    }
    // Country normalization via ISO dataset with alias+fuzzy layer
    if (input.coo !== undefined && hasVal(input.coo)) {
        const cooRaw = collapseWS(String((_o = input.coo) !== null && _o !== void 0 ? _o : "")).trim();
        if (cooRaw && hasDigit(cooRaw)) {
            issues.push({ field: "coo", code: "E_TEXT_DIGITS_SUSPECT", msg: "country must not contain digits", level: "warn" });
        }
        if (/^\d+(?:\.\d+)?$/.test(cooRaw)) {
            issues.push({ field: "coo", code: "E_COO_NUMERIC", msg: "country cannot be numeric", level: "error" });
        }
        else {
            const iso2 = normalizeCountryToIso2(String(input.coo)) || String(input.coo);
            const cc = sanitizeCountryCode(iso2);
            if (cc.value !== undefined)
                out.coo = cc.value;
            issues.push(...cc.issues);
        }
    }
    const sku = collapseWS(String((_p = input.sku) !== null && _p !== void 0 ? _p : "")).trim();
    if (sku)
        out.sku = sku;
    return { row: out, issues };
}
const ddmmyyyyToIso = (s) => {
    if (!s)
        return undefined;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
    if (!m)
        return undefined;
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
};
/**
 * Parse common expiry formats into deterministic ISO date (YYYY-MM-DD).
 * Supports:
 * - ISO `YYYY-MM-DD` pass-through
 * - `DD/MM/YYYY` → ISO
 * - Excel serial (>=60) → ISO
 * - `MMM-YY`, `MMM/YY`, `MMM YYYY` (e.g., `Nov-28`, `Feb/2028`) → last day of month
 * - `MM-YY`, `MM/YY`, `MM YYYY` (e.g., `11-28`, `07/2030`) → last day of month
 * Signed: EyosiyasJ
 */
const parseDateFlexible = (value) => {
    var _a;
    if (value === undefined || value === null || value === "")
        return undefined;
    const s = String(value).trim();
    if (!s)
        return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))
        return s;
    const iso = ddmmyyyyToIso(s);
    if (iso)
        return iso;
    // Excel serial dates
    if (/^\d{3,5}$/.test(s)) {
        const serial = Number(s);
        if (Number.isFinite(serial) && serial > 59 && serial < 400000) {
            const base = new Date(Date.UTC(1899, 11, 31));
            const adj = serial > 60 ? serial - 1 : serial;
            const dt = new Date(base.getTime() + adj * 86400000);
            if (!isNaN(dt.getTime()))
                return dt.toISOString().slice(0, 10);
        }
    }
    // Month tokens
    const MONTHS = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    };
    const norm = s.toLowerCase().replace(/[,]/g, "").replace(/\s+/g, " ").trim();
    const parts = norm.split(/[-/ ]+/).filter(Boolean);
    const lastDayOfMonth = (y, m1to12) => {
        const mm = String(m1to12).padStart(2, "0");
        const end = new Date(y, m1to12, 0).getDate();
        const dd = String(end).padStart(2, "0");
        return `${y}-${mm}-${dd}`;
    };
    // Named month patterns: MMM-YY or MMM YYYY
    if (parts.length === 2 && /[a-z]/.test(parts[0])) {
        const m = (_a = MONTHS[parts[0].slice(0, 4)]) !== null && _a !== void 0 ? _a : MONTHS[parts[0]];
        if (m) {
            const yy = parts[1];
            const year = /^\d{2}$/.test(yy) ? 2000 + Number(yy) : Number(yy);
            if (year >= 1900 && year <= 2100)
                return lastDayOfMonth(year, m);
        }
    }
    // Numeric month patterns: MM-YY or MM YYYY
    if (parts.length === 2 && /^\d{1,2}$/.test(parts[0]) && /^\d{2,4}$/.test(parts[1])) {
        const m = Number(parts[0]);
        const year = /^\d{2}$/.test(parts[1]) ? 2000 + Number(parts[1]) : Number(parts[1]);
        if (m >= 1 && m <= 12 && year >= 1900 && year <= 2100)
            return lastDayOfMonth(year, m);
    }
    return undefined;
};
const isFutureDate = (iso) => {
    const target = new Date(`${iso}T00:00:00.000Z`);
    if (isNaN(target.getTime()))
        return false;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return target.getTime() > today.getTime();
};
const mapIssueToParsed = (issue, rowIndex) => {
    const fieldPath = (() => {
        switch (issue.field) {
            case "generic_name":
            case "strength":
            case "form":
            case "category":
                return `product.${issue.field}`;
            case "batch_no":
            case "expiry_date":
            case "on_hand":
            case "unit_price":
                return `batch.${issue.field}`;
            case "coo":
                return "identity.coo";
            case "cat":
            case "frm":
            case "pkg":
            case "sku":
                return `identity.${issue.field}`;
            default:
                return issue.field;
        }
    })();
    return { row: rowIndex, field: fieldPath, code: issue.code, message: issue.msg };
};
/**
 * Sanitize and validate a canonical row with schema-aware rules and mode controls.
 *
 * Parameters:
 * - `raw`: partial `CanonicalProduct` prior to strict normalization.
 * - `rowIndex`: 1-based Excel/CSV row index for error reporting.
 * - `schema`: `SourceSchema` used to adjust requiredness (best-effort for `concat_items`).
 * - `validationMode`: `full` | `errorsOnly` | `none` to control error verbosity/perf.
 *
 * Behavior:
 * - Builds `pkg.pieces_per_unit` from `pieces_per_unit` and retains `identity` codes.
 * - For `concat_items` with no dose signal (no strength), only `generic_name` is required.
 * - Suppresses category digit/units warnings under `concat_items` (POS IDs common).
 * - Filters warnings in `errorsOnly`; suppresses all errors in `none`.
 *
 * Returns:
 * - `{ row, errors }` where `row` is `CanonicalProduct | null` if unrecoverable,
 *   and `errors` are `ParsedRowError[]` respecting `validationMode`.
 * Signed: EyosiyasJ
 */
export function sanitizeCanonicalRow(raw, rowIndex, schema, validationMode = "full") {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32;
    const flat = {
        generic_name: (_a = raw.product) === null || _a === void 0 ? void 0 : _a.generic_name,
        brand_name: (_b = raw.product) === null || _b === void 0 ? void 0 : _b.brand_name,
        strength: (_c = raw.product) === null || _c === void 0 ? void 0 : _c.strength,
        form: (_d = raw.product) === null || _d === void 0 ? void 0 : _d.form,
        category: (_f = (_e = raw.product) === null || _e === void 0 ? void 0 : _e.category) !== null && _f !== void 0 ? _f : undefined,
        requires_prescription: (_g = raw.product) === null || _g === void 0 ? void 0 : _g.requires_prescription,
        is_controlled: (_h = raw.product) === null || _h === void 0 ? void 0 : _h.is_controlled,
        storage_conditions: (_j = raw.product) === null || _j === void 0 ? void 0 : _j.storage_conditions,
        description: (_k = raw.product) === null || _k === void 0 ? void 0 : _k.description,
        batch_no: (_l = raw.batch) === null || _l === void 0 ? void 0 : _l.batch_no,
        expiry_date: (_m = raw.batch) === null || _m === void 0 ? void 0 : _m.expiry_date,
        on_hand: (_o = raw.batch) === null || _o === void 0 ? void 0 : _o.on_hand,
        unit_price: (_p = raw.batch) === null || _p === void 0 ? void 0 : _p.unit_price,
        cat: (_q = raw.identity) === null || _q === void 0 ? void 0 : _q.cat,
        frm: (_r = raw.identity) === null || _r === void 0 ? void 0 : _r.frm,
        pkg: (_s = raw.identity) === null || _s === void 0 ? void 0 : _s.pkg,
        coo: (_u = (_t = raw.batch) === null || _t === void 0 ? void 0 : _t.coo) !== null && _u !== void 0 ? _u : (_v = raw.identity) === null || _v === void 0 ? void 0 : _v.coo,
        sku: (_w = raw.identity) === null || _w === void 0 ? void 0 : _w.sku,
        purchase_unit: (_x = raw.identity) === null || _x === void 0 ? void 0 : _x.purchase_unit,
        pieces_per_unit: (_y = raw.pkg) === null || _y === void 0 ? void 0 : _y.pieces_per_unit,
        unit: (_z = raw.identity) === null || _z === void 0 ? void 0 : _z.unit,
    };
    const { row, issues } = sanitizeRow(flat);
    const filteredIssues = (() => {
        if (schema === "concat_items") {
            return issues.filter((i) => !(i.field === "category" && i.code === "E_TEXT_DIGITS_SUSPECT"));
        }
        return issues;
    })();
    const baseIssues = validationMode === "errorsOnly" ? filteredIssues.filter((i) => i.level === "error") : filteredIssues;
    const errors = validationMode === "none" ? [] : baseIssues.map((i) => mapIssueToParsed(i, rowIndex));
    if (!row)
        return { row: null, errors };
    const hasGeneric = Boolean(row.generic_name && row.generic_name.trim());
    const hasBrand = Boolean(row.brand_name && String(row.brand_name).trim());
    if (validationMode !== "none" && !hasGeneric && !hasBrand) {
        errors.push({ row: rowIndex, field: "product.generic_name", code: "E_PRODUCT_NAME_REQUIRED", message: "Product name required" });
    }
    const emptyish = (v) => {
        const s = String(v !== null && v !== void 0 ? v : "").trim().toLowerCase();
        return !s || s === "n/a" || s === "na" || s === "-" || s === "none" || s === "null";
    };
    const doseSignalPresent = Boolean(row.strength && String(row.strength).trim());
    const relaxed = schema === "concat_items" && !doseSignalPresent;
    if (validationMode !== "none" && emptyish(row.generic_name)) {
        errors.push({ row: rowIndex, field: "product.generic_name", code: "E_REQUIRED_GENERIC_NAME", message: "generic_name required" });
    }
    if (validationMode !== "none" && !relaxed) {
        if (emptyish(row.strength)) {
            errors.push({ row: rowIndex, field: "product.strength", code: "E_REQUIRED_STRENGTH", message: "strength required" });
        }
        if (emptyish(row.form)) {
            errors.push({ row: rowIndex, field: "product.form", code: "E_REQUIRED_FORM", message: "form required" });
        }
        if (emptyish(row.category)) {
            errors.push({ row: rowIndex, field: "product.category", code: "E_REQUIRED_CATEGORY", message: "category required" });
        }
    }
    const expiryIso = parseDateFlexible(row.expiry_date);
    if (validationMode !== "none" && !relaxed) {
        if (emptyish(row.expiry_date)) {
            errors.push({ row: rowIndex, field: "batch.expiry_date", code: "E_REQUIRED_EXPIRY", message: "expiry_date required" });
        }
    }
    if (validationMode !== "none") {
        if (expiryIso) {
            if (!isFutureDate(expiryIso)) {
                errors.push({ row: rowIndex, field: "batch.expiry_date", code: "expired", message: "Expiry date must be in the future" });
            }
        }
        else if (row.expiry_date) {
            errors.push({ row: rowIndex, field: "batch.expiry_date", code: "invalid_format", message: "Cannot parse expiry date" });
        }
    }
    const hasPack = Boolean(row.pkg) || (typeof row.pieces_per_unit === "number" && !Number.isNaN(row.pieces_per_unit)) || (typeof row.pieces_per_unit === "string" && !emptyish(row.pieces_per_unit));
    if (validationMode !== "none" && !relaxed) {
        if (!hasPack) {
            errors.push({ row: rowIndex, field: "pkg.pieces_per_unit", code: "E_REQUIRED_PACK_CONTENTS", message: "pack contents required" });
        }
        if (emptyish(row.coo)) {
            errors.push({ row: rowIndex, field: "identity.coo", code: "E_REQUIRED_COO", message: "country of origin required" });
        }
        if (row.on_hand === undefined || row.on_hand === null || Number.isNaN(Number(row.on_hand))) {
            errors.push({ row: rowIndex, field: "batch.on_hand", code: "E_REQUIRED_QUANTITY", message: "quantity required" });
        }
    }
    // Do not hard-drop on stock/identity errors; apps decide readiness.
    const canonical = {
        product: {
            generic_name: (_0 = row.generic_name) !== null && _0 !== void 0 ? _0 : "",
            brand_name: (_2 = ((_1 = row.brand_name) !== null && _1 !== void 0 ? _1 : null)) !== null && _2 !== void 0 ? _2 : null,
            manufacturer_name: (_4 = ((_3 = row.manufacturer_name) !== null && _3 !== void 0 ? _3 : null)) !== null && _4 !== void 0 ? _4 : null,
            strength: (_5 = row.strength) !== null && _5 !== void 0 ? _5 : "",
            form: (_6 = row.form) !== null && _6 !== void 0 ? _6 : "",
            category: (_7 = row.category) !== null && _7 !== void 0 ? _7 : null,
            requires_prescription: typeof row.requires_prescription === "boolean" ? row.requires_prescription : null,
            is_controlled: typeof row.is_controlled === "boolean" ? row.is_controlled : null,
            storage_conditions: (_8 = row.storage_conditions) !== null && _8 !== void 0 ? _8 : null,
            description: (_9 = row.description) !== null && _9 !== void 0 ? _9 : null,
        },
        batch: {
            batch_no: (_10 = row.batch_no) !== null && _10 !== void 0 ? _10 : "",
            expiry_date: expiryIso !== null && expiryIso !== void 0 ? expiryIso : "",
            on_hand: (_11 = row.on_hand) !== null && _11 !== void 0 ? _11 : 0,
            unit_price: (_12 = row.unit_price) !== null && _12 !== void 0 ? _12 : null,
            coo: (_13 = row.coo) !== null && _13 !== void 0 ? _13 : null,
        },
    };
    const identityHasValues = Boolean(row.cat || row.frm || row.pkg || row.coo || row.sku);
    if (identityHasValues) {
        canonical.identity = {
            cat: (_14 = row.cat) !== null && _14 !== void 0 ? _14 : null,
            frm: (_15 = row.frm) !== null && _15 !== void 0 ? _15 : null,
            pkg: (_16 = row.pkg) !== null && _16 !== void 0 ? _16 : null,
            coo: (_17 = row.coo) !== null && _17 !== void 0 ? _17 : null,
            sku: (_18 = row.sku) !== null && _18 !== void 0 ? _18 : null,
            purchase_unit: (_19 = row.purchase_unit) !== null && _19 !== void 0 ? _19 : null,
            unit: (_20 = row.unit) !== null && _20 !== void 0 ? _20 : null,
        };
    }
    // Build packaging namespace for pack contents
    const parsedPiecesPerUnit = (() => {
        const v = row.pieces_per_unit;
        if (typeof v === "number")
            return Number.isFinite(v) ? v : undefined;
        if (typeof v === "string") {
            const s = v.replace(/,/g, "").trim();
            const n = Number(s);
            if (Number.isFinite(n))
                return n;
        }
        return undefined;
    })();
    if (parsedPiecesPerUnit !== undefined) {
        canonical.pkg = { pieces_per_unit: parsedPiecesPerUnit };
    }
    // Derive umbrella category: prefer 3-letter code when present, else use text classification
    const umbrellaFromCode = mapCategoryCodeToUmbrella(row.cat);
    const umbrella = umbrellaFromCode !== null && umbrellaFromCode !== void 0 ? umbrellaFromCode : classifyUmbrellaCategory({
        generic_name: canonical.product.generic_name,
        brand_name: (_21 = canonical.product.brand_name) !== null && _21 !== void 0 ? _21 : undefined,
        category: (_22 = canonical.product.category) !== null && _22 !== void 0 ? _22 : undefined,
        description: (_23 = canonical.product.description) !== null && _23 !== void 0 ? _23 : undefined,
    });
    if (umbrella) {
        canonical.product.umbrella_category = umbrella;
        if (umbrellaFromCode) {
            const rule = UMBRELLA_CATEGORY_INDEX[umbrella];
            if (rule && rule.label) {
                canonical.product.category = rule.label;
            }
        }
    }
    else {
        const hasCategorySignal = Boolean(((_24 = row.category) !== null && _24 !== void 0 ? _24 : "").trim()) || Boolean(((_25 = row.cat) !== null && _25 !== void 0 ? _25 : "").trim());
        if (hasCategorySignal) {
            if (!canonical.product.category || !String(canonical.product.category).trim()) {
                canonical.product.category = "NA";
            }
        }
    }
    // Universal NA fallback for empty text fields
    const textNA = (v) => {
        const s = String(v !== null && v !== void 0 ? v : "").trim();
        return s ? s : "NA";
    };
    canonical.product.brand_name = textNA((_26 = canonical.product.brand_name) !== null && _26 !== void 0 ? _26 : "");
    canonical.product.manufacturer_name = textNA((_27 = canonical.product.manufacturer_name) !== null && _27 !== void 0 ? _27 : "");
    canonical.product.form = textNA((_28 = canonical.product.form) !== null && _28 !== void 0 ? _28 : "");
    canonical.product.category = textNA((_29 = canonical.product.category) !== null && _29 !== void 0 ? _29 : "");
    canonical.product.storage_conditions = textNA((_30 = canonical.product.storage_conditions) !== null && _30 !== void 0 ? _30 : "");
    canonical.product.description = textNA((_31 = canonical.product.description) !== null && _31 !== void 0 ? _31 : "");
    canonical.batch.batch_no = textNA((_32 = canonical.batch.batch_no) !== null && _32 !== void 0 ? _32 : "");
    return { row: canonical, errors };
}
