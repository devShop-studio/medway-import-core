import { normalizeCountryToIso2 } from "./country.js";

/**
 * Module: Concatenated Text Decomposition
 * Purpose: Extract canonical fields (strength, form, pack contents, COO, GTIN, batch, manufacturer)
 * from mixed text cells and provide a cleaned leftover for textual targets.
 * Modes:
 * - `default`: balanced extraction for flagged concat columns.
 * - `opportunistic`: stricter acceptance for mixed columns; requires multiple signals.
 * Anchors:
 * - Formal form identifier (dictionary) improves tail-phrase detection.
 * - Name splitter provides fallback for common `Name` patterns.
 * Signed: EyosiyasJ
 */

/**
 * Canonical field paths we might extract from a concatenated cell.
 * Signed: EyosiyasJ
 */
export type CanonicalFieldPath =
  | "product.generic_name"
  | "product.brand_name"
  | "product.strength"
  | "product.form"
  | "product.category"
  | "product.manufacturer_name"
  | "product.description"
  | "product.umbrella_category"
  | "batch.batch_no"
  | "batch.expiry_date"
  | "batch.on_hand"
  | "batch.unit_price"
  | "identity.coo"
  | "identity.sku"
  | "identity.purchase_unit"
  | "pkg.pieces_per_unit";

export interface ConcatExtraction {
  field: CanonicalFieldPath;
  value: string | number;
  confidence: number;
  reason: string;
}

export interface ConcatDecomposition {
  leftover: string;
  extractions: ConcatExtraction[];
}

interface Token {
  text: string;
  upper: string;
  consumed: boolean;
}

/**
 * Decompose a concatenated cell into canonical extractions using reusable detectors.
 * Supports `mode: opportunistic` for stricter acceptance on mixed columns.
 * Signed: EyosiyasJ
 */
export function decomposeConcatenatedCell(raw: string, opts?: { mode?: "default" | "opportunistic"; minSignals?: number }): ConcatDecomposition {
  const cleaned = String(raw ?? "").trim();
  if (!cleaned) return { leftover: "", extractions: [] };
  const tokens = tokenize(cleaned);
  const extractions: ConcatExtraction[] = [];
  const anchoredForm = detectFormPhrase(cleaned);
  const splitFallback = splitNameGenericStrengthForm(cleaned);
  let fallbackApplied = false;

  if (anchoredForm && !extractions.some((e) => e.field === "product.form")) {
    extractions.push({ field: "product.form", value: anchoredForm.canonical, confidence: 0.92, reason: "form_phrase_anchor" });
  }

  detectStrength(tokens, extractions);
  detectForm(tokens, extractions);
  detectPackContents(tokens, extractions);
  detectCountry(tokens, extractions);
  detectGtin(tokens, extractions);
  detectBatch(tokens, extractions);
  detectExpiry(tokens, extractions);
  detectManufacturer(cleaned, extractions);
  detectManufacturerHint(cleaned, extractions);
  detectBrandHead(cleaned, extractions);

  const hasExtraction = (field: CanonicalFieldPath) => extractions.some((e) => e.field === field);
  if (splitFallback.strength && !hasExtraction("product.strength")) {
    extractions.push({ field: "product.strength", value: splitFallback.strength, confidence: 0.8, reason: "name_split_strength" });
    fallbackApplied = true;
  }
  if (splitFallback.form && !hasExtraction("product.form")) {
    extractions.push({ field: "product.form", value: splitFallback.form, confidence: 0.75, reason: "name_split_form" });
    fallbackApplied = true;
  }

  let leftover = buildLeftover(tokens);
  if (fallbackApplied) {
    const candidate = splitFallback.generic_name ?? splitFallback.leftover;
    if (candidate) leftover = candidate;
  } else if (splitFallback.generic_name && (!leftover || leftover === cleaned)) {
    leftover = splitFallback.generic_name;
  }

  if ((opts?.mode ?? "default") === "opportunistic") {
    const accepted = opportunisticAccept(cleaned, extractions, leftover, opts?.minSignals ?? 3);
    if (!accepted) return { leftover: "", extractions: [] };
  }
  return { leftover, extractions };
}

