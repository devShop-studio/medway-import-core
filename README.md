# @medway/import-core

Lightweight, browser/RN-safe core for parsing MedWay stock import files (XLSX and CSV) and producing a canonical product payload with detailed row errors and metadata.

## Installation

Using a git tag:

```
"@medway/import-core": "git+ssh://git@github.com/devShop-studio/medway-import-core.git#v0.1.1"
```

Build locally:

```
pnpm install  # or npm/yarn
pnpm run build
```

## Public API

- `parseProductsFileFromBuffer(fileBytes, filename, options?): Promise<ParsedImportResult>`
  - `fileBytes`: `ArrayBuffer` of the selected file
  - `filename`: original filename to detect extension
  - `options`: `{ mode?: "fast"|"deep", validationMode?: "full"|"errorsOnly"|"none" }`
  - Returns `{ rows: CanonicalProduct[], errors: ParsedRowError[], meta: {...} }`
  - Meta includes: `sourceSchema`, `headerMode`, `requiredFields`, `analysisMode`, `sampleSize`, `concatMode`, `validationMode`, `engineVersion`, `concatenatedColumns`, `dirtyColumns`, `decomposedColumns`, and `columnGuesses` (headerless only).

Types are exported from `./types`.

## Usage: Web

```
import { parseProductsFileFromBuffer } from "@medway/import-core";

async function handleFile(file: File) {
  const bytes = await file.arrayBuffer();
  const result = await parseProductsFileFromBuffer(bytes, file.name);
  console.log(result.rows, result.errors, result.meta);
}
```

## Usage: React Native / Expo

```
import { parseProductsFileFromBuffer } from "@medway/import-core";
import * as DocumentPicker from "expo-document-picker";

async function handleImport() {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  });
  if (res.canceled || !res.assets?.[0]) return;

  const asset = res.assets[0];
  const bytes = await fetch(asset.uri).then((r) => r.arrayBuffer());
  const result = await parseProductsFileFromBuffer(bytes, asset.name);
  console.log(result);
}
```

## Notes

- ESM-only build (`type: module`) for modern bundlers and Metro; no Node-only APIs.
- XLSX parsing uses `xlsx` in array mode (`type: "array"`), no `fs` usage.
- CSV parsing is a small, dependency-free parser.
 - Header semantics: generic CSVs are mapped via a synonyms + type-aware matcher. You can inspect suggested mappings by importing `suggestHeaderMappings`.

## Changes (documentation)

- Added `.gitignore` for `node_modules`, lockfiles, debug logs, `.DS_Store`.
- Updated `package.json` with `files` and `devDependencies.typescript`.
- Made `tsconfig.json` standalone and strict.
- Relaxed identity validation: only validate identity codes when provided, and treat identity errors as non-fatal; `coo` issues reported under `identity.coo`.
- Added CLI tester: `npm run parse-file <path>` prints schema, counts, sample rows, and errors.
- Added minimal tests: `npm test` runs CSV and XLSX template fixtures to prevent regressions.
- Added header semantics module to improve generic CSV mapping using synonyms and data type checks.
- Updated row contract: any non-empty input row appears in preview; missing product name no longer drops the row. Instead an error `E_PRODUCT_NAME_REQUIRED` is attached. Only fully blank rows are dropped.
- Promoted additional fields to canonical and mapping: `brand_name`, `requires_prescription`, `is_controlled`, `storage_conditions`, `description`, and packaging (`purchase_unit`, `pieces_per_unit`, `unit`).
- CLI now shows header-to-canonical mapping with confidence and debug lists of kept/dropped indices.
- Required vs optional fields:
  - Required (blocking if missing/invalid): `product.generic_name`, `product.strength`, `product.form`, `product.category`, `batch.expiry_date`, `pkg.pieces_per_unit`, `identity.coo`, `batch.on_hand`.
  - Optional: `brand_name`, `batch.batch_no`, `batch.unit_price`, `identity.sku`, `requires_prescription`, `is_controlled`, `storage_conditions`, `description`, `purchase_unit`, `unit`, `reserved`.
