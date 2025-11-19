import type { CanonicalProduct, ParsedRowError } from "./types.js";

// Shared, field-level sanitizers (moved from web importer).
export type IssueLevel = "error" | "warn";
export type Issue = { field: string; code: string; msg: string; level: IssueLevel };

export interface CanonicalRowInput {
  generic_name?: unknown;
  strength?: unknown;
  form?: unknown;
  brand_name?: unknown;
  gtin?: unknown;
  category?: unknown;
  requires_prescription?: unknown;
  is_controlled?: unknown;
  storage_conditions?: unknown;
  description?: unknown;
  batch_no?: unknown;
  expiry_date?: unknown;
  on_hand?: unknown;
  unit_price?: unknown;
  reserved?: unknown;
  purchase_unit?: unknown;
  pieces_per_unit?: unknown;
  unit?: unknown;
  cat?: unknown;
  frm?: unknown;
  pkg?: unknown;
  coo?: unknown;
  sku?: unknown;
}

export interface SanitizedRow {
  generic_name: string;
  strength?: string;
  form?: FormEnum;
  brand_name?: string;
  gtin?: string;
  category?: string;
  requires_prescription?: boolean;
  is_controlled?: boolean;
  storage_conditions?: string;
  description?: string;
  batch_no?: string;
  expiry_date?: string;
  on_hand?: number;
  unit_price?: number;
  reserved?: number;
  purchase_unit?: string;
  pieces_per_unit?: string;
  unit?: string;
  cat?: string;
  frm?: string;
  pkg?: string;
  coo?: string;
  sku?: string;
}

const FORM_ENUM = ["tablet", "capsule", "syrup", "injection", "cream", "ointment", "drops", "inhaler", "other"] as const;
type FormEnum = (typeof FORM_ENUM)[number];
type IdentityFields = NonNullable<CanonicalProduct["identity"]>;

const FORM_SYNONYMS: Record<string, FormEnum> = {
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

const asciiLower = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7F]/g, "")
    .toLowerCase()
    .trim();
const collapseWS = (s: string): string => s.replace(/\s+/g, " ").trim();
const onlyDigits = (s: string): string => s.replace(/\D+/g, "");

const lev = (a: string, b: string): number => {
  const m = a.length,
    n = b.length,
    d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  return d[m][n];
};

export function sanitizeForm(v: unknown): { value?: FormEnum; issues: Issue[]; suggestion?: FormEnum } {
  const issues: Issue[] = [];
  const raw = asciiLower(v);
  if (!raw) return { issues: [{ field: "form", code: "E_FORM_MISSING", msg: "form required", level: "error" }] };
  if (FORM_SYNONYMS[raw]) return { value: FORM_SYNONYMS[raw], issues };
  const candidates = [...Object.keys(FORM_SYNONYMS), ...FORM_ENUM];
  let best: { key: string; dist: number; mapped: FormEnum } | null = null;
  for (const k of candidates) {
    const dist = lev(raw, k);
    const mapped = (FORM_SYNONYMS[k] as FormEnum) ?? (FORM_ENUM.includes(k as FormEnum) ? (k as FormEnum) : "other");
    if (!best || dist < best.dist) best = { key: k, dist, mapped };
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

export function sanitizeStrength(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!v) return { issues };
  let s = String(v);
  s = s.replace(/[μµ]/g, "mc"); // μg -> mcg
  s = s.replace(/\s+/g, ""); // "500 mg" -> "500mg"
  s = s.replace(/MCG/gi, "mcg").replace(/MG/gi, "mg").replace(/ML/gi, "ml").replace(/G(?!\/)/g, "g");
  if (!/^(\d+(\.\d+)?(mg|g|mcg|ml|%)|( \d+)?(mg|g|mcg|ml)\/\d+(mg|g|mcg|ml))$/i.test(s)) {
    s = s.replace(/(\d+)\s*\/\s*(\d+)/g, "$1/$2");
  }
  const ok = /^(\d+(\.\d+)?(mg|g|mcg|ml|%)|\d+(\.\d+)?(mg|g|mcg|ml)\/\d+(\.\d+)?(mg|g|mcg|ml))$/i.test(s);
  if (!ok) issues.push({ field: "strength", code: "E_STRENGTH_FORMAT", msg: "use like 500mg, 5mg/5ml, 1%", level: "error" });
  return { value: s, issues };
}

export function sanitizeGTIN(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!v) return { issues };
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

export function sanitizeBool(v: unknown): { value?: boolean; issues: Issue[] } {
  const s = asciiLower(v);
  if (!s) return { issues: [] };
  if (["true", "yes", "1", "y"].includes(s)) return { value: true, issues: [] };
  if (["false", "no", "0", "n"].includes(s)) return { value: false, issues: [] };
  return { issues: [{ field: "boolean", code: "E_BOOL", msg: `not a boolean: "${v}"`, level: "error" }] };
}

export function sanitizeBatchNo(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!v) return { issues };
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

export function sanitizeExpiry(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!v) return { issues };
  const s = String(v).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) {
    issues.push({ field: "expiry_date", code: "E_DATE_FMT", msg: "use DD/MM/YYYY", level: "error" });
    return { issues };
  }
  const dd = +m[1],
    mm = +m[2],
    yy = +m[3];
  if (mm < 1 || mm > 12) issues.push({ field: "expiry_date", code: "E_DATE_MM", msg: "month 01–12", level: "error" });
  const daysInMonth = new Date(yy, mm, 0).getDate();
  if (dd < 1 || dd > daysInMonth) issues.push({ field: "expiry_date", code: "E_DATE_DD", msg: `day 01–${daysInMonth}`, level: "error" });
  const today = new Date();
  const dt = new Date(yy, mm - 1, dd);
  if (dt.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) {
    issues.push({ field: "expiry_date", code: "W_EXPIRED", msg: "date is in the past", level: "warn" });
  }
  return { value: s, issues };
}