/**
 * Split a Name-like cell into {generic_name, strength, form} using right-sided patterns.
 * - Detect trailing form via synonyms (hyphen or space-suffix)
 * - Find the last strength block containing numbers + units (incl. ratios, % w/w)
 * - Preserve formulas/text in generic_name when strength not present
 * Signed: EyosiyasJ
 */
export function splitNameGenericStrengthForm(raw: string): { generic_name?: string; strength?: string; form?: string; leftover?: string } {
  const result: { generic_name?: string; strength?: string; form?: string; leftover?: string } = {};
  if (!raw) return result;
  let s = String(raw).trim();
  if (!s) return result;
  s = s.replace(/---+$/g, "").trim();
  if (!s) return result;

  const upper = s.toUpperCase();
  let form: string | undefined;
  let beforeForm = s;

  // Form phrase anchor (dictionary variants)
  const phrase = detectFormPhrase(s);
  if (phrase) {
    const hasDoseSignal = /\d/.test(s) || /(mg|mcg|ml|iu|%)/i.test(s);
    if (phrase.canonical !== "other" || hasDoseSignal) {
      form = phrase.canonical;
      const idx = s.toLowerCase().lastIndexOf(phrase.phrase.toLowerCase());
      if (idx >= 0) beforeForm = s.slice(0, idx).trim();
    }
  }

  // Form synonyms mapped to sanitize.ts forms (lowercase canonical)
  const FORM_SYNONYMS: Record<string, string> = {
    "TABLET": "tablet",
    "FILM COATED TABLET": "tablet",
    "FILM-COATED TABLET": "tablet",
    "CHEWABLE TABLET": "tablet",
    "SUPPOSITORY": "other",
    "SUPPOSITORIES": "other",
    "CAPSULE": "capsule",
    "CAPSULES": "capsule",
    "PESSARY": "other",
    "PESSARIES": "other",
    "SYRUP": "syrup",
    "ELIXIR": "syrup",
    "SUSPENSION": "suspension",
    "POWDER FOR SUSPENSION": "suspension",
    "SUSPENSION FOR INHALATION": "inhaler",
    "CREAM": "cream",
    "OINTMENT": "ointment",
    "GEL": "gel",
    "LOTION": "lotion",
    "SOLUTION": "solution",
    "MOUTH WASH": "solution",
    "EYE DROP": "drops",
    "EYE DROPS": "drops",
    "DROPS": "drops",
    "DROP": "drops",
    "AEROSOL": "inhaler",
    "SPRAY": "spray",
    "SHAMPOO": "other",
    "POWDER FOR INHALATION": "inhaler",
    "EFFERVESCENT TABLETS": "tablet",
    "PATCH": "patch",
  };

  // (a) hyphen forms: ...-FORM
  const hyMatch = upper.match(/^(.*)-\s*([A-Z ][A-Z \-]*)$/);
  if (hyMatch) {
    const candidate = hyMatch[2].trim().replace(/\s+/g, " ");
    let canonical = FORM_SYNONYMS[candidate];
    if (!canonical) {
      const tail = candidate.split(/\s*-\s*/).pop() || candidate;
      canonical = FORM_SYNONYMS[tail];
    }
    if (canonical) { form = canonical; beforeForm = s.slice(0, hyMatch[1].length).trim(); }
  }
  // (b) trailing form words (allow space or hyphen before the form phrase)
  if (!form) {
    const candidates = Object.keys(FORM_SYNONYMS).sort((a, b) => b.length - a.length);
    for (const key of candidates) {
      const re = new RegExp(`(?:\\s+|\\s*-\\s*)${key.replace(/\s+/g, "\\s+")}\\s*$`, "i");
      const m = s.match(re);
      if (m) {
        form = FORM_SYNONYMS[key];
        beforeForm = s.slice(0, m.index!).trim();
        break;
      }
    }
  }

  // Strength pattern capturing last block with units/ratios/% w/w
  const STRENGTH_PATTERN = /([0-9]+(?:[\.,][0-9]+)?(?:\s*[+\/]\s*[0-9]+(?:[\.,][0-9]+)?)*[\s-]*(?:mg|mcg|g|ml|iu|iu\/ml|-?%)(?:[\/\-\s]*[0-9]+(?:[\.,][0-9]+)?[\s-]*(?:mg|mcg|g|ml|%))?(?:\s*\/\s*ml)?(?:-\s*(?:%\s*)?[wW]\/[wW])?)/i;
  let strength: string | undefined;
  let generic: string | undefined;
  let leftover: string | undefined;
  const re = new RegExp(STRENGTH_PATTERN.source, "gi");
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(beforeForm)) !== null) last = m;
  if (last) {
    const rawStrength = last[0].trim();
    let cleaned = rawStrength;
    if (/[-\s]*%\s*[wW]\/[wW]/.test(rawStrength) && /-\s*%\s*[wW]\/[wW]/.test(rawStrength)) {
      cleaned = rawStrength.replace(/-\s*%\s*([wW]\/[wW])/g, "%$1"); // "12-%w/w" -> "12%w/w"
    } else if (/%-\s*[wW]\/[wW]/.test(rawStrength)) {
      cleaned = rawStrength; // "1%-w/w" keep as-is
    } else {
      cleaned = cleaned.replace(/-\s*%/, "%"); // "0.64-%" -> "0.64%"
    }
    strength = cleaned;
    const start = beforeForm.lastIndexOf(last[0]);
    const cut = start >= 0 ? start : (last.index!);
    // Trim any trailing strength-prefix fragments such as "-1-", "-0", or "-0.64-"
    generic = beforeForm
      .slice(0, cut)
      .replace(/\s*-\s*\d+(?:[\.,]\d+)?-?$/g, "")
      .replace(/[-\s+,]+$/g, "")
      .trim();
    leftover = beforeForm.slice(cut + last[0].length).trim() || undefined;
    if (/\%\s*[wW]\/[wW]/.test(beforeForm) && /%[wW]\/[wW]/.test(String(strength)) === false && String(strength).endsWith('%')) {
      strength = `${String(strength)}w/w`;
    }
  } else {
    generic = beforeForm.trim();
  }

  if (generic) result.generic_name = generic;
  if (strength) result.strength = strength;
  if (form) result.form = form;
  if (!form && typeof leftover === "string" && leftover) {
    const tail = leftover.replace(/^[-\s]+/, "").toUpperCase();
    const cand = Object.keys(FORM_SYNONYMS).find((k) => tail === k);
    if (cand) { result.form = FORM_SYNONYMS[cand]; leftover = undefined; }
  }
  if (leftover) result.leftover = leftover;
  return result;
}