- Error codes for required fields added: `E_REQUIRED_GENERIC_NAME`, `E_REQUIRED_STRENGTH`, `E_REQUIRED_FORM`, `E_REQUIRED_CATEGORY`, `E_REQUIRED_EXPIRY`, `E_REQUIRED_PACK_CONTENTS`, `E_REQUIRED_COO`, `E_REQUIRED_QUANTITY`.
- Header detection: the first row is scored as header-like vs data-like. If data signals dominate (dates, numeric values, strength patterns, country names) the file is treated as headerless (`meta.headerMode = "none"`) and column guesses are produced. If header tokens and short labels dominate, it is treated as headers.
- Fallback policy: headers are preferred when detection is ambiguous; headerless mapping is applied when the first row is data-like or header-based parsing yields zero rows. `meta.headerMode`, `meta.columnGuesses`, and `meta.requiredFields` are exposed.

### Heuristic Improvements (Headerless)
- GTIN detection: columns that are ≥60% and typically ≥90% 13-digit numeric are classified as `identity.sku` with high confidence; `on_hand` and `generic_name` guesses are suppressed for those columns. See `inferHeaderlessAssignments` and `inferHeaderlessGuesses` in `src/schema.ts`.
- Purchase unit mapping: columns with values from `{box,bottle,strip,vial,ampoule,device}` are mapped to `identity.purchase_unit`.
- Prescription mapping: columns containing `{RX,OTC}` (case-insensitive) are mapped to `product.requires_prescription`; sanitizer accepts these tokens.
- CLI polish: when `meta.headerMode = "none"`, the CLI suppresses `headerMappings` and prints only `columnGuesses`.

### Category Classification
- A simple scoring library assigns an umbrella therapeutic category from `generic_name`, `brand_name`, `category`, `description`.
- Scoring uses weighted positives and negatives: +3 if `category` hits cluster keywords; +2 if `generic`/`brand` hits known molecules; +1 for description hits; device keywords boost MISC (+4) and others (+2); negative keywords subtract with guardrails. Minimum score and separation required.
- Result is placed at `product.umbrella_category` when score ≥ 2.

#### Codes Mapping
- Added 3-letter therapeutic code → umbrella mapping used to override classification when `identity.cat` is present.
- Supported codes: `ANT`, `CVS`, `RES`, `CNS`, `ANE`, `MSK`, `OPH`, `HEM`, `END`, `VAC`, `IMM`, `DER`, `VIT`, `OBG`, `BPH`, `FER`, `ONC`, `ENT`, `GIT`, `SIG`, `TOX`, `RCM`, `MSC`.
- Example: `ONC` → `ANTINEOPLASTICS_SUPPORT`, `HEM` → `BLOOD`, `GIT` → `GASTROINTESTINAL`.
- Classification now prefers the code when provided; otherwise falls back to text scoring with guardrails.

#### Consolidation
- Consolidated category logic into `src/category.ts` and removed duplicate `dist/catefory.ts` without losing functionality. The source file now contains:
  - Weighted scoring with guardrails
  - Optional negative keyword support
  - Code → umbrella mapping (`mapCategoryCodeToUmbrella`)
  - O(1) index (`UMBRELLA_CATEGORY_INDEX`)
### Template v3 (Products sheet) Mapping
- Exact headers recognized with confidence 1.0 via semantics: `Generic (International Name)`, `Strength`, `Dosage Form`, `Product Category`, `Expiry Date`, `Pack Contents`, `Batch / Lot Number`, `Item Quantity`, `Unit Price`, `Country of Manufacture`, `Serial Number`, `Brand Name`, `Manufacturer`, `Notes`.
- Mapped to canonical: `product.generic_name` (required), `product.strength` (required), `product.form` (required), `product.category` (required), `batch.expiry_date` (required), `pkg.pieces_per_unit` (required), `batch.batch_no`, `batch.on_hand` (required), `batch.unit_price`, `identity.coo` (required), `identity.sku`, `product.brand_name`, `product.manufacturer_name`, `product.description`.
- Country names are fuzzily normalized to ISO‑2 before validation (e.g., “United States”→`US`, “UK”→`GB`).

### 2025-11-19 – Country Normalizer + Expiry Parser (EyosiyasJ)

- Expanded country alias map to 30+ common variants (e.g., `U.S.A`→`US`, `Bharat`→`IN`, `UAE`→`AE`, `KSA`→`SA`, `Ivory Coast`/`Cote d Ivoire`→`CI`, `Türkiye`→`TR`, `Holland`→`NL`).
- Kept bundler/RN safety by registering `i18n-iso-countries` English locale via dynamic JSON import with a safe fallback when import assertions are unavailable.
- Implemented flexible expiry parsing for `MMM-YY`, `MMM YYYY`, `MM-YY`, `MM/YYYY` formats, converting to a deterministic ISO date (last day of month).
- Added unit tests for `normalizeCountryToIso2` and flexible expiry parsing in `tests/run-tests.mjs`.
- No UI or styling changes; follows established patterns and includes function‑level comments.

