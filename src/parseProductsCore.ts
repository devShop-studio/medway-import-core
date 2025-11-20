import { RawRow } from "./csv.js";
import {
  detectSourceSchema,
  mapRawRowToCanonical,
  inferHeaderlessAssignments,
  inferConcatenatedColumns,
} from "./schema.js";
import { sanitizeCanonicalRow } from "./sanitize.js";
import { decomposeConcatenatedCell, splitNameGenericStrengthForm } from "./concatDecompose.js";
import { suggestHeaderMappings, type CanonicalKey } from "./semantics.js";
import {
  CanonicalProduct,
  ParsedImportResult,
  ParsedRowError,
  SourceSchema,
} from "./types.js";
import type { AnalysisMode, ParseOptions } from "./types.js";
import { ENGINE_VERSION } from "./types.js";

interface ParseProductsCoreInput {
  rows: RawRow[];
  filename: string;
  headerMeta?: {
    templateVersion?: string;
    headerChecksum?: string;
  };
  options?: ParseOptions;
}

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
export function parseProductsCore(
  input: ParseProductsCoreInput
): ParsedImportResult {
  const { rows, headerMeta } = input;
  const mode: AnalysisMode = (input.options?.mode ?? "fast");
  const computeSampleSize = (total: number, m: AnalysisMode): number => {
    if (m === "fast") return Math.min(32, total);
    const byFraction = Math.ceil(total * 0.25);
    return Math.min(256, Math.max(64, byFraction));
  };
  const sampleSize = computeSampleSize(rows.length, mode);
  const sampleRows = rows.slice(0, sampleSize);

  const sourceSchema: SourceSchema = detectSourceSchema(rows, headerMeta);

  // Headerless detection via synthetic column keys
  const firstKeys = Object.keys(rows[0] || {});
  const isHeaderless = firstKeys.length > 0 && firstKeys.every((k) => /^col_\d+$/.test(k));
  const headerlessAssign = isHeaderless ? inferHeaderlessAssignments(sampleRows) : undefined;
  const concatColsSample = inferConcatenatedColumns(sampleRows);
  const DOSE_UNIT_RE = /(mg|mcg|g|ml|iu|%)/i;
  const FORM_WORDS = new Set([
    "tablet","tablets","tab","capsule","capsules","syrup","suspension","injection","cream","ointment","gel","drops","drop","spray","lotion","patch","solution","powder"
  ]);
  const classifyColumnHygiene = (keys: string[], samples: RawRow[]): Set<number> => {
    const dirty = new Set<number>();
    for (let colIdx = 0; colIdx < keys.length; colIdx++) {
      const k = keys[colIdx];
      let n = 0, numOnly = 0, idLike = 0, freeText = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i]?.[k];
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (!s) continue;
        n++;
        const isNum = /^[-+]?\d+(?:[.,]\d+)?$/.test(s);
        if (isNum) { numOnly++; continue; }
        const noSpace = !/\s/.test(s);
        const shortId = s.length <= 6 && noSpace && !DOSE_UNIT_RE.test(s);
        if (shortId) { idLike++; continue; }
        const tokens = s.toLowerCase().split(/[^a-z]+/).filter(Boolean);
        const hasFormWord = tokens.some((t) => FORM_WORDS.has(t));
        const looksCountry = /\b(ethiopia|india|germany|china|united states|united kingdom|france|italy|spain|kenya|south africa)\b/i.test(s);
        const hasUnitsOrSpaces = /\s/.test(s) || DOSE_UNIT_RE.test(s) || hasFormWord || looksCountry;
        if (hasUnitsOrSpaces) freeText++;
      }
      const freeRatio = n ? freeText / n : 0;
      const numRatio = n ? numOnly / n : 0;
      const idRatio = n ? idLike / n : 0;
      if (freeRatio >= 0.3 && numRatio < 0.8) dirty.add(colIdx);
    }
    return dirty;
  };
  const dirtyColumns = classifyColumnHygiene(firstKeys, sampleRows);
  const detectConcatMode = (): "none" | "name_only" | "full" => {
    if (concatColsSample.length) return "full";
    const nameKey = firstKeys.find((k) => k.toLowerCase() === "name");
    if (nameKey) {
      const vals: string[] = [];
      for (let i = 0; i < sampleRows.length; i++) {
        const v = sampleRows[i]?.[nameKey];
        if (v !== undefined && v !== null && String(v).trim() !== "") vals.push(String(v));
      }
      const hasDoseSignal = vals.some((s) => {
        const { extractions } = decomposeConcatenatedCell(String(s));
        return extractions.some((e) => e.field === "product.strength");
      });
      if (hasDoseSignal) return "name_only";
    }
    const anyDoseCell = (() => {
      for (const k of firstKeys) {
        for (let i = 0; i < sampleRows.length; i++) {
          const val = sampleRows[i]?.[k];
          if (val === undefined || val === null) continue;
          const s = String(val);
          if (!s.trim()) continue;
          const { extractions } = decomposeConcatenatedCell(s);
          const mixedDose = extractions.some((e) => e.field === "product.strength");
          if (mixedDose) return true;
        }
      }
      return false;
    })();
    if (anyDoseCell) return "name_only";
    return "none";
  };
  const concatMode = detectConcatMode();
  const headerHints = suggestHeaderMappings(firstKeys, rows.slice(0, Math.min(rows.length, 25)));
  const columnRemainderPaths = new Map<string, string | undefined>();
  for (const key of firstKeys) {
    let path: string | undefined;
    if (headerlessAssign?.[key]) {
      path = flatKeyToCanonicalPath(headerlessAssign[key]);
    } else {
      const hint = headerHints.find((h) => h.header === key);
      if (hint?.key && hint.confidence >= 0.65) {
        const flatKey = CANONICAL_KEY_TO_FLAT[hint.key];
        path = flatKeyToCanonicalPath(flatKey);
      }
    }
    if (!path) {
      const lower = key.toLowerCase();
      if (lower.includes("batch") || lower.includes("lot")) {
        path = "batch.batch_no";
      } else if (lower.includes("description") || lower.includes("notes")) {
        path = "product.description";
      }
    }
    columnRemainderPaths.set(key, path);
  }

  const canonicalRows: CanonicalProduct[] = [];
  const errors: ParsedRowError[] = [];
  let parsedRows = 0;
  const decomposedSet = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i];
    const mapped = mapRawRowToCanonical(rawRow, i + 2, sourceSchema, headerlessAssign);
    if (!mapped) continue;
    // Pre-sanitize concatenation pass: gated by concatMode
    try {
      // Name-only mode: split Name column only
      if (concatMode === "name_only" || concatMode === "full") {
        const nameRaw = String((rawRow as any)["Name"] ?? "").trim();
        if (nameRaw) {
          const parts = splitNameGenericStrengthForm(nameRaw);
          if (parts.generic_name) {
            const prod = (mapped.product ?? (mapped.product = { generic_name: "", strength: "", form: "", category: null }));
            const curr = String(prod.generic_name ?? "").trim();
            const shouldForce = !curr || curr === nameRaw || /-\s*\d+/.test(curr);
            if (shouldForce) prod.generic_name = parts.generic_name;
          }
          if (parts.strength) applyExtractionToCanonical(mapped, { field: "product.strength", value: parts.strength });
          if (parts.form) applyExtractionToCanonical(mapped, { field: "product.form", value: parts.form });
        }
      }
      // Full mode: run heavy concat decomposition on flagged columns and fallbacks
      if (concatMode === "full") {
        for (const cc of concatColsSample) {
          const key = firstKeys[cc.index];
          const cell = rawRow[key];
          if (cell === undefined || cell === null) continue;
          if (!dirtyColumns.has(cc.index)) continue;
          decomposedSet.add(cc.index);
          const { leftover, extractions } = decomposeConcatenatedCell(String(cell));
          for (const ex of extractions) applyExtractionToCanonical(mapped, ex, String(cell));
          if (leftover) {
            const targetPath = columnRemainderPaths.get(key);
            assignLeftoverText(mapped, targetPath, leftover, String(cell));
          }
        }
        const fallbackDescriptionColumns = firstKeys
          .map((key, index) => ({ key, index, path: columnRemainderPaths.get(key) }))
          .filter(
            (col) =>
              col.path === "product.description" && !concatColsSample.some((existing) => existing.index === col.index) && dirtyColumns.has(col.index)
          );
        for (const col of fallbackDescriptionColumns) {
          const cell = rawRow[col.key];
          if (cell === undefined || cell === null) continue;
          const parts = splitNameGenericStrengthForm(String(cell));
          if (parts.strength)
            applyExtractionToCanonical(mapped, { field: "product.strength", value: parts.strength }, String(cell));
          if (parts.form)
            applyExtractionToCanonical(mapped, { field: "product.form", value: parts.form }, String(cell));
          const descValue = parts.generic_name ?? parts.leftover ?? String(cell);
          assignLeftoverText(mapped, "product.description", descValue, String(cell));
        }
        // description fallback handled above; batch fallback handled outside to always run
        const opportunisticTargets: Array<{ path: string; value?: string | null }> = [
          { path: "product.generic_name", value: mapped.product?.generic_name },
          { path: "product.brand_name", value: mapped.product?.brand_name ?? undefined },
          { path: "product.description", value: mapped.product?.description ?? undefined },
        ];
        for (const t of opportunisticTargets) {
          const v = (typeof t.value === "string" ? t.value : undefined) ?? "";
          if (!v || !v.trim()) continue;
          if (t.path === "product.generic_name") {
            const parts = splitNameGenericStrengthForm(v);
            if (parts.generic_name) applyExtractionToCanonical(mapped, { field: "product.generic_name", value: parts.generic_name });
            if (parts.strength) applyExtractionToCanonical(mapped, { field: "product.strength", value: parts.strength });
            if (parts.form) applyExtractionToCanonical(mapped, { field: "product.form", value: parts.form });
          }
          const opportunisticMinSignals = t.path === "product.generic_name" || t.path === "product.description" ? 2 : 3;
          const { leftover, extractions } = decomposeConcatenatedCell(v, {
            mode: "opportunistic",
            minSignals: opportunisticMinSignals,
          });
          if (extractions.length) {
            for (const ex of extractions) applyExtractionToCanonical(mapped, ex, v);
          }
          if (leftover && leftover.trim()) {
            const sourceHint = t.path === "product.generic_name" ? undefined : v;
            assignLeftoverText(mapped, t.path, leftover, sourceHint);
          }
        }
      }
    } catch {}
    // Always run batch info fallback regardless of concatMode to honor header-independent extraction
    {
      const fallbackBatchColumns = firstKeys
        .map((key, index) => ({ key, index, path: columnRemainderPaths.get(key) }))
        .filter((col) => col.path === "batch.batch_no");
      for (const col of fallbackBatchColumns) {
        const cell = rawRow[col.key];
        if (cell === undefined || cell === null) continue;
        decomposedSet.add(col.index);
        const { extractions } = decomposeConcatenatedCell(String(cell));
        for (const ex of extractions) applyExtractionToCanonical(mapped, ex, String(cell));
      }
      const rawBatch = String(mapped.batch?.batch_no ?? "");
      if (rawBatch) {
        const m = rawBatch.match(/\bB[0-9A-Z]{3,}\b/i);
        if (m) {
          applyExtractionToCanonical(mapped, { field: "batch.batch_no", value: m[0].toUpperCase() }, rawBatch);
        }
      }
    }
    const { row, errors: rowErrors } = sanitizeCanonicalRow(mapped, i + 2, sourceSchema, input.options?.validationMode ?? "full");
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
      validationMode: input.options?.validationMode ?? "full",
      templateVersion: headerMeta?.templateVersion,
      headerChecksum: headerMeta?.headerChecksum,
      totalRows: rows.length,
      parsedRows,
      concatenatedColumns: concatColsSample,
      dirtyColumns: Array.from(dirtyColumns).map((idx) => ({ index: idx, header: firstKeys[idx] })),
      decomposedColumns: Array.from(decomposedSet).map((idx) => ({ index: idx, header: firstKeys[idx] })),
      engineVersion: ENGINE_VERSION,
    },
  };
}