/**
 * Formal form identifier: dictionary + matcher for tail phrases.
 * Used as an anchor for concatenated text across any column.
 * Signed: EyosiyasJ
 */
const FORM_DICTIONARY: Record<string, string[]> = {
  tablet: [
    "tablet", "tablets", "tab", "tabs", "tab.", "-tablet", "-tablets",
    "effervescent tablets", "film coated tablet", "film-coated tablet", "chewable tablet"
  ],
  capsule: ["capsule", "capsules", "cap", "caps", "cap.", "-capsule"],
  syrup: ["syrup", "sirup"],
  suspension: ["suspension", "susp", "susp.", "powder for suspension"],
  cream: ["cream", "creme", "cr.", "–cream", "-cream"],
  gel: ["gel", "-gel"],
  ointment: ["ointment", "oint.", "oint", "-ointment"],
  drops: ["drop", "drops", "eye drop", "eye drops", "ear drop", "ear drops"],
  injection: ["injection", "inj.", "inj", "-injection"],
  inhaler: ["aerosol", "suspension for inhalation", "inhalation", "puffer"],
  other: ["shampoo", "plaster", "adhesive plaster", "sachet", "sachets", "sacchet", "suppository", "suppositories", "pregnancy test", "test"],
};

function detectFormPhrase(raw: string): { canonical: string; phrase: string } | null {
  const lower = String(raw ?? "").toLowerCase();
  const hasDigitOrUnit = HAS_DIGIT_RE.test(lower) || UNIT_RE.test(lower);
  for (const [canonical, variants] of Object.entries(FORM_DICTIONARY)) {
    const sorted = [...variants].sort((a, b) => b.length - a.length);
    for (const v of sorted) {
      const vv = v.toLowerCase();
      if (lower.endsWith(vv)) {
        if (canonical === "other" && !hasDigitOrUnit) continue;
        return { canonical, phrase: v };
      }
    }
  }
  return null;
}