### 2025-11-19 – Concatenation Splitter Mode (EyosiyasJ)

- Renamed `legacy_items` to `concat_items` (kept `legacy_items` as alias).
- Introduced a generic concatenation decomposer (`src/concatDecompose.ts`) to peel out strength, form, pack, country, GTIN, batch, and manufacturer from concatenated cells.
- Universal integration detects likely concatenated columns and runs a pre-sanitize decomposition pass; exposes `meta.concatenatedColumns` with indices and reasons.
- Removed 3-letter category code detection from the decomposer to avoid overfitting.

#### CLI Cheat Sheet (Concat Mode)
- Use `npm run parse-file <path>` to inspect results quickly.
- Look for:
  - `schema:` → should show `concat_items` when Items.xlsx-like headers are used; alias `legacy_items` still recognized.
  - `concatenatedColumns:` in meta → indices of columns treated as “mushed” with a short reason.
  - `sampleRows:` → verify decomposed fields like `product.strength`, `product.form`, `pkg.pieces_per_unit`, `identity.coo`, `batch.batch_no`, `product.manufacturer_name` are populated.
- If required fields are still missing after decomposition, rows will carry `E_REQUIRED_*` errors. Review these to decide whether to accept or fix the source file.

Signed: EyosiyasJ

### 2025-11-19 – Concatenated Column Decision Tree (EyosiyasJ)
- Header trust: headers are scored and only treated as “known” when confidence ≥ `0.8`. Weak labels (e.g., `Name`) are treated as headerless columns for content-driven parsing.
- Concat-prone detection: columns are flagged as concatenated when, across a sample of rows, ≥70% contain at least two signals among strength, form, pack, country, GTIN, batch; formula-like lists without numeric+unit are excluded.
- Atomic fields are skipped: GTIN, price, quantity, expiry, COO, and SKU-like codes are never treated as concatenated.
- Pipeline overlay: when a column is flagged, decomposition is applied before sanitization, and extractions fill empty canonical fields only. Leftover text is used as `product.generic_name` if still empty.

#### Row-level Opportunistic Decomposer
- Applies per cell on `product.generic_name`, `product.brand_name`, `product.description` even when a column was not flagged.
- Acceptance gate requires: strength present AND at least two of {form, pack, COO, GTIN, batch} (≥3 total signals), and leftover not formula-like.
- Fills only empty fields; leftover appended to `product.description` when `generic_name` already populated.
- References: `src/concatDecompose.ts:decomposeConcatenatedCell(mode='opportunistic')`, `src/parseProductsCore.ts` row-level pass.

### 2025-11-19 – Name Column minSignals Tuning (EyosiyasJ)
- To address mixed `Name` columns in `Items.xlsx`, opportunistic decomposition now uses `minSignals: 2` on `product.generic_name` only. Other targets remain at `minSignals: 3`.
- This lowers the acceptance bar just for the `Name` field to split embedded strength/form/pack reliably while preserving strictness for `brand_name` and `description`.
- Implementation: `src/parseProductsCore.ts:64-81` passes `{ mode: 'opportunistic', minSignals: 2 }` for `product.generic_name` and `{ minSignals: 3 }` otherwise.
- If a dataset still fails to split valid entries, consider temporarily raising form keywords or pack patterns; avoid adding category-code detectors.

### 2025-11-19 – Test Output Prints 14 Mapped Fields (EyosiyasJ)
- After tests complete, the runner prints the 14 canonical fields mapped by Template v3 and concat mode for quick verification:
  - `product.generic_name`, `product.strength`, `product.form`, `product.category`,
  - `batch.expiry_date`, `pkg.pieces_per_unit`, `batch.batch_no`, `batch.on_hand`, `batch.unit_price`,
  - `identity.coo`, `identity.sku`, `product.brand_name`, `product.manufacturer_name`, `product.description`.
- Reference: `tests/run-tests.mjs` final output section.

### 2025-11-19 – Test Output Prints Parsed Items Preview (EyosiyasJ)
- The test runner now prints a parsed items preview after completion. For `Items.xlsx`, the first 20 canonical rows are output as JSON with the 14 key fields for quick eyeballing.
- This helps confirm that concatenated fields were split into canonical values (e.g., strength/form/pack/COO) and that sanitized rows are present.
- Reference: `tests/run-tests.mjs` – look for `Parsed Items Preview:` in the final output.

