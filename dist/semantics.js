const defs = [
    { key: "generic_name", type: "text", synonyms: ["generic", "generic name", "international name", "inn", "active ingredient", "api name", "drug name", "product name"], negative: ["brand"] },
    { key: "brand_name", type: "text", synonyms: ["brand", "brand name", "trade name", "commercial name"], negative: ["generic"] },
    { key: "strength", type: "text", synonyms: ["strength", "dose", "dosage", "concentration", "potency"] },
    { key: "form", type: "text", synonyms: ["dosage form", "form", "formulation", "presentation", "product form", "type"] },
    { key: "category", type: "text", synonyms: ["category", "product category", "therapeutic class", "class", "group"] },
    { key: "expiry_date", type: "date", synonyms: ["expiry", "expiry date", "exp date", "expiration", "use by", "best before"] },
    { key: "batch_no", type: "text", synonyms: ["batch", "batch no", "batch number", "lot", "lot no", "lot number", "batch/lot"] },
    { key: "pack_contents", type: "text", synonyms: ["pack contents", "pack size", "pack", "units per pack", "tablets per strip", "volume per bottle"] },
    { key: "on_hand", type: "number", synonyms: ["quantity", "qty", "stock", "on hand", "available", "item quantity", "count"] },
    { key: "unit_price", type: "number", synonyms: ["unit price", "price", "cost", "buy price", "purchase price", "selling price", "sale price"] },
    { key: "coo", type: "text", synonyms: ["country of manufacture", "country of origin", "origin", "coo", "made in", "manufacturing country", "country"] },
    { key: "sku", type: "text", synonyms: ["serial number", "serial", "s/n", "code", "barcode", "gtin", "ean", "product code", "uid", "serial no"] },
    { key: "manufacturer", type: "text", synonyms: ["manufacturer", "mfr", "company", "company name", "supplier", "producer"] },
    { key: "notes", type: "text", synonyms: ["notes", "comments", "remarks", "description", "details"] },
];
const strongTokens = new Set(["batch", "lot", "expiry", "expiration", "country", "price", "quantity", "qty", "stock", "form", "strength"]);
const secondaryTokens = new Set(["number", "date", "name", "code"]);
const normalize = (s) => s
    .toLowerCase()
    .replace(/[\[\](){}]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokenize = (s) => normalize(s).split(" ").filter(Boolean);
const looksNumber = (values) => {
    let numeric = 0;
    let total = 0;
    for (const v of values) {
        if (v === undefined || v === null || v === "")
            continue;
        total++;
        const s = String(v).trim();
        if (/^[-+]?\d+(?:[.,]\d+)?$/.test(s))
            numeric++;
    }
    return total ? numeric / total >= 0.6 : false;
};
const looksDate = (values) => {
    let datey = 0;
    let total = 0;
    for (const v of values) {
        if (v === undefined || v === null || v === "")
            continue;
        total++;
        const s = String(v).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}[\/-]\d{2}[\/-]\d{2,4}$/.test(s) || /^\d{3,5}$/.test(s))
            datey++;
    }
    return total ? datey / total >= 0.6 : false;
};
const typeCompatible = (values, type) => {
    if (type === "number")
        return looksNumber(values);
    if (type === "date")
        return looksDate(values);
    return true;
};
const scoreHeader = (header, def, sampleValues) => {
    const norm = normalize(header);
    if (def.synonyms.includes(norm))
        return 1.0;
    if (def.negative && def.negative.some((n) => norm.includes(n)))
        return 0.0;
    const hTokens = new Set(tokenize(header));
    let score = 0;
    for (const syn of def.synonyms) {
        for (const t of tokenize(syn)) {
            if (hTokens.has(t)) {
                score += strongTokens.has(t) ? 0.3 : secondaryTokens.has(t) ? 0.1 : 0.05;
            }
        }
    }
    if (!typeCompatible(sampleValues, def.type))
        score -= 0.5;
    return Math.max(0, Math.min(1, score));
};
/**
 * Suggest canonical mappings for headers with confidence scores
 */
export function suggestHeaderMappings(headers, sampleRows) {
    const hints = [];
    for (const h of headers) {
        const values = sampleRows.map((r) => r[h]).slice(0, 20);
        let best = { score: 0 };
        for (const def of defs) {
            const s = scoreHeader(h, def, values);
            if (s > best.score)
                best = { key: def.key, score: s };
        }
        if (best.score >= 0.6) {
            hints.push({ header: h, key: best.key, confidence: best.score });
        }
        else {
            hints.push({ header: h, key: undefined, confidence: best.score });
        }
    }
    return hints;
}
