import { suggestHeaderMappings } from "./semantics.js";
const TEMPLATE_V3_HEADERS = [
    "Generic (International Name)",
    "Strength",
    "Dosage Form",
    "Product Category",
    "Expiry Date",
    "Pack Contents",
    "Batch / Lot Number",
    "Item Quantity",
    "Unit Price",
    "Country of Manufacture",
    "Serial Number",
    "Brand Name",
    "Manufacturer",
    "Notes",
];
const LEGACY_ITEMS_HEADERS = [
    "Id",
    "Name",
    "Description",
    "Image",
    "CategoryId",
    "SubCategoryId",
    "UnitId",
    "Stock",
    "Price",
    "Discount",
    "DiscountType",
    "AvailableTimeStarts",
    "AvailableTimeEnds",
    "Variations",
    "ChoiceOptions",
    "AddOns",
    "Attributes",
    "StoreId",
    "ModuleId",
    "Status",
    "Veg",
    "Recommended",
];
const TEMPLATE_VERSION = "MedWay_Template_v3";
const TEMPLATE_CHECKSUM = "b6ba6708";
const HEADER_SYNONYMS = {
    brand_name: [
        "brand",
        "brand_name",
        "trade_name",
        "commercial_name",
        "product_name",
    ],
    generic_name: [
        "generic",
        "generic_name",
        "generic_international_name",
        "name",
        "drug_name",
        "product_name",
    ],
    strength: ["strength", "dosage", "mg", "concentration", "dose"],
    form: [
        "form",
        "dosage_form",
        "product_form",
        "type",
        "product_type",
        "dose_form",
    ],
    category: [
        "category",
        "product_category",
        "category_name",
        "group",
        "product_group",
    ],
    expiry_date: [
        "expiry_date",
        "expiry",
        "exp_date",
        "expiration",
        "expires",
    ],
    batch_no: [
        "batch_no",
        "batch",
        "batch_number",
        "lot",
        "lot_no",
        "batch_lot_number",
        "batch_lot",
        "lot_number",
    ],
    on_hand: [
        "on_hand",
        "qty",
        "quantity",
        "quantity_in_stock",
        "stock",
        "item_quantity",
    ],
    unit_price: ["unit_price", "price", "selling_price", "unitprice", "cost"],
    coo: [
        "coo",
        "country",
        "country_of_manufacture",
        "manufacturing_country",
        "made_in",
        "country_code",
    ],
    cat: ["cat", "category_code"],
    frm: ["frm", "form_code"],
    pkg: ["pkg", "package", "package_code"],
    sku: ["sku", "item_code"],
};
const FORM_SYNONYMS = {
    tab: "tablet",
    tablet: "tablet",
    tabs: "tablet",
    capsule: "capsule",
    cap: "capsule",
    caps: "capsule",
    syrup: "syrup",
    suspension: "suspension",
    susp: "suspension",
    injection: "injection",
    inj: "injection",
    ointment: "ointment",
    cream: "cream",
    gel: "gel",
    drops: "drops",
    drop: "drops",
    inhaler: "inhaler",
    lotion: "lotion",
    patch: "patch",
    suppository: "suppository",
    powder: "powder",
    solution: "solution",
    sol: "solution",
    granules: "granules",
    granule: "granules",
    spray: "spray",
    ns: "spray",
    "nebulizer solution": "nebulizer solution",
    nebule: "nebulizer solution",
};
const LEGACY_BLOB_FIELDS = ["Name", "Description"];
const tokenSet = (str) => Array.from(new Set(str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean))).sort();
function tokenSetScore(a, b) {
    const A = tokenSet(a);
    const B = tokenSet(b);
    const inter = A.filter((x) => B.includes(x)).length;
    const denom = A.length + B.length;
    return denom ? (2 * inter) / denom : 0;
}
function jaroWinklerSim(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();
    const m = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const aFlags = Array(a.length).fill(false);
    const bFlags = Array(b.length).fill(false);
    let matches = 0;
    for (let i = 0; i < a.length; i++) {
        const start = Math.max(0, i - m);
        const end = Math.min(i + m + 1, b.length);
        for (let j = start; j < end; j++) {
            if (!bFlags[j] && a[i] === b[j]) {
                aFlags[i] = true;
                bFlags[j] = true;
                matches++;
                break;
            }
        }
    }
    if (matches === 0)
        return 0;
    let t = 0;
    let k = 0;
    for (let i = 0; i < a.length; i++) {
        if (aFlags[i]) {
            while (!bFlags[k])
                k++;
            if (a[i] !== b[k])
                t++;
            k++;
        }
    }
    t = t / 2;
    const jaro = (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
    let l = 0;
    for (; l < Math.min(4, a.length, b.length) && a[l] === b[l]; l++)
        ;
    return jaro + l * 0.1 * (1 - jaro);
}
const sanitizeString = (input) => String(input !== null && input !== void 0 ? input : "")
    .replace(/\u00A0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .trim();
const normalizeHeaderKey = (key) => {
    const k = key
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
    for (const canonical of Object.keys(HEADER_SYNONYMS)) {
        const synonyms = HEADER_SYNONYMS[canonical];
        if (synonyms.includes(k))
            return canonical;
    }
    return undefined;
};
const fuzzyHeaderMap = (raw) => {
    const cleaned = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    let best = { score: 0 };
    for (const canon of Object.keys(HEADER_SYNONYMS)) {
        for (const syn of HEADER_SYNONYMS[canon]) {
            const s1 = tokenSetScore(cleaned, syn);
            const s2 = jaroWinklerSim(cleaned, syn);
            const score = Math.max(s1, s2);
            if (score > best.score)
                best = { key: canon, score };
        }
    }
    return best;
};
const fnv1a = (s) => {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h >>> 0) * 0x01000193;
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
};
const headersChecksum = (headers) => fnv1a(headers.join("|").toLowerCase());
const arraysEqualIgnoreOrder = (a, b) => {
    if (a.length !== b.length)
        return false;
    const as = [...a].sort();
    const bs = [...b].sort();
    return as.every((v, idx) => v === bs[idx]);
};
const looksLikeProductCsv = (headers) => {
    const lower = headers.map((h) => h.toLowerCase());
    return (lower.some((h) => h.includes("generic")) ||
        lower.some((h) => h.includes("name")) ||
        lower.some((h) => h.includes("batch")) ||
        lower.some((h) => h.includes("expiry")) ||
        lower.some((h) => h.includes("price")));
};
export function detectSourceSchema(rows, headerMeta) {
    if ((headerMeta === null || headerMeta === void 0 ? void 0 : headerMeta.templateVersion) === TEMPLATE_VERSION &&
        (headerMeta === null || headerMeta === void 0 ? void 0 : headerMeta.headerChecksum) === TEMPLATE_CHECKSUM) {
        return "template_v3";
    }
    const headerRow = rows[0] || {};
    const headerKeys = Object.keys(headerRow);
    if (arraysEqualIgnoreOrder(headerKeys, LEGACY_ITEMS_HEADERS)) {
        return "legacy_items";
    }
    // Template V3 detection based on header checksum
    if (headerKeys.length) {
        const checksum = headersChecksum(headerKeys.map((h) => String(h)));
        if (checksum === TEMPLATE_CHECKSUM) {
            return "template_v3";
        }
    }
    if (looksLikeProductCsv(headerKeys)) {
        return "csv_generic";
    }
    return "unknown";
}
export function mapRawRowToCanonical(raw, excelRowIndex, schema) {
    if (isRowEmpty(raw))
        return null;
    switch (schema) {
        case "template_v3":
            return mapTemplateV3Row(raw);
        case "legacy_items":
            return mapLegacyItemsRow(raw);
        case "csv_generic":
            return mapCsvGenericRow(raw);
        case "unknown":
        default:
            return mapCsvGenericRow(raw);
    }
}
function isRowEmpty(raw) {
    return !Object.values(raw).some((v) => {
        const s = sanitizeString(v);
        return s !== "";
    });
}
function ensureCanonical(flat) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    const product = {
        generic_name: (_a = flat.generic_name) !== null && _a !== void 0 ? _a : "",
        brand_name: (_b = flat.brand_name) !== null && _b !== void 0 ? _b : null,
        strength: (_c = flat.strength) !== null && _c !== void 0 ? _c : "",
        form: (_d = flat.form) !== null && _d !== void 0 ? _d : "",
        category: (_e = flat.category) !== null && _e !== void 0 ? _e : null,
    };
    const batch = {
        batch_no: (_f = flat.batch_no) !== null && _f !== void 0 ? _f : "",
        expiry_date: (_g = flat.expiry_date) !== null && _g !== void 0 ? _g : "",
        on_hand: (_h = flat.on_hand) !== null && _h !== void 0 ? _h : 0,
        unit_price: (_j = flat.unit_price) !== null && _j !== void 0 ? _j : null,
        coo: (_k = flat.coo) !== null && _k !== void 0 ? _k : null,
    };
    const identity = flat.cat || flat.frm || flat.pkg || flat.coo || flat.sku
        ? {
            cat: (_l = flat.cat) !== null && _l !== void 0 ? _l : null,
            frm: (_m = flat.frm) !== null && _m !== void 0 ? _m : null,
            pkg: (_o = flat.pkg) !== null && _o !== void 0 ? _o : null,
            coo: (_p = flat.coo) !== null && _p !== void 0 ? _p : null,
            sku: (_q = flat.sku) !== null && _q !== void 0 ? _q : null,
        }
        : undefined;
    return { product, batch, identity };
}
function mapTemplateV3Row(raw) {
    const get = (k) => sanitizeString(raw[k]);
    const flat = {
        generic_name: get("Generic (International Name)"),
        strength: get("Strength"),
        form: canonicalizeForm(get("Dosage Form")),
        category: get("Product Category") || null,
        expiry_date: get("Expiry Date"),
        batch_no: get("Batch / Lot Number"),
        on_hand: parseNumber(raw["Item Quantity"]),
        unit_price: parseNumber(raw["Unit Price"]),
        coo: get("Country of Manufacture") || null,
        sku: sanitizeString(raw["Serial Number"]) || undefined,
    };
    return ensureCanonical(flat);
}
function mapCsvGenericRow(raw) {
    var _a;
    const flat = {};
    const headers = Object.keys(raw);
    const sampleRows = [raw];
    const hints = suggestHeaderMappings(headers, sampleRows);
    const mapFromHint = (header) => {
        const hint = hints.find((h) => h.header === header && h.key);
        switch (hint === null || hint === void 0 ? void 0 : hint.key) {
            case "generic_name":
                return "generic_name";
            case "brand_name":
                return "brand_name";
            case "strength":
                return "strength";
            case "form":
                return "form";
            case "category":
                return "category";
            case "expiry_date":
                return "expiry_date";
            case "batch_no":
                return "batch_no";
            case "pack_contents":
                return "pkg"; // approximate to package code/pieces
            case "on_hand":
                return "on_hand";
            case "unit_price":
                return "unit_price";
            case "coo":
                return "coo";
            case "sku":
                return "sku";
            case "manufacturer":
                return undefined;
            case "notes":
                return undefined;
            default:
                return undefined;
        }
    };
    const assignField = (key, value) => {
        flat[key] = value;
    };
    for (const [key, value] of Object.entries(raw)) {
        let mapped = (_a = mapFromHint(key)) !== null && _a !== void 0 ? _a : normalizeHeaderKey(key);
        if (!mapped) {
            const best = fuzzyHeaderMap(key);
            if (best.score >= 0.8)
                mapped = best.key;
        }
        if (!mapped)
            continue;
        const val = value;
        switch (mapped) {
            case "on_hand":
            case "unit_price":
                assignField(mapped, parseNumber(val));
                break;
            case "form":
                flat.form = canonicalizeForm(sanitizeString(val));
                break;
            default:
                assignField(mapped, sanitizeString(val));
        }
    }
    return ensureCanonical(flat);
}
function mapLegacyItemsRow(raw) {
    var _a;
    const flat = {};
    const name = sanitizeString(raw["Name"]);
    const desc = sanitizeString(raw["Description"]);
    const combined = [name, desc].filter(Boolean).join(" ");
    const extracted = extractFromBlob(combined);
    flat.generic_name = extracted.generic_name || name || undefined;
    flat.strength = extracted.strength || undefined;
    flat.form = extracted.form || undefined;
    flat.batch_no = extracted.batch_no || undefined;
    flat.expiry_date = extracted.expiry_date || undefined;
    flat.unit_price =
        (_a = parseNumber(raw["Price"])) !== null && _a !== void 0 ? _a : parseNumber(extracted.unit_price);
    flat.on_hand = parseNumber(raw["Stock"]);
    flat.category = sanitizeString(raw["CategoryId"]) || null;
    flat.coo = extracted.coo || null;
    return ensureCanonical(flat);
}
function canonicalizeForm(form) {
    var _a;
    if (!form)
        return undefined;
    const f = sanitizeString(form).toLowerCase();
    return (_a = FORM_SYNONYMS[f]) !== null && _a !== void 0 ? _a : f;
}
function parseNumber(value) {
    if (value === undefined || value === null)
        return undefined;
    let s = sanitizeString(value).replace(/\s/g, "");
    if (!s)
        return undefined;
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
        s = s.replace(/\./g, "").replace(",", ".");
    }
    else {
        s = s.replace(/,/g, "");
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
}
function extractFromBlob(text) {
    const out = {};
    if (!text)
        return out;
    const tokens = tokenizeBlob(text);
    // strength
    const strengthToken = tokens.find((t) => t.type === "RATIO" || t.type === "UNIT");
    if (strengthToken)
        out.strength = strengthToken.value;
    // form
    const formToken = tokens.find((t) => t.type === "FORM");
    if (formToken)
        out.form = canonicalizeForm(formToken.value);
    // expiry
    const expiryToken = tokens.find((t) => t.type === "DATE");
    if (expiryToken)
        out.expiry_date = expiryToken.value;
    // batch / lot
    const batchToken = tokens.find((t) => t.type === "BATCH");
    if (batchToken)
        out.batch_no = batchToken.value;
    // price
    const priceToken = tokens.find((t) => t.type === "PRICE");
    if (priceToken)
        out.unit_price = parseNumber(priceToken.value);
    // generic_name fallback
    const nameToken = tokens.find((t) => t.type === "NAME");
    if (nameToken)
        out.generic_name = nameToken.value;
    // country
    const countryToken = tokens.find((t) => t.type === "COUNTRY");
    if (countryToken)
        out.coo = countryToken.value;
    return out;
}
function tokenizeBlob(input) {
    const s = sanitizeString(input);
    const tokens = [];
    const push = (type, value) => tokens.push({ type, value });
    const ratio = s.match(/\b\d+(?:\.\d+)?\s*(mg|mcg|g|iu|ml)\s*\/\s*\d*(?:\.\d+)?\s*(mg|mcg|g|ml)\b/i);
    if (ratio)
        push("RATIO", ratio[0].replace(/\s+/g, ""));
    const unit = s.match(/\b\d+(?:\.\d+)?\s*(mg|mcg|g|iu|ml|%)\b/i);
    if (unit)
        push("UNIT", unit[0].replace(/\s+/g, ""));
    const date = s.match(/\b\d{4}-\d{2}-\d{2}\b/) ||
        s.match(/\b\d{2}\/\d{2}\/\d{4}\b/) ||
        s.match(/\b\d{2}-\d{2}-\d{2,4}\b/) ||
        s.match(/\b\d{3,5}\b/);
    if (date)
        push("DATE", date[0]);
    const batch = s.match(/\b(?:batch|bn|lot)[\s:#-]*([A-Za-z0-9-]+)\b/i);
    if (batch)
        push("BATCH", batch[1]);
    const price = s.match(/\b\d+(?:[\.,]\d{1,2})?\s*(etb|birr|usd)?\b/i);
    if (price)
        push("PRICE", price[0]);
    const form = s.match(/\b(tablets?|capsules?|syrup|suspension|injection|ointment|cream|gel|drops?|inhaler|lotion|patch|suppository|powder|solution|spray)\b/i);
    if (form)
        push("FORM", form[0]);
    const country = s.match(/\b(ethiopia|india|germany|china|united states|united kingdom|france|italy|spain|kenya|south africa)\b/i);
    if (country)
        push("COUNTRY", capitalizeWords(country[0]));
    const name = s.match(/^[A-Za-z][A-Za-z0-9\s-]{3,}/);
    if (name)
        push("NAME", name[0]);
    return tokens;
}
function capitalizeWords(v) {
    return v.replace(/\b\w/g, (c) => c.toUpperCase());
}