export function sanitizeNumber(v: unknown, { gt, ge }: { gt?: number; ge?: number } = {}): { value?: number; issues: Issue[] } {
  const issues: Issue[] = [];
  if (v === undefined || v === null || v === "") return { issues };
  const n = Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) {
    issues.push({ field: "number", code: "E_NUM", msg: "not a number", level: "error" });
    return { issues };
  }
  if (ge !== undefined && n < ge) issues.push({ field: "number", code: "E_NUM_GE", msg: `must be ≥ ${ge}`, level: "error" });
  if (gt !== undefined && n <= gt) issues.push({ field: "number", code: "E_NUM_GT", msg: `must be > ${gt}`, level: "error" });
  return { value: n, issues };
}

export function sanitizeGenericName(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  let s = collapseWS(String(v ?? "")).trim();
  if (!s) return { issues: [{ field: "generic_name", code: "E_GENERIC_MISSING", msg: "generic_name required", level: "error" }] };
  s = s.replace(/[0-9]/g, "");
  s = s.replace(/\b(mg|mcg|ml|iu|%|g)\b/gi, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (!s) {
    issues.push({ field: "generic_name", code: "E_GENERIC_INVALID", msg: "name must not contain numbers", level: "error" });
    return { issues };
  }
  return { value: s, issues };
}

export function sanitizeCategoryCode(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return { issues: [{ field: "cat", code: "E_CAT_MISSING", msg: "category code required", level: "error" }] };
  if (!/^[A-Z]{3}$/.test(s)) issues.push({ field: "cat", code: "E_CAT_FORMAT", msg: "use 3-letter code (e.g., ANT)", level: "error" });
  return { value: s, issues };
}

export function sanitizeFormCode(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return { issues: [{ field: "frm", code: "E_FRM_MISSING", msg: "form code required", level: "error" }] };
  if (!/^[A-Z]{2,3}$/.test(s)) issues.push({ field: "frm", code: "E_FRM_FORMAT", msg: "use 2–3 letter code (e.g., TB, CP, SY)", level: "error" });
  return { value: s, issues };
}

export function sanitizeCountryCode(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return { issues: [{ field: "coo", code: "E_COO_MISSING", msg: "country code required", level: "error" }] };
  if (!/^[A-Z]{2}$/.test(s)) issues.push({ field: "coo", code: "E_COO_FORMAT", msg: "use 2-letter ISO-2 code (e.g., IN, ET)", level: "error" });
  return { value: s, issues };
}

export function sanitizePackageCode(v: unknown): { value?: string; issues: Issue[] } {
  const issues: Issue[] = [];
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return { issues: [{ field: "pkg", code: "E_PKG_MISSING", msg: "package code required", level: "error" }] };
  const ok = /^(\d+[A-Z]+(X\d+[A-Z]+)?)$/.test(s);
  if (!ok) issues.push({ field: "pkg", code: "E_PKG_FORMAT", msg: "use 30TAB, 1BTLX100ML, 1VIALX10ML", level: "error" });
  return { value: s, issues };
}

export function sanitizeRow(input: CanonicalRowInput): { row: SanitizedRow; issues: Issue[] } {
  const issues: Issue[] = [];
  const out: SanitizedRow = { generic_name: "" };

  const generic = collapseWS(String(input.generic_name ?? "")).trim();
  if (!generic) issues.push({ field: "generic_name", code: "E_GENERIC_MISSING", msg: "generic_name required", level: "error" });
  out.generic_name = generic || "";

  const f = sanitizeForm(input.form);
  if (f.value) out.form = f.value;
  issues.push(...f.issues);

  out.brand_name = collapseWS(String(input.brand_name ?? "")).trim() || undefined;

  const st = sanitizeStrength(input.strength);
  if (st.value !== undefined) out.strength = st.value;
  issues.push(...st.issues);

  const gt = sanitizeGTIN(input.gtin);
  if (gt.value !== undefined) out.gtin = gt.value;
  issues.push(...gt.issues);

  out.category = collapseWS(String(input.category ?? "")).trim() || undefined;

  const rp = sanitizeBool(input.requires_prescription);
  if (rp.value !== undefined) out.requires_prescription = rp.value;
  issues.push(...rp.issues);

  const ic = sanitizeBool(input.is_controlled);
  if (ic.value !== undefined) out.is_controlled = ic.value;
  issues.push(...ic.issues);

  out.storage_conditions = collapseWS(String(input.storage_conditions ?? "")).trim() || undefined;
  out.description = collapseWS(String(input.description ?? "")).trim() || undefined;

  const hasStock = !!(input.batch_no || input.expiry_date || input.on_hand || input.unit_price || input.reserved);
  const bn = sanitizeBatchNo(input.batch_no);
  const ex = sanitizeExpiry(input.expiry_date);
  const q = sanitizeNumber(input.on_hand, { ge: 0 });
  const pr = sanitizeNumber(input.unit_price, { gt: 0 });
  const rv = sanitizeNumber(input.reserved ?? 0, { ge: 0 });

  if (hasStock) {
    if (!bn.value) issues.push({ field: "batch_no", code: "E_STOCK_BATCH_REQUIRED", msg: "batch_no required when stock present", level: "error" });
    if (!ex.value) issues.push({ field: "expiry_date", code: "E_STOCK_EXPIRY_REQUIRED", msg: "expiry_date required when stock present", level: "error" });
    if (q.value === undefined) issues.push({ field: "on_hand", code: "E_STOCK_QTY_REQUIRED", msg: "on_hand required when stock present", level: "error" });
    if (pr.value === undefined) issues.push({ field: "unit_price", code: "E_STOCK_PRICE_REQUIRED", msg: "unit_price required when stock present", level: "error" });
  }

  issues.push(...bn.issues, ...ex.issues, ...q.issues, ...pr.issues, ...rv.issues);

  out.batch_no = bn.value;
  out.expiry_date = ex.value;
  out.on_hand = q.value;
  out.unit_price = pr.value;
  out.reserved = rv.value ?? 0;

  out.purchase_unit = collapseWS(String(input.purchase_unit ?? "")).trim() || undefined;
  out.pieces_per_unit = collapseWS(String(input.pieces_per_unit ?? "")).trim() || undefined;
  out.unit = collapseWS(String(input.unit ?? "")).trim() || undefined;

  if (input.cat !== undefined) {
    const c = sanitizeCategoryCode(input.cat);
    if (c.value !== undefined) out.cat = c.value;
    issues.push(...c.issues);
  }
  if (input.frm !== undefined) {
    const fc = sanitizeFormCode(input.frm);
    if (fc.value !== undefined) out.frm = fc.value;
    issues.push(...fc.issues);
  }
  if (input.pkg !== undefined) {
    const pc = sanitizePackageCode(input.pkg);
    if (pc.value !== undefined) out.pkg = pc.value;
    issues.push(...pc.issues);
  }
  if (input.coo !== undefined) {
    const cc = sanitizeCountryCode(input.coo);
    if (cc.value !== undefined) out.coo = cc.value;
    issues.push(...cc.issues);
  }

  const sku = collapseWS(String(input.sku ?? "")).trim();
  if (sku) out.sku = sku;

  return { row: out, issues };
}

const ddmmyyyyToIso = (s: string | undefined): string | undefined => {
  if (!s) return undefined;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return undefined;
  const [_, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateFlexible = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = ddmmyyyyToIso(s);
  if (iso) return iso;
  if (/^\d{3,5}$/.test(s)) {
    const serial = Number(s);
    if (Number.isFinite(serial) && serial > 59 && serial < 400000) {
      const base = new Date(Date.UTC(1899, 11, 31));
      const adj = serial > 60 ? serial - 1 : serial;
      const dt = new Date(base.getTime() + adj * 86400000);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }
  return undefined;
};

const isFutureDate = (iso: string): boolean => {
  const target = new Date(`${iso}T00:00:00.000Z`);
  if (isNaN(target.getTime())) return false;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return target.getTime() > today.getTime();
};

const mapIssueToParsed = (issue: Issue, rowIndex: number): ParsedRowError => {
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
        return "batch.coo";
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

export function sanitizeCanonicalRow(
  raw: Partial<CanonicalProduct>,
  rowIndex: number
): { row: CanonicalProduct | null; errors: ParsedRowError[] } {
  const flat: CanonicalRowInput = {
    generic_name: raw.product?.generic_name,
    strength: raw.product?.strength,
    form: raw.product?.form,
    category: raw.product?.category ?? undefined,
    batch_no: raw.batch?.batch_no,
    expiry_date: raw.batch?.expiry_date,
    on_hand: raw.batch?.on_hand,
    unit_price: raw.batch?.unit_price,
    cat: raw.identity?.cat,
    frm: raw.identity?.frm,
    pkg: raw.identity?.pkg,
    coo: raw.batch?.coo ?? raw.identity?.coo,
    sku: raw.identity?.sku,
  };

  const { row, issues } = sanitizeRow(flat);
  const errors = issues.map((i) => mapIssueToParsed(i, rowIndex));

  if (!row) return { row: null, errors };

  const expiryIso = parseDateFlexible(row.expiry_date);
  if (expiryIso) {
    if (!isFutureDate(expiryIso)) {
      errors.push({ row: rowIndex, field: "batch.expiry_date", code: "expired", message: "Expiry date must be in the future" });
    }
  } else if (row.expiry_date) {
    errors.push({ row: rowIndex, field: "batch.expiry_date", code: "invalid_format", message: "Cannot parse expiry date" });
  }

  const fatal = errors.some((e) => e.code.startsWith("E_") || e.code === "missing_required");
  if (fatal) return { row: null, errors };

  const canonical: CanonicalProduct = {
    product: {
      generic_name: row.generic_name ?? "",
      strength: row.strength ?? "",
      form: row.form ?? "",
      category: row.category ?? null,
    },
    batch: {
      batch_no: row.batch_no ?? "",
      expiry_date: expiryIso ?? "",
      on_hand: row.on_hand ?? 0,
      unit_price: row.unit_price ?? null,
      coo: row.coo ?? null,
    },
  };

  const identityHasValues = Boolean(row.cat || row.frm || row.pkg || row.coo || row.sku);
  if (identityHasValues) {
    canonical.identity = {
      cat: row.cat ?? null,
      frm: row.frm ?? null,
      pkg: row.pkg ?? null,
      coo: row.coo ?? null,
      sku: row.sku ?? null,
    };
  }

  return { row: canonical, errors };
}
