const FORM_ENUM = ["tablet", "capsule", "syrup", "injection", "cream", "ointment", "drops", "inhaler", "other"];
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
export function sanitizeForm(v) {
    var _a;
    const issues = [];
    const raw = asciiLower(v);
    if (!raw)
        return { issues: [{ field: "form", code: "E_FORM_MISSING", msg: "form required", level: "error" }] };
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
            issues: [{ field: "form", code: "W_FORM_AUTOCORRECT", msg: `autocorrected "${v}"→"${best.mapped}"`, level: "warn" }],
            suggestion: best.mapped,
        };
    }
    return { issues: [{ field: "form", code: "E_FORM_INVALID", msg: `invalid form "${v}"`, level: "error" }] };
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
    if (["true", "yes", "1", "y"].includes(s))
        return { value: true, issues: [] };
    if (["false", "no", "0", "n"].includes(s))
        return { value: false, issues: [] };
    return { issues: [{ field: "boolean", code: "E_BOOL", msg: `not a boolean: "${v}"`, level: "error" }] };
}
export function sanitizeBatchNo(v) {
    const issues = [];
    if (!v)
        return { issues };
    let s = String(v).toUpperCase();
    s = s.replace(/[^A-Z0-9./-]/g, "");
    s = s.replace(/\.{2,}/g, ".");
    s = s.replace(/-{2,}/g, "-");
    s = s.replace(/\/{2,}/g, "/");
    s = s.replace(/^[./-]+|[./-]+$/g, "");
    if (s.length > 20) {
        s = s.slice(0, 20);
        issues.push({ field: "batch_no", code: "W_BATCH_TRUNCATED", msg: "trimmed to max 20 chars", level: "warn" });
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
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
    const st = sanitizeStrength(input.strength);
    if (st.value !== undefined)
        out.strength = st.value;
    issues.push(...st.issues);
    const gt = sanitizeGTIN(input.gtin);
    if (gt.value !== undefined)
        out.gtin = gt.value;
    issues.push(...gt.issues);
    out.category = collapseWS(String((_c = input.category) !== null && _c !== void 0 ? _c : "")).trim() || undefined;
    const rp = sanitizeBool(input.requires_prescription);
    if (rp.value !== undefined)
        out.requires_prescription = rp.value;
    issues.push(...rp.issues);
    const ic = sanitizeBool(input.is_controlled);
    if (ic.value !== undefined)
        out.is_controlled = ic.value;
    issues.push(...ic.issues);
    out.storage_conditions = collapseWS(String((_d = input.storage_conditions) !== null && _d !== void 0 ? _d : "")).trim() || undefined;
    out.description = collapseWS(String((_e = input.description) !== null && _e !== void 0 ? _e : "")).trim() || undefined;
    const hasStock = !!(input.batch_no || input.expiry_date || input.on_hand || input.unit_price || input.reserved);
    const bn = sanitizeBatchNo(input.batch_no);
    const ex = sanitizeExpiry(input.expiry_date);
    const q = sanitizeNumber(input.on_hand, { ge: 0 });
    const pr = sanitizeNumber(input.unit_price, { gt: 0 });
    const rv = sanitizeNumber((_f = input.reserved) !== null && _f !== void 0 ? _f : 0, { ge: 0 });
    if (hasStock) {
        if (!bn.value)
            issues.push({ field: "batch_no", code: "E_STOCK_BATCH_REQUIRED", msg: "batch_no required when stock present", level: "error" });
        if (!ex.value)
            issues.push({ field: "expiry_date", code: "E_STOCK_EXPIRY_REQUIRED", msg: "expiry_date required when stock present", level: "error" });
        if (q.value === undefined)
            issues.push({ field: "on_hand", code: "E_STOCK_QTY_REQUIRED", msg: "on_hand required when stock present", level: "error" });
        if (pr.value === undefined)
            issues.push({ field: "unit_price", code: "E_STOCK_PRICE_REQUIRED", msg: "unit_price required when stock present", level: "error" });
    }
    issues.push(...bn.issues, ...ex.issues, ...q.issues, ...pr.issues, ...rv.issues);
    out.batch_no = bn.value;
    out.expiry_date = ex.value;
    out.on_hand = q.value;
    out.unit_price = pr.value;
    out.reserved = (_g = rv.value) !== null && _g !== void 0 ? _g : 0;
    out.purchase_unit = collapseWS(String((_h = input.purchase_unit) !== null && _h !== void 0 ? _h : "")).trim() || undefined;
    out.pieces_per_unit = collapseWS(String((_j = input.pieces_per_unit) !== null && _j !== void 0 ? _j : "")).trim() || undefined;
    out.unit = collapseWS(String((_k = input.unit) !== null && _k !== void 0 ? _k : "")).trim() || undefined;
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
    if (input.coo !== undefined && hasVal(input.coo)) {
        const cc = sanitizeCountryCode(input.coo);
        if (cc.value !== undefined)
            out.coo = cc.value;
        issues.push(...cc.issues);
    }
    const sku = collapseWS(String((_l = input.sku) !== null && _l !== void 0 ? _l : "")).trim();
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
const parseDateFlexible = (value) => {
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
export function sanitizeCanonicalRow(raw, rowIndex) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6;
    const flat = {
        generic_name: (_a = raw.product) === null || _a === void 0 ? void 0 : _a.generic_name,
        strength: (_b = raw.product) === null || _b === void 0 ? void 0 : _b.strength,
        form: (_c = raw.product) === null || _c === void 0 ? void 0 : _c.form,
        category: (_e = (_d = raw.product) === null || _d === void 0 ? void 0 : _d.category) !== null && _e !== void 0 ? _e : undefined,
        batch_no: (_f = raw.batch) === null || _f === void 0 ? void 0 : _f.batch_no,
        expiry_date: (_g = raw.batch) === null || _g === void 0 ? void 0 : _g.expiry_date,
        on_hand: (_h = raw.batch) === null || _h === void 0 ? void 0 : _h.on_hand,
        unit_price: (_j = raw.batch) === null || _j === void 0 ? void 0 : _j.unit_price,
        cat: (_k = raw.identity) === null || _k === void 0 ? void 0 : _k.cat,
        frm: (_l = raw.identity) === null || _l === void 0 ? void 0 : _l.frm,
        pkg: (_m = raw.identity) === null || _m === void 0 ? void 0 : _m.pkg,
        coo: (_p = (_o = raw.batch) === null || _o === void 0 ? void 0 : _o.coo) !== null && _p !== void 0 ? _p : (_q = raw.identity) === null || _q === void 0 ? void 0 : _q.coo,
        sku: (_r = raw.identity) === null || _r === void 0 ? void 0 : _r.sku,
    };
    const { row, issues } = sanitizeRow(flat);
    const errors = issues.map((i) => mapIssueToParsed(i, rowIndex));
    if (!row)
        return { row: null, errors };
    const hasGeneric = Boolean(row.generic_name && row.generic_name.trim());
    const hasBrand = Boolean(row.brand_name && String(row.brand_name).trim());
    if (!hasGeneric && !hasBrand) {
        return { row: null, errors };
    }
    const expiryIso = parseDateFlexible(row.expiry_date);
    if (expiryIso) {
        if (!isFutureDate(expiryIso)) {
            errors.push({ row: rowIndex, field: "batch.expiry_date", code: "expired", message: "Expiry date must be in the future" });
        }
    }
    else if (row.expiry_date) {
        errors.push({ row: rowIndex, field: "batch.expiry_date", code: "invalid_format", message: "Cannot parse expiry date" });
    }
    // Do not hard-drop on stock/identity errors; apps decide readiness.
    const canonical = {
        product: {
            generic_name: (_s = row.generic_name) !== null && _s !== void 0 ? _s : "",
            brand_name: (_u = ((_t = row.brand_name) !== null && _t !== void 0 ? _t : null)) !== null && _u !== void 0 ? _u : null,
            strength: (_v = row.strength) !== null && _v !== void 0 ? _v : "",
            form: (_w = row.form) !== null && _w !== void 0 ? _w : "",
            category: (_x = row.category) !== null && _x !== void 0 ? _x : null,
        },
        batch: {
            batch_no: (_y = row.batch_no) !== null && _y !== void 0 ? _y : "",
            expiry_date: expiryIso !== null && expiryIso !== void 0 ? expiryIso : "",
            on_hand: (_z = row.on_hand) !== null && _z !== void 0 ? _z : 0,
            unit_price: (_0 = row.unit_price) !== null && _0 !== void 0 ? _0 : null,
            coo: (_1 = row.coo) !== null && _1 !== void 0 ? _1 : null,
        },
    };
    const identityHasValues = Boolean(row.cat || row.frm || row.pkg || row.coo || row.sku);
    if (identityHasValues) {
        canonical.identity = {
            cat: (_2 = row.cat) !== null && _2 !== void 0 ? _2 : null,
            frm: (_3 = row.frm) !== null && _3 !== void 0 ? _3 : null,
            pkg: (_4 = row.pkg) !== null && _4 !== void 0 ? _4 : null,
            coo: (_5 = row.coo) !== null && _5 !== void 0 ? _5 : null,
            sku: (_6 = row.sku) !== null && _6 !== void 0 ? _6 : null,
        };
    }
    return { row: canonical, errors };
}
