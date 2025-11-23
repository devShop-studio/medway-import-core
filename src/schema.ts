import { RawRow } from "./csv.js";
import { UMBRELLA_CATEGORY_RULES } from "./category.js";
import { CanonicalProduct, SourceSchema } from "./types.js";
import { suggestHeaderMappings } from "./semantics.js";
import { decomposeConcatenatedCell } from "./concatDecompose.js";

const TEMPLATE_V3_HEADERS = [
  "Generic (International Name)",
  "Product Type",
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
const TEMPLATE_CHECKSUM = "f9802bc8";

type CanonicalFlat = {
  generic_name?: string;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  strength?: string;
  form?: string;
  category?: string | null;
  batch_no?: string;
  expiry_date?: string;
  on_hand?: number;
  unit_price?: number;
  coo?: string | null;
  cat?: string | null;
  frm?: string | null;
  pkg?: string | null;
  sku?: string | null;
  requires_prescription?: string | boolean | null;
  is_controlled?: string | boolean | null;
  storage_conditions?: string | null;
  description?: string | null;
  purchase_unit?: string | null;
  pieces_per_unit?: number | string | null;
  unit?: string | null;
  product_type?: string | null;
};

const HEADER_SYNONYMS: Record<keyof CanonicalFlat, string[]> = {
  brand_name: [
    "brand",
    "brand_name",
    "trade_name",
    "commercial_name",
    "product_name",
  ],
  manufacturer_name: [
    "manufacturer",
    "manufacturer_name",
    "mfr",
    "company",
    "supplier",
    "producer",
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
  requires_prescription: ["requires_prescription", "prescription", "rx", "needs_prescription"],
  is_controlled: ["is_controlled", "controlled", "controlled_substance", "cs"],
  storage_conditions: ["storage_conditions", "storage", "store", "handling"],
  description: ["description", "notes", "remarks"],
  purchase_unit: ["purchase_unit", "pack", "box", "carton"],
  pieces_per_unit: ["pieces_per_unit", "pieces", "units_per_pack", "units_per_box"],
  unit: ["unit", "uom", "unit_of_measure"],
  product_type: ["product_type"],
};

const FORM_SYNONYMS: Record<string, string> = {
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

const tokenSet = (str: string): string[] =>
  Array.from(
    new Set(
      str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
    )
  ).sort();

function tokenSetScore(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  const inter = A.filter((x) => B.includes(x)).length;
  const denom = A.length + B.length;
  return denom ? (2 * inter) / denom : 0;
}

function jaroWinklerSim(a: string, b: string): number {
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
  if (matches === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (aFlags[i]) {
      while (!bFlags[k]) k++;
      if (a[i] !== b[k]) t++;
      k++;
    }
  }
  t = t / 2;
  const jaro =
    (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
  let l = 0;
  for (; l < Math.min(4, a.length, b.length) && a[l] === b[l]; l++);
  return jaro + l * 0.1 * (1 - jaro);
}

const sanitizeString = (input: unknown): string =>
  String(input ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .trim();

const normalizeHeaderKey = (key: string): keyof CanonicalFlat | undefined => {
  const k = key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  for (const canonical of Object.keys(HEADER_SYNONYMS) as Array<
    keyof CanonicalFlat
  >) {
    const synonyms = HEADER_SYNONYMS[canonical];
    if (synonyms.includes(k)) return canonical;
  }
  return undefined;
};

const fuzzyHeaderMap = (
  raw: string
): { key?: keyof CanonicalFlat; score: number } => {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let best: { key?: keyof CanonicalFlat; score: number } = { score: 0 };
  for (const canon of Object.keys(HEADER_SYNONYMS) as Array<
    keyof CanonicalFlat
  >) {
    for (const syn of HEADER_SYNONYMS[canon]) {
      const s1 = tokenSetScore(cleaned, syn);
      const s2 = jaroWinklerSim(cleaned, syn);
      const score = Math.max(s1, s2);
      if (score > best.score) best = { key: canon, score };
    }
  }
  return best;
};

const fnv1a = (s: string): string => {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h >>> 0) * 0x01000193;
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
};

const headersChecksum = (headers: string[]): string =>
  fnv1a(headers.join("|").toLowerCase());

const arraysEqualIgnoreOrder = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, idx) => v === bs[idx]);
};

const looksLikeProductCsv = (headers: string[]): boolean => {
  const lower = headers.map((h) => h.toLowerCase());
  return (
    lower.some((h) => h.includes("generic")) ||
    lower.some((h) => h.includes("name")) ||
    lower.some((h) => h.includes("batch")) ||
    lower.some((h) => h.includes("expiry")) ||
    lower.some((h) => h.includes("price"))
  );
};

/**
 * Detect input schema from headers and optional template metadata.
 * Returns one of:
 * - `template_v3`: official MedWay Excel template (checksum or exact headers)
 * - `concat_items`: Items.xlsx style with concatenated fields (alias: legacy_items)
 * - `csv_generic`: generic CSV with fuzzy header mapping
 * - `unknown`: unrecognized shape
 * Signed: EyosiyasJ
 */
export function detectSourceSchema(
  rows: RawRow[],
  headerMeta?: { templateVersion?: string; headerChecksum?: string },
  origin?: "workbook" | "text"
): SourceSchema {
  if (
    headerMeta?.templateVersion === TEMPLATE_VERSION &&
    headerMeta?.headerChecksum === TEMPLATE_CHECKSUM
  ) {
    return "template_v3";
  }

  const headerRow = rows[0] || {};
  const headerKeys = Object.keys(headerRow);
  if (headerKeys.length && headerKeys.every((k) => /^col_\d+$/.test(k))) {
    return origin === "workbook" ? "unknown" : "csv_generic";
  }

  if (arraysEqualIgnoreOrder(headerKeys, LEGACY_ITEMS_HEADERS)) {
    return "concat_items";
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

/**
 * Map a single raw row to a partial `CanonicalProduct` based on detected schema.
 * Supports headerless assignments for CSV when provided.
 * Drops fully empty rows.
 * Signed: EyosiyasJ
 */
export function mapRawRowToCanonical(
  raw: RawRow,
  excelRowIndex: number,
  schema: SourceSchema,
  headerlessAssign?: Record<string, keyof CanonicalFlat>
): Partial<CanonicalProduct> | null {
  if (isRowEmpty(raw)) return null;
  switch (schema) {
    case "template_v3":
      return mapTemplateV3Row(raw);
    case "concat_items":
      return mapConcatItemsRow(raw);
    case "legacy_items":
      return mapConcatItemsRow(raw);
    case "csv_generic":
      if (headerlessAssign) return mapCsvHeaderlessRow(raw, headerlessAssign);
      return mapCsvGenericRow(raw);
    case "unknown":
    default:
      if (headerlessAssign) return mapCsvHeaderlessRow(raw, headerlessAssign);
      return mapCsvGenericRow(raw);
  }
}

function isRowEmpty(raw: RawRow): boolean {
  return !Object.values(raw).some((v) => {
    const s = sanitizeString(v);
    return s !== "";
  });
}

/**
 * Build a partial `CanonicalProduct` from a flat, loosely-typed mapping.
 * Ensures `product` and `batch` containers exist and moves pack contents to `pkg.pieces_per_unit`.
 * Signed: EyosiyasJ
 */
function ensureCanonical(flat: CanonicalFlat): Partial<CanonicalProduct> {
  const product: CanonicalProduct["product"] = {
    generic_name: flat.generic_name ?? "",
    brand_name: flat.brand_name ?? null,
    manufacturer_name: flat.manufacturer_name ?? null,
    strength: flat.strength ?? "",
    form: flat.form ?? "",
    category: flat.category ?? null,
    requires_prescription: (flat.requires_prescription as any) ?? null,
    is_controlled: (flat.is_controlled as any) ?? null,
    storage_conditions: flat.storage_conditions ?? null,
    description: flat.description ?? null,
  };
  const batch: CanonicalProduct["batch"] = {
    batch_no: flat.batch_no ?? "",
    expiry_date: flat.expiry_date ?? "",
    on_hand: flat.on_hand ?? 0,
    unit_price: flat.unit_price ?? null,
    coo: flat.coo ?? null,
  };
  const identity =
    flat.cat ||
    flat.frm ||
    flat.pkg ||
    flat.coo ||
    flat.sku ||
    flat.purchase_unit ||
    flat.unit ||
    flat.product_type
      ? {
          cat: flat.cat ?? null,
          frm: flat.frm ?? null,
          pkg: flat.pkg ?? null,
          coo: flat.coo ?? null,
          sku: flat.sku ?? null,
          purchase_unit: flat.purchase_unit ?? null,
          unit: flat.unit ?? null,
          product_type: flat.product_type ?? null,
        }
      : undefined;
  const pkg =
    typeof flat.pieces_per_unit === "number"
      ? { pieces_per_unit: flat.pieces_per_unit }
      : undefined;
  return { product, batch, identity, pkg };
}

function mapTemplateV3Row(raw: RawRow): Partial<CanonicalProduct> {
  const get = (k: string) => sanitizeString(raw[k]);
  const flat: CanonicalFlat = {
    generic_name: get("Generic (International Name)"),
    product_type: (get("Product Type") || "").toLowerCase() || null,
    strength: get("Strength"),
    form: canonicalizeForm(get("Dosage Form")),
    category: get("Product Category") || null,
    expiry_date: get("Expiry Date"),
    batch_no: get("Batch / Lot Number"),
    on_hand: parseNumber(raw["Item Quantity"]),
    unit_price: parseNumber(raw["Unit Price"]),
    coo: get("Country of Manufacture") || null,
    sku: sanitizeString(raw["Serial Number"]) || undefined,
    brand_name: get("Brand Name") || null,
    manufacturer_name: get("Manufacturer") || null,
    description: get("Notes") || null,
    pieces_per_unit: parseNumber(raw["Pack Contents"]),
  };
  return ensureCanonical(flat);
}

function mapCsvGenericRow(raw: RawRow): Partial<CanonicalProduct> {
  const flat: CanonicalFlat = {};
  const headers = Object.keys(raw);
  const sampleRows: RawRow[] = [raw];
  const hints = suggestHeaderMappings(headers, sampleRows);
  const mapFromHint = (header: string): keyof CanonicalFlat | undefined => {
    const hint = hints.find((h) => h.header === header && h.key);
    switch (hint?.key) {
      case "generic_name":
        return "generic_name";
      case "brand_name":
        return "brand_name";
      case "manufacturer":
        return "manufacturer_name";
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
        return "pieces_per_unit";
      case "on_hand":
        return "on_hand";
      case "unit_price":
        return "unit_price";
      case "coo":
        return "coo";
      case "sku":
        return "sku";
      case "requires_prescription":
        return "requires_prescription";
      case "is_controlled":
        return "is_controlled";
      case "storage_conditions":
        return "storage_conditions";
      case "notes":
        return "description";
      case "purchase_unit":
        return "purchase_unit";
      case "pieces_per_unit":
        return "pieces_per_unit";
      case "unit":
        return "unit";
      case "product_type":
        return "product_type";
      default:
        return undefined;
    }
  };

  const assignField = <K extends keyof CanonicalFlat>(key: K, value: CanonicalFlat[K]) => {
    flat[key] = value;
  };

  for (const [key, value] of Object.entries(raw)) {
    let mapped: keyof CanonicalFlat | undefined = mapFromHint(key) ?? normalizeHeaderKey(key);
    if (!mapped) {
      const best = fuzzyHeaderMap(key);
      if (best.score >= 0.8) mapped = best.key;
    }
    if (!mapped) continue;
    const val = value;
    switch (mapped) {
      case "on_hand":
      case "unit_price":
        assignField(mapped, parseNumber(val));
        break;
      case "pieces_per_unit":
        assignField(mapped, parseNumber(val));
        break;
      case "form":
        flat.form = canonicalizeForm(sanitizeString(val));
        break;
      case "product_type":
        assignField(mapped, sanitizeString(val).toLowerCase());
        break;
      default:
        assignField(mapped, sanitizeString(val));
    }
  }
  return ensureCanonical(flat);
}

function mapCsvHeaderlessRow(raw: RawRow, assign: Record<string, keyof CanonicalFlat>): Partial<CanonicalProduct> {
  const flat: CanonicalFlat = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = assign[key];
    if (!mapped) continue;
    switch (mapped) {
      case "on_hand":
      case "unit_price":
      case "pieces_per_unit":
        flat[mapped] = parseNumber(value) as any;
        break;
      case "form":
        flat.form = canonicalizeForm(String(value ?? "")) as any;
        break;
      default:
        (flat as any)[mapped] = value as any;
    }
  }
  return ensureCanonical(flat);
}

/**
 * Infer headerless column assignments to canonical fields using value-shape heuristics.
 * Includes packaging: classify small integer columns as `pieces_per_unit`.
 * Signed: EyosiyasJ
 */
export function inferHeaderlessAssignments(rows: RawRow[]): Record<string, keyof CanonicalFlat> {
  const keys = Object.keys(rows[0] || {});
  const colValues: Record<string, any[]> = {};
  for (const k of keys) colValues[k] = [];
  const sampleLimit = Math.min(rows.length, 100);
  for (let i = 0; i < sampleLimit; i++) {
    const r = rows[i];
    for (const k of keys) {
      const v = r[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") colValues[k].push(v);
    }
  }
  const score: Record<string, Partial<Record<keyof CanonicalFlat, number>>> = {};
  const isInt = (s: any) => /^[-+]?\d+$/.test(String(s).trim());
  const isFloat = (s: any) => /^[-+]?\d+([.,]\d+)$/.test(String(s).trim());
  const isDate = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()) || /^\d{2}[\/-]\d{2}[\/-]\d{2,4}$/.test(String(s).trim()) || /^\d{3,5}$/.test(String(s).trim());
  const isStrength = (s: any) => /\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|ml))?\b/i.test(String(s));
  const isForm = (s: any) => {
    const f = String(s).toLowerCase().trim();
    return Boolean(FORM_SYNONYMS[f] || ["tablet","tab","capsule","cap","syrup","cream","ointment","inj","injection","solution"].includes(f));
  };
  const isCountry = (s: any) => {
    const v = String(s).trim();
    return /^[A-Z]{2}$/.test(v) || /\b(ethiopia|india|germany|china|united states|united kingdom|france|italy|spain|kenya|south africa)\b/i.test(v);
  };
  const CATEGORY_KEYWORDS = new Set<string>(UMBRELLA_CATEGORY_RULES.flatMap((r) => r.categoryKeywords.map((k) => k.toLowerCase())));
  const isCategoryTerm = (s: any) => {
    const v = String(s).toLowerCase().trim();
    if (!v) return false;
    for (const k of CATEGORY_KEYWORDS) { if (v.includes(k)) return true; }
    return false;
  };
  const avgLen = (arr: any[]) => arr.length ? arr.reduce((a,b)=>a+String(b).length,0)/arr.length : 0;
  const uniqRatio = (arr: any[]) => arr.length ? (new Set(arr.map((x)=>String(x)))).size/arr.length : 0;

  for (const k of keys) {
    const vals = colValues[k];
    const n = vals.length || 1;
    const digitsOnly = (s: any) => String(s).trim().replace(/\D+/g, "");
    const isGtin13 = (s: any) => /^\d{13}$/.test(digitsOnly(s));
    const pGtin13 = vals.filter(isGtin13).length / n;
    const hasAlpha = (s: any) => /[A-Za-z]/.test(String(s));
    const pAlpha = vals.filter(hasAlpha).length / n;
    const pInt = vals.filter(isInt).length / n;
    const pFloat = vals.filter(isFloat).length / n;
    const pNum = vals.filter((v) => isInt(v) || isFloat(v)).length / n;
    const pDate = vals.filter(isDate).length / n;
    const pStrength = vals.filter(isStrength).length / n;
    const pForm = vals.filter(isForm).length / n;
    const pCountry = vals.filter(isCountry).length / n;
    const len = avgLen(vals);
    const uniq = uniqRatio(vals);
    const intVals = vals
      .map((v) => Number(String(v).replace(/,/g, "").trim()))
      .filter((x) => Number.isFinite(x) && Math.floor(x) === x);
    const minInt = intVals.length ? Math.min(...intVals) : Infinity;
    const maxInt = intVals.length ? Math.max(...intVals) : -Infinity;
    score[k] = {};
    score[k]["sku"] = pGtin13 >= 0.9 ? 0.98 : pGtin13 >= 0.6 ? 0.7 : 0.0;
    score[k]["on_hand"] = pGtin13 >= 0.9 ? 0.0 : (pInt >= 0.9 && len <= 6 ? 0.9 + Math.max(0, 0.1 - pFloat) : pInt >= 0.7 ? 0.6 : 0.0);
    score[k]["unit_price"] = pNum >= 0.9 && pFloat >= 0.5 ? 0.9 : pFloat >= 0.3 ? 0.6 : 0.0;
    score[k]["expiry_date"] = pDate >= 0.8 ? 0.95 : pDate >= 0.5 ? 0.7 : 0.0;
    score[k]["batch_no"] = pNum < 0.4 && len >= 4 && len <= 20 && uniq >= 0.5 ? 0.8 : 0.0;
    score[k]["strength"] = pStrength >= 0.5 ? 0.9 : 0.0;
    score[k]["form"] = pForm >= 0.5 ? 0.9 : 0.0;
    score[k]["coo"] = pCountry >= 0.5 ? 0.9 : 0.0;
    const pCat = vals.filter(isCategoryTerm).length / n;
    score[k]["category"] = pCat >= 0.6 ? 0.9 : pCat >= 0.3 ? 0.6 : 0.0;
    score[k]["generic_name"] = (pAlpha >= 0.2) && (len >= 6 && uniq >= 0.7) ? 0.85 : (pAlpha >= 0.2 && len >= 10 ? 0.7 : 0.0);
    score[k]["pieces_per_unit"] =
      pInt >= 0.9 && pFloat < 0.1 && minInt >= 1 && maxInt <= 500 && uniq <= 0.5
        ? 0.9
        : pInt >= 0.8 && maxInt <= 200
        ? 0.7
        : 0.0;
    const PURCHASE_UNITS = new Set(["box","bottle","strip","vial","ampoule","device"]);
    const isPurchaseUnit = (s: any) => PURCHASE_UNITS.has(String(s).toLowerCase().trim());
    const pPU = vals.filter(isPurchaseUnit).length / n;
    score[k]["purchase_unit"] = pPU >= 0.95 ? 0.95 : pPU >= 0.7 ? 0.7 : 0.0;
    const isRxOtc = (s: any) => /^(rx|otc)$/i.test(String(s).trim());
    const pRxOtc = vals.filter(isRxOtc).length / n;
    score[k]["requires_prescription"] = pRxOtc >= 0.95 ? 0.95 : pRxOtc >= 0.7 ? 0.7 : 0.0;
  }

  // Choose best per canonical, prefer one-to-one
  const assignment: Record<string, keyof CanonicalFlat> = {};
  const takenCanon = new Set<keyof CanonicalFlat>();
  const candidates: Array<{ col: string; canon: keyof CanonicalFlat; sc: number }> = [];
  for (const k of keys) {
    const s = score[k]!;
    for (const canon of Object.keys(s) as Array<keyof CanonicalFlat>) {
      const sc = (s as any)[canon] ?? 0;
      if (sc >= 0.6) candidates.push({ col: k, canon, sc });
    }
  }
  candidates.sort((a,b)=>b.sc - a.sc);
  for (const c of candidates) {
    if (assignment[c.col]) continue;
    if (takenCanon.has(c.canon)) continue;
    assignment[c.col] = c.canon;
    takenCanon.add(c.canon);
  }
  return assignment;
}

