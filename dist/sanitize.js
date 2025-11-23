import { classifyUmbrellaCategory, mapCategoryCodeToUmbrella, UMBRELLA_CATEGORY_INDEX, UMBRELLA_CATEGORY_RULES, NON_MEDICINE_KEYWORDS } from "./category.js";
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
const UNIT_RE = /\b(mg|mcg|g|kg|ml|l|iu|%|w\/v|w\/w|v\/v)\b/i;
const hasUnitToken = (s) => UNIT_RE.test(String(s !== null && s !== void 0 ? s : ""));
const envList = (name) => {
    var _a, _b, _c;
    const raw = String((_c = (_b = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b[name]) !== null && _c !== void 0 ? _c : "");
    return new Set(raw.split(/[,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
};
const ALLOWED_NUMERIC_BRANDS = envList("ALLOWED_NUMERIC_BRANDS");
const ALLOWED_NUMERIC_MANUF = envList("ALLOWED_NUMERIC_MANUF");
const isAllowedNumericBrand = (s) => (/\d/.test(String(s !== null && s !== void 0 ? s : "")) && ALLOWED_NUMERIC_BRANDS.has(String(s !== null && s !== void 0 ? s : "").trim().toLowerCase()));
const isAllowedNumericManuf = (s) => (/\d/.test(String(s !== null && s !== void 0 ? s : "")) && ALLOWED_NUMERIC_MANUF.has(String(s !== null && s !== void 0 ? s : "").trim().toLowerCase()));
const punctCount = (s) => ((String(s !== null && s !== void 0 ? s : "").match(/[-,\/&\.]/g) || []).length);
const ALNUM_BATCH_RE = /^[A-Za-z0-9\-_.\/]+$/;
const isAlphaNumericBatch = (s) => {
    const v = String(s !== null && s !== void 0 ? s : "");
    if (!ALNUM_BATCH_RE.test(v))
        return false;
    return /[A-Za-z]/.test(v) || /^\d{4,}$/.test(v);
};
const MANUF_HINT_RE = /\b(pharma|pharmaceuticals?|labs?|laboratories|industries|industry|manufacturing|manufacturer|healthcare|biotech|med|medica|medicines|drug|plc|ltd|limited|inc|gmbh|s\.a\.|s\.p\.a\.|ag)\b/i;
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
        const strengthLikeRe = /^\d+(?:\.\d+)?\s*(MG|MCG|G|KG|ML|L|IU|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(MG|MCG|G|KG|ML|L|%))?$/;
        if (!isAlphaNumericBatch(s)) {
            issues.push({ field: "batch_no", code: "E_BATCH_ALNUM", msg: "batch_no must be alphanumeric", level: "error" });
        }
        if (hasUnitToken(s)) {
            issues.push({ field: "batch_no", code: "E_BATCH_UNIT_TOKEN", msg: "batch_no must not contain units", level: "error" });
        }
        if (strengthLikeRe.test(s)) {
            issues.push({ field: "batch_no", code: "E_BATCH_STRENGTH_LIKE", msg: "batch_no looks like strength", level: "error" });
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
/**
 * Sanitize a loosely-typed canonical row with schema-aware invariants.
 * Signed: EyosiyasJ
 */
export function sanitizeRow(input, schema) {
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
    if (out.category) {
        const cat = out.category;
        const pureInt = /^\d+$/.test(cat);
        const hasDigits = hasDigit(cat);
        const hasUnits = hasUnitToken(cat);
        if (schema === "concat_items") {
            if (pureInt) {
                // allow numeric CategoryId
            }
            else if (hasUnits || (hasDigits && /[A-Za-z]/.test(cat))) {
                issues.push({ field: "category", code: "W_CATEGORY_SUSPECT", msg: "category rejected (digits/units)", level: "warn" });
                out.category = undefined;
            }
        }
        else {
            if (/^\d+(?:\.\d+)?$/.test(cat)) {
                issues.push({ field: "category", code: "E_CATEGORY_NUMERIC", msg: "category cannot be numeric", level: "error" });
                out.category = undefined;
            }
            if (hasDigits || hasUnits) {
                issues.push({ field: "category", code: "E_TEXT_DIGITS_SUSPECT", msg: "category must not contain digits/units", level: "warn" });
            }
        }
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39;
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
    // Product-Type aware adjustments for Template v3
    let productTypeRaw = String((_1 = (_0 = raw.identity) === null || _0 === void 0 ? void 0 : _0.product_type) !== null && _1 !== void 0 ? _1 : "").trim().toLowerCase();
    const isTemplateV3 = schema === "template_v3";
    // Auto-suggest Product Type when missing using keyword library
    if (isTemplateV3 && !productTypeRaw) {
        const combined = [(_2 = raw.product) === null || _2 === void 0 ? void 0 : _2.generic_name, (_3 = raw.product) === null || _3 === void 0 ? void 0 : _3.brand_name, (_4 = raw.product) === null || _4 === void 0 ? void 0 : _4.description]
            .map((v) => String(v !== null && v !== void 0 ? v : "").toLowerCase())
            .join(" ");
        const matchAny = (list) => list.some((kw) => combined.includes(kw));
        const isAccessories = matchAny(NON_MEDICINE_KEYWORDS.accessories);
        const isChemicals = matchAny(NON_MEDICINE_KEYWORDS.chemicalsAndReagents);
        if (isAccessories || isChemicals) {
            productTypeRaw = "non-medicine";
            // Force category consistent with detected group
            const forcedCat = isChemicals ? "Chemicals & Reagents" : "Accessories";
            flat.category = forcedCat;
        }
    }
    const isNonMedicine = isTemplateV3 && productTypeRaw === "non-medicine";
    const isMedicine = isTemplateV3 && productTypeRaw === "medicine";
    if (isTemplateV3) {
        if (!productTypeRaw) {
            if (validationMode !== "none") {
                // identity.product_type missing
                const err = { row: rowIndex, field: "identity.product_type", code: "E_PRODUCT_TYPE_MISSING", message: "Product Type required (medicine | non-medicine)" };
                const errs = [err];
                // continue; do not return early
            }
        }
        else if (!(isNonMedicine || isMedicine)) {
            if (validationMode !== "none") {
                const err = { row: rowIndex, field: "identity.product_type", code: "E_PRODUCT_TYPE_INVALID", message: "Product Type must be medicine or non-medicine" };
                const errs = [err];
            }
        }
        if (isNonMedicine) {
            // Non-medicine: ignore medicine-only fields before sanitization
            flat.strength = undefined;
            flat.form = undefined;
            flat.expiry_date = undefined;
        }
    }
    const { row, issues } = sanitizeRow(flat, schema);
    const filteredIssues = (() => {
        let base = issues;
        if (schema === "concat_items") {
            base = base.filter((i) => !(i.field === "category" && i.code === "E_TEXT_DIGITS_SUSPECT"));
        }
        if (isNonMedicine) {
            base = base.filter((i) => !(i.field === "form" && i.code === "E_FORM_MISSING"));
        }
        return base;
    })();
    const baseIssues = validationMode === "errorsOnly" ? filteredIssues.filter((i) => i.level === "error") : filteredIssues;
    let errors = validationMode === "none" ? [] : baseIssues.map((i) => mapIssueToParsed(i, rowIndex));
    // Product Type errors appended post-sanitize issues
    if (validationMode !== "none" && isTemplateV3) {
        if (!productTypeRaw) {
            errors.push({ row: rowIndex, field: "identity.product_type", code: "E_PRODUCT_TYPE_MISSING", message: "Product Type required (medicine | non-medicine)" });
        }
        else if (!(isNonMedicine || isMedicine)) {
            errors.push({ row: rowIndex, field: "identity.product_type", code: "E_PRODUCT_TYPE_INVALID", message: "Product Type must be medicine or non-medicine" });
        }
    }
    if (validationMode !== "none" && isNonMedicine) {
        errors = errors.filter((e) => !((e.field === "product.form" && e.code.startsWith("E_FORM"))));
    }
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
    const doseRequired = !relaxed && !isNonMedicine;
    if (validationMode !== "none" && emptyish(row.generic_name)) {
        errors.push({ row: rowIndex, field: "product.generic_name", code: "E_REQUIRED_GENERIC_NAME", message: "generic_name required" });
    }
    if (validationMode !== "none") {
        if (doseRequired) {
            if (emptyish(row.strength)) {
                const code = schema === "concat_items" ? "W_OPTIONAL_STRENGTH_MISSING" : "E_REQUIRED_STRENGTH";
                const message = schema === "concat_items" ? "strength recommended for concat_items" : "strength required";
                errors.push({ row: rowIndex, field: "product.strength", code, message });
            }
            if (emptyish(row.form)) {
                errors.push({ row: rowIndex, field: "product.form", code: "E_REQUIRED_FORM", message: "form required" });
            }
        }
        if (emptyish(row.category)) {
            errors.push({ row: rowIndex, field: "product.category", code: "E_REQUIRED_CATEGORY", message: "category required" });
        }
    }
    const expiryIso = parseDateFlexible(row.expiry_date);
    if (validationMode !== "none" && !relaxed && !isNonMedicine) {
        if (emptyish(row.expiry_date)) {
            const code = schema === "concat_items" ? "W_OPTIONAL_EXPIRY_MISSING" : "E_REQUIRED_EXPIRY";
            const message = schema === "concat_items" ? "expiry recommended for concat_items" : "expiry_date required";
            errors.push({ row: rowIndex, field: "batch.expiry_date", code, message });
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
            const code = schema === "concat_items" ? "W_OPTIONAL_COO_MISSING" : "E_REQUIRED_COO";
            const message = schema === "concat_items" ? "COO recommended for concat_items" : "country of origin required";
            errors.push({ row: rowIndex, field: "identity.coo", code, message });
        }
        if (row.on_hand === undefined || row.on_hand === null || Number.isNaN(Number(row.on_hand))) {
            errors.push({ row: rowIndex, field: "batch.on_hand", code: "E_REQUIRED_QUANTITY", message: "quantity required" });
        }
    }
    // Product-Type category constraints
    if (validationMode !== "none" && isTemplateV3 && !emptyish(row.category)) {
        const catLower = String((_5 = row.category) !== null && _5 !== void 0 ? _5 : "").trim().toLowerCase();
        if (isNonMedicine) {
            const allowed = new Set(["accessories", "chemicals & reagents"]);
            if (!allowed.has(catLower)) {
                errors.push({ row: rowIndex, field: "product.category", code: "E_CATEGORY_NON_MED_INVALID", message: "category must be either \"Accessories\" or \"Chemicals & Reagents\"" });
            }
        }
        else if (isMedicine) {
            const allowedLabels = new Set(UMBRELLA_CATEGORY_RULES.map((r) => String(r.label).toLowerCase()));
            if (!allowedLabels.has(catLower)) {
                errors.push({ row: rowIndex, field: "product.category", code: "E_CATEGORY_MED_INVALID", message: "category must be one of the 23 medicine categories" });
            }
        }
    }
    // Do not hard-drop on stock/identity errors; apps decide readiness.
    const canonical = {
        product: {
            generic_name: (_6 = row.generic_name) !== null && _6 !== void 0 ? _6 : "",
            brand_name: (_8 = ((_7 = row.brand_name) !== null && _7 !== void 0 ? _7 : null)) !== null && _8 !== void 0 ? _8 : null,
            manufacturer_name: (_10 = ((_9 = row.manufacturer_name) !== null && _9 !== void 0 ? _9 : null)) !== null && _10 !== void 0 ? _10 : null,
            strength: (_11 = row.strength) !== null && _11 !== void 0 ? _11 : "",
            form: (_12 = row.form) !== null && _12 !== void 0 ? _12 : "",
            category: (_13 = row.category) !== null && _13 !== void 0 ? _13 : null,
            requires_prescription: typeof row.requires_prescription === "boolean" ? row.requires_prescription : null,
            is_controlled: typeof row.is_controlled === "boolean" ? row.is_controlled : null,
            storage_conditions: (_14 = row.storage_conditions) !== null && _14 !== void 0 ? _14 : null,
            description: (_15 = row.description) !== null && _15 !== void 0 ? _15 : null,
        },
        batch: {
            batch_no: (_16 = row.batch_no) !== null && _16 !== void 0 ? _16 : "",
            expiry_date: expiryIso !== null && expiryIso !== void 0 ? expiryIso : "",
            on_hand: (_17 = row.on_hand) !== null && _17 !== void 0 ? _17 : 0,
            unit_price: (_18 = row.unit_price) !== null && _18 !== void 0 ? _18 : null,
            coo: (_19 = row.coo) !== null && _19 !== void 0 ? _19 : null,
        },
    };
    const identityHasValues = Boolean(row.cat || row.frm || row.pkg || row.coo || row.sku || productTypeRaw);
    if (identityHasValues) {
        canonical.identity = {
            cat: (_20 = row.cat) !== null && _20 !== void 0 ? _20 : null,
            frm: (_21 = row.frm) !== null && _21 !== void 0 ? _21 : null,
            pkg: (_22 = row.pkg) !== null && _22 !== void 0 ? _22 : null,
            coo: (_23 = row.coo) !== null && _23 !== void 0 ? _23 : null,
            sku: (_24 = row.sku) !== null && _24 !== void 0 ? _24 : null,
            purchase_unit: (_25 = row.purchase_unit) !== null && _25 !== void 0 ? _25 : null,
            unit: (_26 = row.unit) !== null && _26 !== void 0 ? _26 : null,
            product_type: productTypeRaw ? productTypeRaw : null,
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
        brand_name: (_27 = canonical.product.brand_name) !== null && _27 !== void 0 ? _27 : undefined,
        category: (_28 = canonical.product.category) !== null && _28 !== void 0 ? _28 : undefined,
        description: (_29 = canonical.product.description) !== null && _29 !== void 0 ? _29 : undefined,
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
        const hasCategorySignal = Boolean(((_30 = row.category) !== null && _30 !== void 0 ? _30 : "").trim()) || Boolean(((_31 = row.cat) !== null && _31 !== void 0 ? _31 : "").trim());
        if (hasCategorySignal) {
            if (!canonical.product.category || !String(canonical.product.category).trim()) {
                canonical.product.category = "NA";
            }
        }
    }
    // Post-parse sanity pass: enforce invariants and downgrade suspicious values
    const strengthLikeRe = /^\d+(?:\.\d+)?\s*(mg|mcg|g|kg|ml|l|iu|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|kg|ml|l|%))?$/i;
    const pushSuspect = (fieldPath, value) => {
        if (validationMode !== "none") {
            errors.push({ row: rowIndex, field: fieldPath, code: "E_FIELD_SUSPECT_VALUE", message: "value failed invariants; moved to description" });
        }
    };
    if (canonical.product.form && (hasDigit(canonical.product.form) || hasUnitToken(canonical.product.form))) {
        const moved = canonical.product.form;
        canonical.product.form = "";
        canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
        pushSuspect("product.form", moved);
    }
    if (canonical.product.category) {
        const c = String(canonical.product.category);
        const pureInt = /^\d+$/.test(c);
        const hasDigits = hasDigit(c);
        const hasUnits = hasUnitToken(c);
        if (schema === "concat_items") {
            if (!(pureInt || (!hasDigits && !hasUnits))) {
                const moved = c;
                canonical.product.category = "";
                canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
                pushSuspect("product.category", moved);
            }
        }
        else {
            if (hasDigits || hasUnits) {
                const moved = c;
                canonical.product.category = "";
                canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
                pushSuspect("product.category", moved);
            }
        }
    }
    // Generic vs strength/form purity: strip unit tokens and form words from generic_name
    if (canonical.product.generic_name) {
        const original = canonical.product.generic_name;
        const unitTokenRe = /\b(\d+(?:\.\d+)?\s*(mg|mcg|g|kg|ml|l|iu|%)\b(?:\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|kg|ml|l|%))?)/gi;
        const formWords = [...Object.keys(FORM_SYNONYMS), ...FORM_ENUM].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const formRe = new RegExp(`\\b(${formWords.join("|")})s?\\b`, "gi");
        const removed = [];
        let g = original;
        g = g.replace(unitTokenRe, (m) => { removed.push(m); return " "; });
        g = g.replace(formRe, (m) => { removed.push(m); return " "; });
        g = collapseWS(g);
        if (removed.length && g) {
            canonical.product.generic_name = g;
            const moved = removed.join(" ");
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("product.generic_name", moved);
        }
    }
    // Form vs category duplication: avoid identical values
    if (canonical.product.form && canonical.product.category) {
        const f = String(canonical.product.form).toLowerCase();
        const c = String(canonical.product.category).toLowerCase();
        if (c === f || c === `${f}s`) {
            const moved = canonical.product.category;
            canonical.product.category = "";
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("product.category", moved);
        }
    }
    // COO vs manufacturer swap when manufacturer is a country name
    if (canonical.product.manufacturer_name) {
        const man = String(canonical.product.manufacturer_name);
        const iso = normalizeCountryToIso2(man);
        if (iso) {
            canonical.product.manufacturer_name = "";
            canonical.batch.coo = iso;
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${man}` : man).trim();
            pushSuspect("product.manufacturer_name", man);
        }
        // Manufacturer should not include unit/form hints; demote if contaminated
        const formWords = [...Object.keys(FORM_SYNONYMS), ...FORM_ENUM].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const formRe = new RegExp(`\\b(${formWords.join("|")})s?\\b`, "i");
        if (hasUnitToken(man) || formRe.test(man)) {
            const moved = man;
            canonical.product.manufacturer_name = "";
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("product.manufacturer_name", moved);
        }
    }
    // COO field should be country-like; if it carries manufacturer tokens, demote to description
    if (canonical.batch.coo && String(canonical.batch.coo).length > 2) {
        const cooRaw = String(canonical.batch.coo);
        const manufHint = /\b(pharm|pharma|pharmaceuticals|labs?|ltd|industries|bio|med|health)\b/i;
        if (manufHint.test(cooRaw)) {
            const moved = cooRaw;
            canonical.batch.coo = null;
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("identity.coo", moved);
        }
    }
    if (canonical.batch.batch_no) {
        const b = String(canonical.batch.batch_no);
        if (!isAlphaNumericBatch(b) || hasUnitToken(b) || strengthLikeRe.test(b)) {
            const moved = b;
            canonical.batch.batch_no = "";
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("batch.batch_no", moved);
        }
    }
    if (canonical.product.manufacturer_name) {
        const m = String(canonical.product.manufacturer_name);
        const digitsInvalid = hasDigit(m) && !isAllowedNumericManuf(m);
        if (digitsInvalid || hasUnitToken(m) || strengthLikeRe.test(m) || punctCount(m) > 3) {
            const moved = m;
            canonical.product.manufacturer_name = "";
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("product.manufacturer_name", moved);
        }
    }
    if (canonical.batch.coo) {
        const c = String(canonical.batch.coo);
        if (hasDigit(c) || hasUnitToken(c) || strengthLikeRe.test(c)) {
            const moved = c;
            canonical.batch.coo = null;
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("identity.coo", moved);
        }
    }
    // Brand sanity: avoid conflicts and contamination
    if (canonical.product.brand_name) {
        const b = String(canonical.product.brand_name);
        const eq = (x) => String(x !== null && x !== void 0 ? x : "").trim().toLowerCase() === b.trim().toLowerCase();
        const formWords = [...Object.keys(FORM_SYNONYMS), ...FORM_ENUM].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const formRe = new RegExp(`\\b(${formWords.join("|")})s?\\b`, "i");
        const digitsInvalid = /\d/.test(b) && !isAllowedNumericBrand(b);
        if (eq(canonical.product.generic_name) || eq(canonical.product.manufacturer_name) || hasUnitToken(b) || formRe.test(b) || digitsInvalid || b.length > 40 || punctCount(b) > 3) {
            const moved = b;
            canonical.product.brand_name = null;
            canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
            pushSuspect("product.brand_name", moved);
        }
        else if (MANUF_HINT_RE.test(b)) {
            // If brand looks like a manufacturer and manufacturer is empty, promote conservatively
            if (!canonical.product.manufacturer_name && !(/\d/.test(b)) && !hasUnitToken(b)) {
                canonical.product.manufacturer_name = b;
                canonical.product.brand_name = null;
                pushSuspect("product.manufacturer_name", b);
            }
            else {
                const moved = b;
                canonical.product.brand_name = null;
                canonical.product.description = (canonical.product.description ? `${canonical.product.description} ${moved}` : moved).trim();
                pushSuspect("product.brand_name", moved);
            }
        }
    }
    // Universal NA fallback for empty text fields
    const textNA = (v) => {
        const s = String(v !== null && v !== void 0 ? v : "").trim();
        return s ? s : "NA";
    };
    canonical.product.brand_name = textNA((_32 = canonical.product.brand_name) !== null && _32 !== void 0 ? _32 : "");
    canonical.product.manufacturer_name = textNA((_33 = canonical.product.manufacturer_name) !== null && _33 !== void 0 ? _33 : "");
    canonical.product.form = textNA((_34 = canonical.product.form) !== null && _34 !== void 0 ? _34 : "");
    canonical.product.category = textNA((_35 = canonical.product.category) !== null && _35 !== void 0 ? _35 : "");
    canonical.product.storage_conditions = textNA((_36 = canonical.product.storage_conditions) !== null && _36 !== void 0 ? _36 : "");
    {
        const d = String((_37 = canonical.product.description) !== null && _37 !== void 0 ? _37 : "").trim();
        const m = d.match(/^(.+)\s+\1$/i);
        if (m) {
            canonical.product.description = m[1];
        }
    }
    canonical.product.description = textNA((_38 = canonical.product.description) !== null && _38 !== void 0 ? _38 : "");
    canonical.batch.batch_no = textNA((_39 = canonical.batch.batch_no) !== null && _39 !== void 0 ? _39 : "");
    return { row: canonical, errors };
}