function applyExtractionToCanonical(
  target: Partial<CanonicalProduct>,
  ex: { field: string; value: any },
  sourceValue?: string
) {
  // Apply a field extraction to the partial canonical row only when the target field is empty.
  // Supports nested paths like `product.generic_name` and `pkg.pieces_per_unit`.
  // Signed: EyosiyasJ
  const set = (obj: any, path: string[], value: any) => {
    let curr = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      curr[k] = curr[k] ?? {};
      curr = curr[k];
    }
    const last = path[path.length - 1];
    const existing = curr[last];
    const shouldReplace =
      sourceValue &&
      typeof existing === "string" &&
      existing.trim() === String(sourceValue).trim();
    const forceReplace =
      path.join(".") === "batch.batch_no" &&
      typeof existing === "string" &&
      /\b(LOT|EXP)\b|[\/:]/i.test(existing);
    if (
      existing === undefined ||
      existing === null ||
      (typeof existing === "string" && (existing.trim() === "" || shouldReplace || forceReplace))
    ) {
      curr[last] = value;
    }
  };
  const parts = ex.field.split(".");
  set(target, parts, ex.value);
}

const FLAT_KEY_TO_PATH: Record<string, string> = {
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
};

const CANONICAL_KEY_TO_FLAT: Partial<Record<CanonicalKey, keyof typeof FLAT_KEY_TO_PATH>> = {
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
};