/**
 * Produce column guesses with candidates and confidence for headerless files.
 * Includes packaging guess for `pieces_per_unit`.
 * Signed: EyosiyasJ
 */
export function inferHeaderlessGuesses(rows: RawRow[]): {
  assignment: Record<string, keyof CanonicalFlat>;
  guesses: Array<{ key: string; index: number; candidates: Array<{ canon: keyof CanonicalFlat; score: number }>; sample: string[] }>;
} {
  const keys = Object.keys(rows[0] || {});
  const colValues: Record<string, any[]> = {};
  for (const k of keys) colValues[k] = [];
  const sampleLimit = Math.min(rows.length, 100);
  for (let i = 0; i < sampleLimit; i++) {
    const r = rows[i];
    for (const k of keys) {
      const v = r[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") colValues[k].push(v);
    }
  }
  const score: Record<string, Partial<Record<keyof CanonicalFlat, number>>> = {};
  const isInt = (s: any) => /^[-+]?\d+$/.test(String(s).trim());
  const isFloat = (s: any) => /^[-+]?\d+([.,]\d+)$/.test(String(s).trim());
  const isNum = (s: any) => /^[-+]?\d+(?:[.,]\d+)?$/.test(String(s).trim());
  const isDate = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()) || /^\d{2}[\/-]\d{2}[\/-]\d{2,4}$/.test(String(s).trim()) || /^\d{3,5}$/.test(String(s).trim());
  const isStrength = (s: any) => /\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml|%)(?:\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|ml))?\b/i.test(String(s));
  const isForm = (s: any) => {
    const f = String(s).toLowerCase().trim();
    return Boolean(FORM_SYNONYMS[f] || ["tablet","tab","capsule","cap","syrup","cream","ointment","inj","injection","solution"].includes(f));
  };
  const isCountry = (s: any) => {
    const v = String(s).trim();
    return /^[A-Z]{2}$/.test(v) || /\b(ethiopia|india|germany|china|united states|united kingdom|france|italy|spain|kenya|south africa)\b/i.test(v);
  };
  const CATEGORY_KEYWORDS = new Set<string>(UMBRELLA_CATEGORY_RULES.flatMap((r) => r.categoryKeywords.map((k) => k.toLowerCase())));
  const isCategoryTerm = (s: any) => {
    const v = String(s).toLowerCase().trim();
    if (!v) return false;
    for (const k of CATEGORY_KEYWORDS) { if (v.includes(k)) return true; }
    return false;
  };
  const avgLen = (arr: any[]) => arr.length ? arr.reduce((a,b)=>a+String(b).length,0)/arr.length : 0;
  const uniqRatio = (arr: any[]) => arr.length ? (new Set(arr.map((x)=>String(x)))).size/arr.length : 0;

  for (const k of keys) {
    const vals = colValues[k];
    const n = vals.length || 1;
    const digitsOnly = (s: any) => String(s).trim().replace(/\D+/g, "");
    const isGtin13 = (s: any) => /^\d{13}$/.test(digitsOnly(s));
    const pGtin13 = vals.filter(isGtin13).length / n;
    const hasAlpha = (s: any) => /[A-Za-z]/.test(String(s));
    const pAlpha = vals.filter(hasAlpha).length / n;
    const pInt = vals.filter(isInt).length / n;
    const pFloat = vals.filter(isFloat).length / n;
    const pNum = vals.filter(isNum).length / n;
    const pDate = vals.filter(isDate).length / n;
    const pStrength = vals.filter(isStrength).length / n;
    const pForm = vals.filter(isForm).length / n;
    const pCountry = vals.filter(isCountry).length / n;
    const len = avgLen(vals);
    const uniq = uniqRatio(vals);
    const intVals = vals
      .map((v) => Number(String(v).replace(/,/g, "").trim()))
      .filter((x) => Number.isFinite(x) && Math.floor(x) === x);
    const minInt = intVals.length ? Math.min(...intVals) : Infinity;
    const maxInt = intVals.length ? Math.max(...intVals) : -Infinity;
    score[k] = {};
    score[k]["sku"] = pGtin13 >= 0.9 ? 0.98 : pGtin13 >= 0.6 ? 0.7 : 0.0;
    score[k]["on_hand"] = pGtin13 >= 0.9 ? 0.0 : (pInt >= 0.9 && len <= 6 ? 0.9 + Math.max(0, 0.1 - pFloat) : pInt >= 0.7 ? 0.6 : 0.0);
    score[k]["unit_price"] = pNum >= 0.9 && pFloat >= 0.5 ? 0.9 : pFloat >= 0.3 ? 0.6 : 0.0;
    score[k]["expiry_date"] = pDate >= 0.8 ? 0.95 : pDate >= 0.5 ? 0.7 : 0.0;
    score[k]["batch_no"] = pNum < 0.4 && len >= 4 && len <= 20 && uniq >= 0.5 ? 0.8 : 0.0;
    score[k]["strength"] = pStrength >= 0.5 ? 0.9 : 0.0;
    score[k]["form"] = pForm >= 0.5 ? 0.9 : 0.0;
    score[k]["coo"] = pCountry >= 0.5 ? 0.9 : 0.0;
    const pCat = vals.filter(isCategoryTerm).length / n;
    score[k]["category"] = pCat >= 0.6 ? 0.9 : pCat >= 0.3 ? 0.6 : 0.0;
    score[k]["generic_name"] = (pAlpha >= 0.2) && (len >= 6 && uniq >= 0.7) ? 0.85 : (pAlpha >= 0.2 && len >= 10 ? 0.7 : 0.0);
    score[k]["pieces_per_unit"] =
      pInt >= 0.9 && pFloat < 0.1 && minInt >= 1 && maxInt <= 500 && uniq <= 0.5
        ? 0.9
        : pInt >= 0.8 && maxInt <= 200
        ? 0.7
        : 0.0;
    const PURCHASE_UNITS = new Set(["box","bottle","strip","vial","ampoule","device"]);
    const isPurchaseUnit = (s: any) => PURCHASE_UNITS.has(String(s).toLowerCase().trim());
    const pPU = vals.filter(isPurchaseUnit).length / n;
    score[k]["purchase_unit"] = pPU >= 0.95 ? 0.95 : pPU >= 0.7 ? 0.7 : 0.0;
    const isRxOtc = (s: any) => /^(rx|otc)$/i.test(String(s).trim());
    const pRxOtc = vals.filter(isRxOtc).length / n;
    score[k]["requires_prescription"] = pRxOtc >= 0.95 ? 0.95 : pRxOtc >= 0.7 ? 0.7 : 0.0;
  }

  const assignment: Record<string, keyof CanonicalFlat> = {};
  const takenCanon = new Set<keyof CanonicalFlat>();
  const candidatesList: Array<{ key: string; index: number; candidates: Array<{ canon: keyof CanonicalFlat; score: number }>; sample: string[] }> = [];
  for (const k of keys) {
    const s = score[k]!;
    const cands = Object.keys(s).map((canon) => ({ canon: canon as keyof CanonicalFlat, score: (s as any)[canon] ?? 0 }))
      .filter((c) => c.score > 0)
      .sort((a,b)=>b.score - a.score);
    const idx = /^col_(\d+)$/.exec(k)?.[1];
    candidatesList.push({ key: k, index: idx ? Number(idx) - 1 : keys.indexOf(k), candidates: cands, sample: colValues[k].slice(0, 3).map((v)=>String(v)) });
  }
  const flatCands: Array<{ col: string; canon: keyof CanonicalFlat; sc: number }> = [];
  for (const cg of candidatesList) {
    for (const c of cg.candidates) {
      if (c.score >= 0.6) flatCands.push({ col: cg.key, canon: c.canon, sc: c.score });
    }
  }
  flatCands.sort((a,b)=>b.sc - a.sc);
  for (const c of flatCands) {
    if (assignment[c.col]) continue;
    if (takenCanon.has(c.canon)) continue;
    assignment[c.col] = c.canon;
    takenCanon.add(c.canon);
  }
  return { assignment, guesses: candidatesList };
}