### 2025-11-19 – Pattern-Driven Name Splitter (EyosiyasJ)
- Added a strict, right-sided splitter `splitNameGenericStrengthForm` for `Name` cells to peel out `generic_name`, full strength tokens (e.g., `125mg/5ml`, `1%`), and normalized `form`.
- Form detection uses a trailing form dictionary (hyphen or space-suffix) and maps to existing sanitize forms (`tablet`, `capsule`, `syrup`, `cream`, `ointment`, `gel`, `drops`, `spray`, `lotion`, `patch`, `suspension`, `solution`, `inhaler`, `powder`, `other`).
- Strength detection captures the last numeric+unit block including ratios and `% w/w`; normalization removes extra hyphens and `%w/w` → `%` for sanitizer compatibility.
- Integration points:
  - `src/parseProductsCore.ts`: applies the splitter on raw `Name` column and on `product.generic_name` before opportunistic decomposition.
  - `src/concatDecompose.ts`: provides `splitNameGenericStrengthForm` and keeps universal detectors for other fields.
- Result: reduces `E_REQUIRED_STRENGTH` and `E_FORM_MISSING` on `Items.xlsx` while preserving formula-like generics.

### 2025-11-20 – Name Pre-Split Cleanup + Opportunistic Routing Fix (EyosiyasJ)
- Cleaned `generic_name` artifacts like trailing `-0`, `-1-`, `-0.64-` by trimming strength-prefix fragments during split and by forcing a safe override when an initial `generic_name` equals the raw `Name` cell or matches hyphen-digit patterns.
- Applied a dedicated pre-split on the `Name` column before concat decomposition; strength and form are merged only if empty to follow established patterns.
- Prevented opportunistic leftover from overwriting `product.generic_name` by avoiding replacement when the source equals the current generic; leftovers now append to `product.description` instead.
- References: `src/concatDecompose.ts:191-197`, `src/parseProductsCore.ts:81-93`, `src/parseProductsCore.ts:143-152`.
- Outcome: preview rows from `Items.xlsx` now show clean `generic_name` values (e.g., `MOMETASONE FUROATE`, `GENTAMICIN`) while preserving extracted `strength` and normalized `form`.

Signed: EyosiyasJ

### 2025-11-20 – Formal Form Identifier + "No Digits" Rule (EyosiyasJ)
- Added a formal form identifier layer (dictionary + matcher) as an anchor for concatenated text across any column.
  - Dictionary covers core forms and multi-word variants: `tablet` (incl. `effervescent tablets`, `film-coated tablet`, `chewable tablet`), `capsule`, `syrup`, `suspension` (`powder for suspension`), `cream`, `gel`, `ointment`, `drops` (`eye/ear drop(s)`), `injection` (`inj./injection`), `inhaler` (`aerosol`, `suspension for inhalation`, `puffer`), plus conservative `other` bucket (`shampoo`, `plaster`, `sachet`, `suppository`, `pregnancy test`, `test`).
  - Used as a tail-phrase anchor in `splitNameGenericStrengthForm` and decomposition; prefers longest phrase matches to avoid partial anchors (e.g., `effervescent tablets` over `tablets`).
  - Guardrails: variants under `other` only anchor when dose signals are present to avoid misclassifying devices (e.g., `adhesive plaster`, `pregnancy test`).
- Enforced a "no digits allowed" rule for text-only fields during validation:
  - Flags suspicious digits/units in `manufacturer` and `category` with `E_TEXT_DIGITS_SUSPECT` (warn)
  - Also flags `form` containing digits/units (warn) and raw `country (COO)` values containing digits (warn)
- References: `src/concatDecompose.ts:204-265` (dictionary + matcher), `src/concatDecompose.ts:104-116` (anchor in splitter), `src/sanitize.ts:302-309,314-318` (warnings).
- Outcome: more deterministic form extraction in messy text (including non-Name columns) and cleaner separation between dose tokens and label-like fields.

### 2025-11-20 – Schema‑Aware Validation (concat_items best‑effort) (EyosiyasJ)
- Added schema‑specific validation profile for `schema: concat_items` (POS‑style dumps):
  - When no dose signal is present (no `strength`), only `product.generic_name` is required.
  - When dose signal is present, full strictness applies (strength, form, expiry, COO, pack contents, quantity).
  - Suppressed `E_TEXT_DIGITS_SUSPECT` warnings for `product.category` in `concat_items` because this column often carries numeric IDs.