const TEXTUAL_TARGETS = new Set([
  "product.generic_name",
  "product.description",
  "product.brand_name",
  "product.manufacturer_name",
  "product.category",
]);

function flatKeyToCanonicalPath(key?: keyof typeof FLAT_KEY_TO_PATH): string | undefined {
  if (!key) return undefined;
  return FLAT_KEY_TO_PATH[key];
}

function ensureProductContainer(target: Partial<CanonicalProduct>) {
  if (!target.product) {
    target.product = { generic_name: "", strength: "", form: "", category: null };
  }
  return target.product;
}

function assignLeftoverText(
  target: Partial<CanonicalProduct>,
  targetPath: string | undefined,
  raw: string,
  sourceValue?: string
) {
  const text = String(raw ?? "").trim();
  if (!text) return;
  const defaultRoute = () => {
    const prod = ensureProductContainer(target);
    const current = prod.generic_name ?? "";
    const shouldReplace = sourceValue && current && current.trim() === String(sourceValue).trim();
    if (!current.trim() || shouldReplace) {
      prod.generic_name = text;
    } else {
      const desc = (prod.description ?? "").trim();
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
      const shouldReplace = sourceValue && (prod.description ?? "").trim() === String(sourceValue).trim();
      prod.description = shouldReplace || !(prod.description ?? "").trim() ? text : `${prod.description} ${text}`;
      if (!prod.generic_name || !String(prod.generic_name).trim()) {
        prod.generic_name = text;
      }
      return;
    }
    case "product.brand_name": {
      const current = prod.brand_name ?? "";
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
      const current = prod.manufacturer_name ?? "";
      const shouldReplace = sourceValue && current && String(current).trim() === String(sourceValue).trim();
      if (!current || !String(current).trim() || shouldReplace) {
        prod.manufacturer_name = text;
      }
      if (!prod.generic_name || !String(prod.generic_name).trim()) {
        prod.generic_name = text;
      }
      return;
    }
    case "product.category": {
      const current = prod.category ?? "";
      const shouldReplace = sourceValue && current && String(current).trim() === String(sourceValue).trim();
      if (!current || !String(current).trim() || shouldReplace) {
        prod.category = text;
      }
      if (!prod.generic_name || !String(prod.generic_name).trim()) {
        prod.generic_name = text;
      }
      return;
    }
    case "product.generic_name":
    default:
      defaultRoute();
      return;
  }
}