/**
 * Detect columns that likely contain concatenated fields (name + strength + form).
 * Heuristic: ≥70% of sampled values contain both a strength pattern and a form keyword.
 * Signed: EyosiyasJ
 */
/**
 * Decide if a header is trusted based on semantic scoring across sample rows.
 * Uses a stricter threshold so weak labels (e.g. "Name") are treated as headerless.
 * Signed: EyosiyasJ
 */
function isHeaderTrusted(headers: string[], sampleRows: RawRow[], header: string, threshold = 0.8): { trusted: boolean; key?: keyof CanonicalFlat; confidence: number } {
  const hints = suggestHeaderMappings(headers, sampleRows);
  const hint = hints.find((h) => h.header === header);
  const conf = hint?.confidence ?? 0;
  return { trusted: conf >= threshold, key: (hint?.key as keyof CanonicalFlat | undefined), confidence: conf };
}

/**
 * Quick content-based filter for obviously atomic columns we should not treat as concatenated.
 * Avoids GTIN, price, quantity, expiry, COO, SKU-like codes.
 * Signed: EyosiyasJ
 */
function isAtomicContentColumn(values: any[]): boolean {
  const n = values.length || 1;
  const onlyDigits = (s: any) => String(s).trim().replace(/\D+/g, "");
  const isGtin13 = (s: any) => /^\d{13}$/.test(onlyDigits(s));
  const looksPrice = (s: any) => /^[-+]?\d+(?:[.,]\d{1,2})?(\s*(etb|birr|usd))?$/i.test(String(s).trim());
  const looksQtyInt = (s: any) => /^\d+$/.test(String(s).trim());
  const looksDate = (s: any) => /\b\d{4}-\d{2}-\d{2}\b/.test(String(s)) || /\b\d{2}[\/-]\d{2}[\/-]\d{2,4}\b/.test(String(s));
  const looksISO2 = (s: any) => /^[A-Za-z]{2}$/.test(String(s).trim());
  const alphaNumCode = (s: any) => /^[A-Za-z0-9-]{6,}$/.test(String(s).trim());
  const pGtin = values.filter(isGtin13).length / n;
  const pPrice = values.filter(looksPrice).length / n;
  const pQty = values.filter(looksQtyInt).length / n;
  const pDate = values.filter(looksDate).length / n;
  const pISO2 = values.filter(looksISO2).length / n;
  const pCode = values.filter(alphaNumCode).length / n;
  return pGtin >= 0.6 || pPrice >= 0.6 || pQty >= 0.8 || pDate >= 0.6 || pISO2 >= 0.6 || pCode >= 0.7;
}