function tokenize(raw: string): Token[] {
  const replaced = raw.replace(/[;,]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = replaced.split(" ").filter(Boolean);
  return parts.map((p) => ({ text: p, upper: p.toUpperCase(), consumed: false }));
}

function buildLeftover(tokens: Token[]): string {
  const remaining = tokens.filter((t) => !t.consumed).map((t) => t.text).join(" ").trim();
  if (!remaining) return "";
  if (!/[A-Za-z]/.test(remaining)) return "";
  return remaining;
}

const STRENGTH_SINGLE_TOKEN = /^(\d+(\.\d+)?)(MG|G|MCG|UG|µG|ML|IU|%)(\/\d+(\.\d+)?(MG|G|ML))?$/i;
const STRENGTH_PART_1 = /^(\d+(\.\d+)?)$/;
const STRENGTH_PART_2 = /^(MG|G|MCG|UG|µG|ML|IU|%)$/i;
const STRENGTH_PART_SLASH = /^\/(\d+(\.\d+)?)(MG|G|ML)$/i;

function detectStrength(tokens: Token[], out: ConcatExtraction[]) {
  for (const tok of tokens) {
    if (tok.consumed) continue;
    if (STRENGTH_SINGLE_TOKEN.test(tok.text)) {
      out.push({ field: "product.strength", value: tok.text, confidence: 0.9, reason: "strength_pattern_single" });
      tok.consumed = true;
      return;
    }
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const t1 = tokens[i];
    const t2 = tokens[i + 1];
    if (t1.consumed || t2.consumed) continue;
    if (STRENGTH_PART_1.test(t1.text) && STRENGTH_PART_2.test(t2.text)) {
      let text = `${t1.text}${t2.text}`;
      if (i + 2 < tokens.length && !tokens[i + 2].consumed) {
        const t3 = tokens[i + 2];
        if (t3.text === "/" && i + 3 < tokens.length && !tokens[i + 3].consumed) {
          const t4 = tokens[i + 3];
          if (STRENGTH_PART_SLASH.test(`/${t4.text}`)) {
            text = `${t1.text}${t2.text}/${t4.text}`;
            t3.consumed = true;
            t4.consumed = true;
          }
        } else if (STRENGTH_PART_SLASH.test(t3.text)) {
          text = `${t1.text}${t2.text}${t3.text}`;
          t3.consumed = true;
        }
      }
      out.push({ field: "product.strength", value: text, confidence: 0.85, reason: "strength_pattern_multi" });
      t1.consumed = true;
      t2.consumed = true;
      return;
    }
  }
}

const FORM_KEYWORDS: Record<string, string> = {
  TAB: "tablet",
  TABS: "tablet",
  TABLET: "tablet",
  TABLETS: "tablet",
  CAP: "capsule",
  CAPS: "capsule",
  CAPSULE: "capsule",
  CAPSULES: "capsule",
  SYR: "syrup",
  SYRUP: "syrup",
  SUSP: "suspension",
  SUSPENSION: "suspension",
  INJ: "injection",
  INJECTION: "injection",
  OINT: "ointment",
  OINTMENT: "ointment",
  CRM: "cream",
  CREAM: "cream",
  GEL: "gel",
  LOTION: "lotion",
  DROP: "drops",
  DROPS: "drops",
  SOL: "solution",
  SOLN: "solution",
  SOLUTION: "solution",
  PATCH: "patch",
  POWD: "powder",
  POWDER: "powder",
  SPRAY: "spray",
};

const UNIT_RE = /\b(mg|mcg|g|kg|ml|l|iu|%|w\/v|w\/w|v\/v)\b/i;
const HAS_DIGIT_RE = /\d/;
const ALNUM_BATCH_RE = /^[A-Za-z0-9\-_.\/]+$/;
function hasDigit(s: string): boolean { return HAS_DIGIT_RE.test(String(s ?? "")); }
function hasUnitToken(s: string): boolean { return UNIT_RE.test(String(s ?? "")); }
function envList(name: string): Set<string> {
  const raw = String((globalThis as any).process?.env?.[name] ?? "");
  return new Set(raw.split(/[,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
}
const ALLOWED_NUMERIC_BRANDS = envList("ALLOWED_NUMERIC_BRANDS");
const ALLOWED_NUMERIC_MANUF = envList("ALLOWED_NUMERIC_MANUF");
function isAllowedNumericBrandCell(s: string): boolean { return HAS_DIGIT_RE.test(String(s ?? "")) && ALLOWED_NUMERIC_BRANDS.has(String(s ?? "").trim().toLowerCase()); }
function isAllowedNumericManufCell(s: string): boolean { return HAS_DIGIT_RE.test(String(s ?? "")) && ALLOWED_NUMERIC_MANUF.has(String(s ?? "").trim().toLowerCase()); }
function isAlphaNumericBatch(s: string): boolean {
  const v = String(s ?? "");
  return ALNUM_BATCH_RE.test(v) && /[A-Za-z]/.test(v);
}

function detectForm(tokens: Token[], out: ConcatExtraction[]) {
  for (const tok of tokens) {
    if (tok.consumed) continue;
    const normalized = FORM_KEYWORDS[tok.upper];
    if (normalized && !hasDigit(tok.text) && !hasUnitToken(tok.text)) {
      out.push({ field: "product.form", value: normalized, confidence: 0.9, reason: "form_keyword" });
      tok.consumed = true;
      return;
    }
  }
}

function detectPackContents(tokens: Token[], out: ConcatExtraction[]) {
  for (const tok of tokens) {
    if (tok.consumed) continue;
    const m1 = tok.text.match(/^(\d{1,4})(S|TAB|TABS|CAP|CAPS|PCS|PIECES)?$/i);
    const m2 = tok.text.match(/^[xX](\d{1,4})$/);
    let num: number | null = null;
    if (m1) num = parseInt(m1[1], 10);
    else if (m2) num = parseInt(m2[1], 10);
    if (num != null && !Number.isNaN(num)) {
      out.push({ field: "pkg.pieces_per_unit", value: num, confidence: 0.8, reason: "pack_count_pattern" });
      tok.consumed = true;
      return;
    }
  }
}

function detectCountry(tokens: Token[], out: ConcatExtraction[]) {
  const maxLen = 3;
  for (let len = 1; len <= maxLen; len++) {
    for (let i = 0; i <= tokens.length - len; i++) {
      const slice = tokens.slice(i, i + len);
      if (slice.every((t) => t.consumed)) continue;
      const candidate = slice.map((t) => t.text).join(" ");
      const iso2 = normalizeCountryToIso2(candidate);
      if (iso2) {
        out.push({ field: "identity.coo", value: iso2, confidence: len === 1 ? 0.9 : 0.95, reason: "country_token" });
        slice.forEach((t) => (t.consumed = true));
        return;
      }
    }
  }
}

function isLikelyGtin13(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(digits[i], 10);
    sum += i % 2 === 0 ? n : n * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[12], 10);
}

function detectGtin(tokens: Token[], out: ConcatExtraction[]) {
  for (const tok of tokens) {
    if (tok.consumed) continue;
    if (/^\d{8,16}$/.test(tok.text) && isLikelyGtin13(tok.text)) {
      out.push({ field: "identity.sku", value: tok.text, confidence: 0.95, reason: "gtin13" });
      tok.consumed = true;
      return;
    }
  }
}

const BATCH_PATTERN = /^B[0-9A-Z]{3,}$/i;

function detectBatch(tokens: Token[], out: ConcatExtraction[]) {
  for (const tok of tokens) {
    if (tok.consumed) continue;
    if (BATCH_PATTERN.test(tok.text)) {
      if (isAlphaNumericBatch(tok.text) && !hasUnitToken(tok.text)) {
        out.push({ field: "batch.batch_no", value: tok.text, confidence: 0.8, reason: "batch_pattern" });
        tok.consumed = true;
        return;
      } else {
        continue;
      }
    }
    if (/^(LOT|LOTNO|LOTNO\.|BNO|B\.NO|B-NO|B\/NO|BATCHNO|BATCH NO)$/i.test(tok.text)) {
      const idx = tokens.indexOf(tok);
      const next = tokens[idx + 1];
      if (next && !next.consumed) {
        if (isAlphaNumericBatch(next.text) && !hasUnitToken(next.text)) {
          out.push({ field: "batch.batch_no", value: next.text, confidence: 0.75, reason: "batch_labeled" });
          tok.consumed = true;
          next.consumed = true;
          return;
        } else {
          // do not consume; leave in leftover
        }
      }
    }
  }
}

const DATE_PATTERN = /^(\d{2}[\/-]\d{2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;

function detectExpiry(tokens: Token[], out: ConcatExtraction[]) {
  const isDateToken = (text: string) => DATE_PATTERN.test(text.trim());
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.consumed) continue;
    if (isDateToken(tok.text)) {
      out.push({ field: "batch.expiry_date", value: tok.text, confidence: 0.8, reason: "date_token" });
      tok.consumed = true;
      return;
    }
    if (/^exp[:]?$/i.test(tok.upper)) {
      const next = tokens[i + 1];
      if (next && !next.consumed && isDateToken(next.text)) {
        out.push({ field: "batch.expiry_date", value: next.text, confidence: 0.8, reason: "exp_label" });
        tok.consumed = true;
        next.consumed = true;
        return;
      }
    }
  }
}

const MANUF_HINTS = [
  "PHARMA","PHARMACEUTICAL","PHARMACEUTICALS","LABS","LABORATORIES","INDUSTRIES","INDUSTRY","MANUFACTURING","MANUFACTURER",
  "HEALTHCARE","BIOTECH","MED","MEDICA","MEDICINES","DRUG","PLC","LTD","LIMITED","INC","GMBH","S.A.","S.P.A.","AG"
];

function detectManufacturerHint(raw: string, out: ConcatExtraction[]) {
  const text = String(raw ?? "");
  const segments = text.split(/[;|,]+|\s+-\s+|\s•\s/).map((s)=>s.trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const upper = seg.toUpperCase();
    const hasHint = MANUF_HINTS.some((h)=> upper.includes(h));
    if (hasHint && !hasUnitToken(seg) && (!hasDigit(seg) || isAllowedNumericManufCell(seg))) {
      out.push({ field: "product.manufacturer_name", value: seg, confidence: 0.75, reason: "manufacturer_hint_tail" });
      return;
    }
  }
}

function detectBrandHead(raw: string, out: ConcatExtraction[]) {
  const s = String(raw ?? "");
  if (!s.trim()) return;
  const upper = s.toUpperCase();
  // Heuristic: take head segment before a known generic token occurrence
  // Use a conservative split by dash/comma and whitespace blocks
  const head = s.split(/[;|,]+|\s+-\s+/)[0]?.trim() ?? "";
  if (!head) return;
  if (head.length > 40) return;
  const split = splitNameGenericStrengthForm(s);
  let candidate = head;
  if (split.strength) {
    const re = new RegExp(split.strength.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    candidate = candidate.replace(re, "").trim();
  }
  if (split.form) {
    const re = new RegExp(split.form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    candidate = candidate.replace(re, "").trim();
  }
  const parts = candidate.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return;
  // Prefer the first word as the brand head
  candidate = parts[0];
  if ((hasDigit(candidate) && !isAllowedNumericBrandCell(candidate)) || hasUnitToken(candidate)) return;
  // Avoid dosage form terms
  const hasFormWord = Object.keys(FORM_KEYWORDS).some((k)=> candidate.toUpperCase().includes(k));
  if (hasFormWord) return;
  out.push({ field: "product.brand_name", value: candidate, confidence: 0.6, reason: "brand_head_heuristic" });
}

const MANUF_MARKERS = ["MFG BY", "MFD BY", "MANUFACTURED BY", "MARKETED BY"];

function detectManufacturer(raw: string, out: ConcatExtraction[]) {
  const upper = raw.toUpperCase();
  let idx = -1;
  let marker = "";
  for (const m of MANUF_MARKERS) {
    const pos = upper.indexOf(m);
    if (pos !== -1 && (idx === -1 || pos < idx)) { idx = pos; marker = m; }
  }
  if (idx === -1) {
    const pos = upper.indexOf(" BY ");
    if (pos !== -1 && pos < upper.length - 5) { idx = pos; marker = " BY "; }
  }
  if (idx === -1) return;
  const after = raw.slice(idx + marker.length).trim();
  if (!after || after.length < 3) return;
  if (!hasUnitToken(after) && (!hasDigit(after) || isAllowedNumericManufCell(after))) {
    out.push({ field: "product.manufacturer_name", value: after, confidence: 0.8, reason: "manufacturer_phrase" });
  }
}

/**
 * Opportunistic acceptance gate: require strong structural signals and avoid formula-like text.
 * Rules: strength must be present AND total signals ≥ 3 across {form, pack, coo, sku, batch}.
 * Leftover text must not be formula-like.
 * Signed: EyosiyasJ
 */
function opportunisticAccept(raw: string, ex: ConcatExtraction[], leftover: string, minSignals: number): boolean {
  const hasStrength = ex.some((e) => e.field === "product.strength");
  const additionalSignals = [
    ex.some((e) => e.field === "product.form"),
    ex.some((e) => e.field === "pkg.pieces_per_unit"),
    ex.some((e) => e.field === "identity.coo"),
    ex.some((e) => e.field === "identity.sku"),
    ex.some((e) => e.field === "batch.batch_no"),
  ].filter(Boolean).length;
  if (!hasStrength) return false;
  if (additionalSignals < Math.max(0, (minSignals - 1))) return false;
  if (looksFormulaLike(raw) || looksFormulaLike(leftover)) return false;
  return true;
}

function looksFormulaLike(s: string): boolean {
  const t = String(s ?? "").toLowerCase();
  if (!t.trim()) return false;
  const sepCount = (t.match(/[,+&]/g) || []).length + (t.includes(" and ") ? 1 : 0);
  const hasUnit = /\b\d+(?:\.\d+)?\s*(mg|mcg|g|kg|iu|ml|l|%)\b/.test(t) || /\b\d+(?:\.\d+)?\s*(mg|mcg|g|kg|ml|l)\s*\/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|kg|ml|l)\b/.test(t);
  const hasPack = /(\b\d+\s*[xX]\s*\d+|\b\d+\s*(?:'s|pcs|pieces|tabs|caps)\b)/.test(t);
  const words = t.split(/[^a-z]+/).filter(Boolean);
  const longWords = words.filter((w) => w.length >= 6).length;
  return sepCount >= 1 && !hasUnit && !hasPack && longWords >= 2;
}
