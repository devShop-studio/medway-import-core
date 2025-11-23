/**
 * Module: Header Semantics & Mapping
 * Purpose: Provide synonyms, type compatibility, and scoring to map raw headers
 * to canonical keys with confidence for generic CSVs and headerless detection.
 * Signed: EyosiyasJ
 */
export type CanonicalKey =
  | "generic_name"
  | "brand_name"
  | "strength"
  | "form"
  | "category"
  | "expiry_date"
  | "batch_no"
  | "pack_contents"
  | "on_hand"
  | "unit_price"
  | "coo"
  | "sku"
  | "manufacturer"
  | "notes"
  | "requires_prescription"
  | "is_controlled"
  | "storage_conditions"
  | "purchase_unit"
  | "pieces_per_unit"
  | "unit"
  | "reserved"
  | "product_type";

interface CanonicalDef {
  key: CanonicalKey;
  type: "text" | "number" | "date";
  synonyms: string[];
  negative?: string[];
}

const defs: CanonicalDef[] = [
  { key: "generic_name", type: "text", synonyms: ["generic", "generic name", "international name", "inn", "active ingredient", "api name", "drug name", "product name", "generic international name"], negative: ["brand"] },
  { key: "brand_name", type: "text", synonyms: ["brand", "brand name", "trade name", "commercial name"], negative: ["generic"] },
  { key: "strength", type: "text", synonyms: ["strength", "dose", "dosage", "concentration", "potency"] },
  { key: "form", type: "text", synonyms: ["dosage form", "form", "formulation", "presentation", "product form", "type"] },
  { key: "category", type: "text", synonyms: ["category", "product category", "therapeutic class", "class", "group"] },
  { key: "expiry_date", type: "date", synonyms: ["expiry", "expiry date", "exp date", "expiration", "use by", "best before"] },
  { key: "batch_no", type: "text", synonyms: ["batch", "batch no", "batch number", "lot", "lot no", "lot number", "batch/lot", "batch lot number"] },
  { key: "pack_contents", type: "text", synonyms: ["pack contents", "pack size", "pack", "units per pack", "tablets per strip", "volume per bottle"] },
  { key: "on_hand", type: "number", synonyms: ["quantity", "qty", "stock", "on hand", "available", "item quantity", "count"] },
  { key: "unit_price", type: "number", synonyms: ["unit price", "price", "cost", "buy price", "purchase price", "selling price", "sale price"] },
  { key: "coo", type: "text", synonyms: ["country of manufacture", "country of origin", "origin", "coo", "made in", "manufacturing country", "country"] },
  { key: "sku", type: "text", synonyms: ["serial number", "serial", "s/n", "code", "barcode", "gtin", "ean", "product code", "uid", "serial no"] },
  { key: "manufacturer", type: "text", synonyms: ["manufacturer", "mfr", "company", "company name", "supplier", "producer"] },
  { key: "notes", type: "text", synonyms: ["notes", "comments", "remarks", "description", "details"] },
  { key: "requires_prescription", type: "text", synonyms: ["requires prescription", "prescription", "rx", "needs prescription" ] },
  { key: "is_controlled", type: "text", synonyms: ["controlled", "is controlled", "controlled substance", "cs"] },
  { key: "storage_conditions", type: "text", synonyms: ["storage conditions", "storage", "store", "keep", "handling"] },
  { key: "purchase_unit", type: "text", synonyms: ["purchase unit", "buy unit", "pack", "box", "carton"] },
  { key: "pieces_per_unit", type: "number", synonyms: ["pieces per unit", "pieces", "units per pack", "units per box"] },
  { key: "unit", type: "text", synonyms: ["unit", "measure", "uom", "unit of measure"] },
  { key: "reserved", type: "number", synonyms: ["reserved", "hold", "on reserve"] },
  { key: "product_type", type: "text", synonyms: ["product type", "product_type" ] },
];

const strongTokens = new Set(["batch", "lot", "expiry", "expiration", "country", "price", "quantity", "qty", "stock", "form", "strength"]);
const secondaryTokens = new Set(["number", "date", "name", "code"]);

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\[\](){}]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (s: string): string[] => normalize(s).split(" ").filter(Boolean);

const looksNumber = (values: unknown[]): boolean => {
  let numeric = 0;
  let total = 0;
  for (const v of values) {
    if (v === undefined || v === null || v === "") continue;
    total++;
    const s = String(v).trim();
    if (/^[-+]?\d+(?:[.,]\d+)?$/.test(s)) numeric++;
  }
  return total ? numeric / total >= 0.6 : false;
};

const looksDate = (values: unknown[]): boolean => {
  let datey = 0;
  let total = 0;
  for (const v of values) {
    if (v === undefined || v === null || v === "") continue;
    total++;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}[\/-]\d{2}[\/-]\d{2,4}$/.test(s) || /^\d{3,5}$/.test(s)) datey++;
  }
  return total ? datey / total >= 0.6 : false;
};

const typeCompatible = (values: unknown[], type: CanonicalDef["type"]): boolean => {
  if (type === "number") return looksNumber(values);
  if (type === "date") return looksDate(values);
  return true;
};

const scoreHeader = (header: string, def: CanonicalDef, sampleValues: unknown[]): number => {
  const norm = normalize(header);
  if (def.synonyms.includes(norm)) return 1.0;
  if (def.negative && def.negative.some((n) => norm.includes(n))) return 0.0;
  const hTokens = new Set(tokenize(header));
  let score = 0;
  for (const syn of def.synonyms) {
    for (const t of tokenize(syn)) {
      if (hTokens.has(t)) {
        score += strongTokens.has(t) ? 0.3 : secondaryTokens.has(t) ? 0.1 : 0.05;
      }
    }
  }
  if (!typeCompatible(sampleValues, def.type)) score -= 0.5;
  return Math.max(0, Math.min(1, score));
};

export interface HeaderMappingHint {
  header: string;
  key?: CanonicalKey;
  confidence: number;
}

/**
 * Suggest canonical mappings for headers with confidence scores.
 *
 * Parameters:
 * - `headers`: raw header labels from the file.
 * - `sampleRows`: small sample of row objects to evaluate type compatibility.
 *
 * Returns: `HeaderMappingHint[]` with `{ header, key?, confidence }` used by detection
 * and debugging in CLI/UI. Confidence combines token overlap and value-type checks.
 * Signed: EyosiyasJ
 */
export function suggestHeaderMappings(headers: string[], sampleRows: Array<Record<string, unknown>>): HeaderMappingHint[] {
  const hints: HeaderMappingHint[] = [];
  for (const h of headers) {
    const values = sampleRows.map((r) => r[h]).slice(0, 20);
    let best: { key?: CanonicalKey; score: number } = { score: 0 };
    for (const def of defs) {
      const s = scoreHeader(h, def, values);
      if (s > best.score) best = { key: def.key, score: s };
    }
    if (best.score >= 0.6) {
      hints.push({ header: h, key: best.key, confidence: best.score });
    } else {
      hints.push({ header: h, key: undefined, confidence: best.score });
    }
  }
  return hints;
}