/**
 * Detect if a text looks like a pure formula/ingredients list with separators and no numeric+unit tokens.
 * Examples: "alumina, magnesia and simethicone".
 * Signed: EyosiyasJ
 */
function looksFormulaLike(s: string): boolean {
  const t = String(s ?? "").toLowerCase();
  if (!t.trim()) return false;
  const sepCount = (t.match(/[,+&]/g) || []).length + (t.includes(" and ") ? 1 : 0);
  const hasUnit = /\b\d+(?:\.\d+)?\s*(mg|mcg|g|iu|ml|%)\b/.test(t) || /\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml)\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|ml)\b/.test(t);
  const hasPack = /(\b\d+\s*[xX]\s*\d+|\b\d+\s*(?:'s|pcs|pieces|tabs|caps)\b)/.test(t);
  const words = t.split(/[^a-z]+/).filter(Boolean);
  const longWords = words.filter((w) => w.length >= 6).length;
  return sepCount >= 1 && !hasUnit && !hasPack && longWords >= 2;
}

/**
 * Column-level concatenation detector using content signals rather than headers.
 * Criteria: sample values with ≥2 signals among strength/form/pack/country/GTIN/batch should be present in ≥70% rows,
 * and formula-like patterns must not dominate.
 * Skips obviously atomic columns.
 * Signed: EyosiyasJ
 */
/**
 * Identify columns likely to contain concatenated product text for pre-sanitize decomposition.
 * Flags a column when ≥70% of sampled non-empty cells have ≥2 signals among
 * {strength, form, pack, country, batch, GTIN} with formula-rate ≤30%.
 * Signed: EyosiyasJ
 */
export function inferConcatenatedColumns(rows: RawRow[]): Array<{ index: number; reason: string }> {
  const keys = Object.keys(rows[0] || {});
  if (!keys.length) return [];
  const sampleLimit = Math.min(rows.length, 30);
  const sampleRows = rows.slice(0, sampleLimit);
  const result: Array<{ index: number; reason: string }> = [];
  for (let colIdx = 0; colIdx < keys.length; colIdx++) {
    const k = keys[colIdx];
    const values: any[] = [];
    for (let i = 0; i < sampleLimit; i++) {
      const v = rows[i]?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") values.push(v);
    }
    if (!values.length) continue;
    if (isAtomicContentColumn(values)) continue;

    const headers = keys;
    const trusted = isHeaderTrusted(headers, sampleRows, k, 0.8);
    if (trusted.trusted) {
      const atomicTrusted = ["gtin", "unit_price", "on_hand", "expiry_date", "coo", "sku"].includes(String(trusted.key));
      if (atomicTrusted) continue;
    }

    let signalRows = 0;
    let formulaRows = 0;
    for (const v of values) {
      const s = String(v);
      if (looksFormulaLike(s)) { formulaRows++; continue; }
      const { extractions } = decomposeConcatenatedCell(s);
      const hasStrength = extractions.some((e) => e.field === "product.strength");
      const hasForm = extractions.some((e) => e.field === "product.form");
      const hasPack = extractions.some((e) => e.field === "pkg.pieces_per_unit");
      const hasCountry = extractions.some((e) => e.field === "identity.coo");
      const hasBatch = extractions.some((e) => e.field === "batch.batch_no");
      const hasGtin = extractions.some((e) => e.field === "identity.sku") || /\b\d{13}\b/.test(s.replace(/\D+/g, ""));
      const perRowSignals = [hasStrength, hasForm, hasPack, hasCountry, hasBatch, hasGtin].filter(Boolean).length;
      if (perRowSignals >= 2) { signalRows++; }
    }
    const n = values.length;
    const coverage = signalRows / n;
    const formulaRate = formulaRows / n;
    if (coverage >= 0.7 && formulaRate <= 0.3) {
      result.push({ index: colIdx, reason: `concat_signals>=2 in ${(coverage*100).toFixed(0)}% rows; formulaRate ${(Math.round(formulaRate*100))}%` });
    }
  }
  return result;
}

function mapConcatItemsRow(raw: RawRow): Partial<CanonicalProduct> {
  const flat: CanonicalFlat = {};
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
    parseNumber(raw["Price"]) ?? parseNumber(extracted.unit_price);
  flat.on_hand = parseNumber(raw["Stock"]);
  flat.category = sanitizeString(raw["CategoryId"]) || null;
  flat.coo = extracted.coo || null;
  return ensureCanonical(flat);
}

function canonicalizeForm(form: string | undefined): string | undefined {
  if (!form) return undefined;
  const f = sanitizeString(form).toLowerCase();
  return FORM_SYNONYMS[f] ?? f;
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  let s = sanitizeString(value).replace(/\s/g, "");
  if (!s) return undefined;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function extractFromBlob(text: string): Partial<CanonicalFlat> {
  const out: Partial<CanonicalFlat> = {};
  if (!text) return out;
  const tokens = tokenizeBlob(text);
  // strength
  const strengthToken = tokens.find((t) => t.type === "RATIO" || t.type === "UNIT");
  if (strengthToken) out.strength = strengthToken.value;
  // form
  const formToken = tokens.find((t) => t.type === "FORM");
  if (formToken) out.form = canonicalizeForm(formToken.value);
  // expiry
  const expiryToken = tokens.find((t) => t.type === "DATE");
  if (expiryToken) out.expiry_date = expiryToken.value;
  // batch / lot
  const batchToken = tokens.find((t) => t.type === "BATCH");
  if (batchToken) out.batch_no = batchToken.value;
  // price
  const priceToken = tokens.find((t) => t.type === "PRICE");
  if (priceToken) out.unit_price = parseNumber(priceToken.value);
  // generic_name fallback
  const nameToken = tokens.find((t) => t.type === "NAME");
  if (nameToken) out.generic_name = nameToken.value;
  // country
  const countryToken = tokens.find((t) => t.type === "COUNTRY");
  if (countryToken) out.coo = countryToken.value;
  return out;
}

type BlobTokenType =
  | "UNIT"
  | "RATIO"
  | "DATE"
  | "FORM"
  | "BATCH"
  | "PRICE"
  | "COUNTRY"
  | "NAME";
interface BlobToken {
  type: BlobTokenType;
  value: string;
}

function tokenizeBlob(input: string): BlobToken[] {
  const s = sanitizeString(input);
  const tokens: BlobToken[] = [];
  const push = (type: BlobTokenType, value: string) =>
    tokens.push({ type, value });

  const ratio = s.match(
    /\b\d+(?:\.\d+)?\s*(mg|mcg|g|iu|ml)\s*\/\s*\d*(?:\.\d+)?\s*(mg|mcg|g|ml)\b/i
  );
  if (ratio) push("RATIO", ratio[0].replace(/\s+/g, ""));
  const unit = s.match(/\b\d+(?:\.\d+)?\s*(mg|mcg|g|iu|ml|%)\b/i);
  if (unit) push("UNIT", unit[0].replace(/\s+/g, ""));
  const date =
    s.match(/\b\d{4}-\d{2}-\d{2}\b/) ||
    s.match(/\b\d{2}\/\d{2}\/\d{4}\b/) ||
    s.match(/\b\d{2}-\d{2}-\d{2,4}\b/) ||
    s.match(/\b\d{3,5}\b/);
  if (date) push("DATE", date[0]);
  const batch = s.match(/\b(?:batch|bn|lot)[\s:#-]*([A-Za-z0-9-]+)\b/i);
  if (batch) push("BATCH", batch[1]);
  const price = s.match(/\b\d+(?:[\.,]\d{1,2})?\s*(etb|birr|usd)?\b/i);
  if (price) push("PRICE", price[0]);
  const form = s.match(
    /\b(tablets?|capsules?|syrup|suspension|injection|ointment|cream|gel|drops?|inhaler|lotion|patch|suppository|powder|solution|spray)\b/i
  );
  if (form) push("FORM", form[0]);
  const country = s.match(
    /\b(ethiopia|india|germany|china|united states|united kingdom|france|italy|spain|kenya|south africa)\b/i
  );
  if (country) push("COUNTRY", capitalizeWords(country[0]));
  const name = s.match(/^[A-Za-z][A-Za-z0-9\s-]{3,}/);
  if (name) push("NAME", name[0]);
  return tokens;
}

function capitalizeWords(v: string): string {
  return v.replace(/\b\w/g, (c) => c.toUpperCase());
}