- Exposed schema‑aware required fields in `meta.requiredFields`:
  - `concat_items`: `["product.generic_name"]`
  - others: full list `[generic_name, strength, form, category, batch.expiry_date, pkg.pieces_per_unit, identity.coo, batch.on_hand]`.
- References: `src/sanitize.ts:509–655` (schema‑aware requiredness), `src/parseProductsCore.ts:171` (pass `sourceSchema`), `src/index.ts:45–56` (meta.requiredFields).
- Outcome: Items.xlsx imports are still parsed and decomposed correctly, but low‑signal device/inventory rows no longer produce a wall of blocking errors.

### 2025-11-20 – Analysis Mode (fast vs deep) (EyosiyasJ)
- Added global `AnalysisMode` with options `{ fast, deep }` influencing sampling size for upfront analysis only.
- Fast mode samples up to 32 rows; deep mode samples 64–256 rows or 25% of file.
- Detection affected: headerless mapping, concatenation column detection, and concat mode selection.
- Per-row logic unchanged: splitting, decomposition, and validation are identical regardless of mode.
- Exposed in meta: `analysisMode`, `sampleSize`, and `concatMode` (`none | name_only | full`).
- CLI: `node scripts/parse-file.mjs <file> --mode fast|deep` or `--deep` shorthand; prints analysis details.
- References: `src/types.ts` (AnalysisMode, ParseOptions, meta fields), `src/index.ts` (options passthrough), `src/parseProductsCore.ts` (sampling + concatMode), `scripts/parse-file.mjs` (CLI flags).

### 2025-11-20 – Column Hygiene Scan (EyosiyasJ)
- Added a lightweight sampling-based column hygiene classifier to avoid heavy decomposition on clean columns.
- Classifies columns into numeric/ID vs dirty free-text using unit tokens, form words and basic text heuristics.
- In `concatMode=full`, heavy decomposition runs only on dirty columns; numeric/ID columns are skipped.
- References: `src/parseProductsCore.ts:55–117` (setup), `src/parseProductsCore.ts:145–174` (dirty gating).

### 2025-11-20 – Validation Mode (optional ingest speed) (EyosiyasJ)
- Added `ValidationMode` with options `{ full, errorsOnly, none }`.
- `full`: current behaviour, includes hygiene warnings and all validations.
- `errorsOnly`: filters out warning-level hygiene issues; only hard errors are returned.
- `none`: mapping + decomposition only; validation errors suppressed (rows still normalized). Default mode is `full`.
- Exposed in meta as `validationMode`; passed via `ParseOptions.validationMode`.
- References: `src/types.ts` (ValidationMode), `src/sanitize.ts` (mode-aware filtering), `src/parseProductsCore.ts` (propagate to meta).

References
- `src/schema.ts:isHeaderTrusted` and `inferConcatenatedColumns` implement header trust and column-level concat detection.
- `src/parseProductsCore.ts:42-56` applies the pre-sanitize concat overlay for flagged columns.
- `src/concatDecompose.ts` provides `decomposeConcatenatedCell` used by detection and overlay.

Thresholds
- Header trust threshold: `0.8`.
- Concatenation coverage: `≥70%` of sampled non-empty cells have ≥2 signals.
- Formula-like exclusion: formula-rate must be `≤30%`.
### API Reference

- `parseProductsFileFromBuffer(bytes, name, options?)`
  - Detects schema (`template_v3 | concat_items | csv_generic | unknown`), headers vs headerless, and concatenation mode.

### 2025-11-20 – Category & Field Guardrails (EyosiyasJ)
- Umbrella category: when a category signal exists (`product.category` or `identity.cat`) but cannot be mapped to one of the 23 umbrella categories, the parser now sets `product.category = "NA"` and does not attach an error. This replaces the previous `E_UMBRELLA_NOT_FOUND` emission.
- Numeric exclusion:
  - `product.form`: rejects purely numeric values with `E_FORM_NUMERIC`.
  - `product.category`: rejects purely numeric values with `E_CATEGORY_NUMERIC`.
  - `identity.coo`/`batch.coo`: flags purely numeric values with `E_COO_NUMERIC`; ISO‑2 validation still applies.
- Batch rule: `batch.batch_no` must contain both letters and digits; otherwise `E_BATCH_ALPHA_NUM_MIX` is returned. Cleaning and truncation still apply.
- Parser routing: leftover text from columns mapped as `product.category` no longer populates `product.generic_name`. Category and form remain isolated and are not linked to other name fields.
- Follows existing patterns: validations live in `src/sanitize.ts`, parser routing in `src/parseProductsCore.ts`, umbrella logic in `src/category.ts`.

### 2025-11-20 – 3‑Letter Code → Full Umbrella Label (EyosiyasJ)
- When `identity.cat` contains a valid 3‑letter therapeutic code, the engine now maps it to an umbrella ID and sets `product.category` to the umbrella’s human‑readable label (e.g., `CVS` → `Cardiovascular (CVS)`). `product.umbrella_category` continues to hold the umbrella ID.
- Reference: `src/sanitize.ts` (label assignment via `UMBRELLA_CATEGORY_INDEX`).

### 2025-11-20 – Universal NA Fallback for Empty Text Fields (EyosiyasJ)
- For empty text fields, the canonical output now uses `"NA"` instead of returning empty strings or implicit “other”. Applied to:
  - `product.brand_name`, `product.manufacturer_name`, `product.form`, `product.category`, `product.storage_conditions`, `product.description`, and `batch.batch_no`.
- Required‑field validations remain unchanged and still error when missing; `NA` is applied after validation so UI can display placeholders without masking errors.


### 2025-11-20 – Test Fixtures, Bench, and Packaging Smoke (EyosiyasJ)
- Added fixture generator `tests/generate-fixtures.mjs` producing:
  - `template_clean.xlsx`, `devices_only.xlsx`, `headerless_pos.xlsx`, `garbage.xlsx`, `BigItems.xlsx`
- Extended `tests/run-tests.mjs` with golden expectations and invariants:
  - Fast vs Deep rows identical; meta differs by `sampleSize`
  - ValidationMode ordering (`full ≥ errorsOnly ≥ none`), mapping unchanged
  - Devices-only relaxed requiredness (no `strength/form/expiry/COO` blockers)
  - Headerless POS detection and concatenation meta present
- Performance bench `bench.mjs` logs rows/errors/ms and ms/row on `BigItems.xlsx`.
- Packaging smoke `tests/smoke-pack.mjs` packs the library, installs into a temp project, and runs a parse.
- How to run:
  - `node tests/generate-fixtures.mjs`
  - `pnpm run test`
  - `node bench.mjs`
  - `node tests/smoke-pack.mjs`

  - Analysis `mode` affects sampling for detection only; per-row logic is identical.
  - `validationMode` controls error verbosity and performance.
- `parseProductsCore(input)`
  - Internal pipeline that applies headerless assignments, pre-sanitize concatenation overlay, opportunistic decomposition, and schema-aware validation.
- `readXlsxToRows(bytes)`
  - Parses the workbook and extracts `__meta` (`template_version`, `header_checksum`).
- `parseCsvRaw(text)`, `detectHeaderMode(rows)`, `buildRawRows(rows, mode)`
  - Helpers for CSV dual-path parsing and header detection.
- `inferHeaderlessGuesses(rows)`
  - Produces candidates and confidence for UI debugging in headerless mode.
- `sanitizeCanonicalRow(row, idx, schema?, validationMode?)`
  - Normalizes and validates a row with schema-aware requiredness and mode filtering.

Signed: EyosiyasJ

### 2025-11-20 – Function & Module Documentation Pass (EyosiyasJ)
- Added function‑level JSDoc to entry API, core pipeline, CSV/XLSX helpers, schema detectors, and sanitizers.
- Introduced module‑level headers explaining purpose, behavior, and design decisions for key files (`src/index.ts`, `src/parseProductsCore.ts`, `src/csv.ts`, `src/xlsx.ts`, `src/schema.ts`, `src/sanitize.ts`, `src/concatDecompose.ts`).
- Expanded Public API section with options (`AnalysisMode`, `ValidationMode`) and comprehensive meta fields reference.
- Aligns with established patterns and keeps bundler/RN safety. No UI/styling changes.

References
- Entry: `src/index.ts:13-40`
- Core: `src/parseProductsCore.ts:30-43`
- CSV: `src/csv.ts:3-7`, `src/csv.ts:68-74`, `src/csv.ts:137-142`, `src/csv.ts:191-214`
- XLSX: `src/xlsx.ts:4-13`, `src/xlsx.ts:33-38`, `src/xlsx.ts:40-58`
- Schema: `src/schema.ts:327-361`, `src/schema.ts:363-385`, `src/schema.ts:569-577`, `src/schema.ts:679-687`, `src/schema.ts:862-908`
- Sanitizers: `src/sanitize.ts:12-21`, `src/sanitize.ts:518-526`

Signed: EyosiyasJ