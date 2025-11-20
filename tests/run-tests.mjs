import assert from "assert";
import * as XLSX from "xlsx";
import { parseProductsFileFromBuffer } from "../dist/index.js";
import { normalizeCountryToIso2 } from "../dist/country.js";
import { sanitizeCanonicalRow } from "../dist/sanitize.js";
import fs from "fs";
import path from "path";
import { inferConcatenatedColumns } from "../dist/schema.js";
import { splitNameGenericStrengthForm } from "../dist/concatDecompose.js";
import { generateAll as generateFixtures } from "./generate-fixtures.mjs";

// Collect parsed item previews from fixtures for end-of-run display
const FIXTURE_PREVIEWS = [];

/**
 * Convert Node Buffer to ArrayBuffer
 */
function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * CSV basic mapping test
 */
async function testCsvBasic() {
  const csv = [
    "Generic (International Name),Strength,Dosage Form,Product Category,Expiry Date,Pack Contents,Batch / Lot Number,Item Quantity,Unit Price,Country of Manufacture,Serial Number",
    "Paracetamol,500mg,tablet,Analgesics,31/12/2099,30TAB,B123,100,12.5,India,SN001",
  ].join("\n");
  const bytes = new TextEncoder().encode(csv).buffer;
  const res = await parseProductsFileFromBuffer(bytes, "sample.csv");
  console.log("CsvBasic headerMode:", res.meta.headerMode);
  assert.equal(res.meta.sourceSchema, "csv_generic");
  assert.ok(res.meta.parsedRows >= 1);
  assert.ok(res.rows[0]);
  assert.equal(res.rows[0].product.generic_name, "Paracetamol");
  assert.equal(res.rows[0].product.form, "tablet");
}

/**
 * CSV headerless basic mapping test
 */
async function testCsvHeaderlessBasic() {
  const csv = [
    // No header row, data starts immediately
    "Paracetamol,500mg,tablet,Analgesics,31/12/2099,30TAB,B123,100,12.5,India,SN001",
    "Ibuprofen,200mg,tablet,Analgesics,31/12/2099,30TAB,B124,50,7.25,India,SN002",
  ].join("\n");
  const bytes = new TextEncoder().encode(csv).buffer;
  const res = await parseProductsFileFromBuffer(bytes, "noheader.csv");
  console.log("Headerless meta.headerMode:", res.meta.headerMode);
  assert.equal(res.meta.parsedRows, res.meta.totalRows);
}

/**
 * XLSX template v3 detection and mapping
 */
async function testXlsxTemplateV3() {
  const headers = [
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
  const data = [
    [
      "Paracetamol",
      "500mg",
      "tablet",
      "Analgesics",
      "31/12/2099",
      "30TAB",
      "B123",
      100,
      12.5,
      "India",
      "SN001",
      "BrandX",
      "MakerY",
      "",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const meta = XLSX.utils.aoa_to_sheet([
    ["template_version", "MedWay_Template_v3"],
    ["header_checksum", "b6ba6708"],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, "__meta");
  const u8 = XLSX.write(wb, { type: "array" });
  const res = await parseProductsFileFromBuffer(u8, "sample.xlsx");
  assert.equal(res.meta.sourceSchema, "template_v3");
  assert.equal(res.meta.parsedRows, 1);
  assert.equal(res.meta.templateVersion, "MedWay_Template_v3");
  assert.equal(res.meta.headerChecksum, "b6ba6708");
}

/**
 * Run local fixture files in ./testFiles
 */
async function testLocalFixtures() {
  const base = path.resolve("./testFiles");
  const files = [
    "Items.xlsx",
    "PlaceholderPharma_inventory.csv",
    "medway_bulk_correct_60.csv",
    "medway_bulk_with_errors_60.csv",
  ];
  for (const f of files) {
    const filePath = path.join(base, f);
    const buf = await fs.promises.readFile(filePath);
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await parseProductsFileFromBuffer(bytes, f);
    console.log(`Fixture ${f}: schema=${res.meta.sourceSchema} total=${res.meta.totalRows} parsed=${res.meta.parsedRows} errors=${res.errors.length}`);
    assert.ok(res.meta.totalRows >= 0);
    if (f === "medway_bulk_correct_60.csv") {
      assert.equal(res.meta.sourceSchema, "csv_generic");
      assert.equal(res.meta.parsedRows, 60);
    }
    if (f === "medway_bulk_with_errors_60.csv") {
      assert.equal(res.meta.sourceSchema, "csv_generic");
      assert.equal(res.meta.parsedRows, 60);
      assert.ok(res.errors.length >= 50);
    }
    if (f === "Items.xlsx") {
      assert.ok(["concat_items","legacy_items"].includes(res.meta.sourceSchema), `schema should be concat_items or legacy_items`);
      assert.ok(res.meta.parsedRows >= 50);
      FIXTURE_PREVIEWS.push({
        file: f,
        schema: res.meta.sourceSchema,
        totalRows: res.meta.totalRows,
        parsedRows: res.meta.parsedRows,
        items: res.rows.slice(0, 20).map((r) => projectToFourteen(r)),
      });
    }
  }
}

/**
 * Verify 3-letter therapeutic code overrides umbrella classification
 * Signed: EyosiyasJ
 */
async function testCategoryCodeOverride() {
  const csv = [
    // add `cat` to template-style headers so identity.cat is populated
    "Generic (International Name),Strength,Dosage Form,Product Category,Expiry Date,Pack Contents,Item Quantity,Unit Price,Country of Manufacture,Serial Number,cat",
    // minimal valid row with required fields and a code
    "Amoxicillin,500mg,capsule,Antibiotic,31/12/2099,30CAP,10,1.99,India,SN100,ANT",
  ].join("\n");
  const bytes = new TextEncoder().encode(csv).buffer;
  const res = await parseProductsFileFromBuffer(bytes, "codes.csv");
  assert.equal(res.meta.sourceSchema, "csv_generic");
  assert.equal(res.meta.parsedRows, 1);
  assert.equal(res.rows[0].product.umbrella_category, "ANTI_INFECTIVES");

  // Try another code (Respiratory)
  const csv2 = [
    "Generic (International Name),Strength,Dosage Form,Product Category,Expiry Date,Pack Contents,Item Quantity,Unit Price,Country of Manufacture,Serial Number,cat",
    "Salbutamol,2mg,syrup,Bronchodilator,31/12/2099,1BTL,5,4.50,India,SN101,RES",
  ].join("\n");
  const bytes2 = new TextEncoder().encode(csv2).buffer;
  const res2 = await parseProductsFileFromBuffer(bytes2, "codes2.csv");
  assert.equal(res2.rows[0].product.umbrella_category, "RESPIRATORY");

  // Signature (SIG) should map to SERA_IG as per mapping
  const csv3 = [
    "Generic (International Name),Strength,Dosage Form,Product Category,Expiry Date,Pack Contents,Item Quantity,Unit Price,Country of Manufacture,Serial Number,cat",
    "IVIG,10%,injection,Immunoglobulin,31/12/2099,1VIAL,2,100.00,India,SN102,SIG",
  ].join("\n");
  const bytes3 = new TextEncoder().encode(csv3).buffer;
  const res3 = await parseProductsFileFromBuffer(bytes3, "codes3.csv");
  assert.equal(res3.rows[0].product.umbrella_category, "SERA_IG");

  // RCM should map to RADIOCONTRAST
  const csv4 = [
    "Generic (International Name),Strength,Dosage Form,Product Category,Expiry Date,Pack Contents,Item Quantity,Unit Price,Country of Manufacture,Serial Number,cat",
    "Iohexol,300mg/ml,injection,Contrast Media,31/12/2099,1VIAL,1,50.00,India,SN103,RCM",
  ].join("\n");
  const bytes4 = new TextEncoder().encode(csv4).buffer;
  const res4 = await parseProductsFileFromBuffer(bytes4, "codes4.csv");
  assert.equal(res4.rows[0].product.umbrella_category, "RADIOCONTRAST");
}

/**
 * Run all tests and report
 */
async function run() {
  await generateFixtures();
  const tests = [
    testCsvBasic,
    testCsvHeaderlessBasic,
    testXlsxTemplateV3,
    testLocalFixtures,
    testCategoryCodeOverride,
    testCountryNormalizer,
    testExpiryFlexibleFormats,
    testSplitNameGenericStrengthForm,
    testConcatColumnDetector,
    testConcatColumnHeaderAgnostic,
    testColumnRemainderRouting,
    testBatchInfoDecomposition,
    testModesConsistency,
    testValidationModeBehaviour,
    testFastDeepMetaDiffers,
    testDevicesRelaxedValidation,
    testHeaderlessPosDetection,
    testGarbageNoCrash,
  ];
  for (const t of tests) {
    await t();
    console.log(`PASS: ${t.name}`);
  }
  console.log("All tests passed");
  // Print the 14 canonical fields mapped by Template v3 and concat mode for quick verification
  // Signed: EyosiyasJ
  const FIELDS_14 = [
    "product.generic_name",
    "product.strength",
    "product.form",
    "product.category",
    "batch.expiry_date",
    "pkg.pieces_per_unit",
    "batch.batch_no",
    "batch.on_hand",
    "batch.unit_price",
    "identity.coo",
    "identity.sku",
    "product.brand_name",
    "product.manufacturer_name",
    "product.description",
  ];
  console.log("Fields (14):");
  for (const f of FIELDS_14) console.log(` - ${f}`);
  printParsedItemsPreview();
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

/**
 * Project a canonical row to a plain object containing the 14 key fields.
 */
function projectToFourteen(row) {
  const prod = row.product || {};
  const batch = row.batch || {};
  const pkg = row.pkg || {};
  const identity = row.identity || {};
  const coo = batch.coo ?? identity.coo ?? null;
  return {
    generic_name: prod.generic_name ?? "",
    strength: prod.strength ?? "",
    form: prod.form ?? "",
    category: prod.category ?? null,
    expiry_date: batch.expiry_date ?? "",
    pieces_per_unit: pkg.pieces_per_unit ?? null,
    batch_no: batch.batch_no ?? "",
    on_hand: batch.on_hand ?? 0,
    unit_price: batch.unit_price ?? null,
    coo,
    sku: identity.sku ?? null,
    brand_name: prod.brand_name ?? null,
    manufacturer_name: prod.manufacturer_name ?? null,
    description: prod.description ?? null,
  };
}

/**
 * Print parsed item previews collected from fixtures.
 */
function printParsedItemsPreview() {
  if (!Array.isArray(FIXTURE_PREVIEWS) || !FIXTURE_PREVIEWS.length) return;
  console.log("Parsed Items Preview:");
  for (const p of FIXTURE_PREVIEWS) {
    console.log(`File: ${p.file} | schema=${p.schema} | total=${p.totalRows} | parsed=${p.parsedRows}`);
    console.log(JSON.stringify(p.items, null, 2));
  }
}

/**
 * Unit tests for splitNameGenericStrengthForm using provided cases.
 * Adjust expected form to our canonical mapping.
 */
async function testSplitNameGenericStrengthForm() {
  const canonForm = (f) => {
    if (!f) return f;
    const m = {
      "drop": "drops",
      "effervescent tablets": "tablet",
      "mouth wash": "solution",
      "powder for suspension": "suspension",
      "suspension for inhalation": "inhaler",
      "chewable tablet": "tablet",
      "suppositories": "other",
    };
    return (m[String(f).toLowerCase()] ?? String(f).toLowerCase());
  };

  const CASES = [
    { label: 'betametasone-cream-%', input: 'BETAMETASONE DIPROPIONATE -0.64-%-CREAM', generic: 'BETAMETASONE DIPROPIONATE', strength: '0.64%', form: 'cream' },
    { label: 'thermometer-device', input: 'THERMOMETER ---', generic: 'THERMOMETER', strength: null, form: null },
    { label: 'plain-generic-only', input: 'DIPHENHYDRAMINE', generic: 'DIPHENHYDRAMINE', strength: null, form: null },
    { label: 'acyclovir-syrup-no-strength', input: 'ACYCLOVIR SYRUP', generic: 'ACYCLOVIR', strength: null, form: 'syrup' },
    { label: 'dimenhydrinate-tablet', input: 'DIMENHYDRINATE -50-mg-TABLET', generic: 'DIMENHYDRINATE', strength: '50-mg', form: 'tablet' },
    { label: 'metronidazole-susp-125', input: 'METRONIDAZOLE -125-mg/5ml-SUSPENSION', generic: 'METRONIDAZOLE', strength: '125-mg/5ml', form: 'suspension' },
    { label: 'beta-sitosterol-ugly-strength', input: 'BETA-SITOSTEROL -0,25 G/100G-x-OINTMENT', generic: 'BETA-SITOSTEROL', strength: '0,25 G/100G', form: 'ointment' },
    { label: 'paracetamol-syrup-125', input: 'PARACETAMOL -125-mg/5ml-SYRUP', generic: 'PARACETAMOL', strength: '125-mg/5ml', form: 'syrup' },
    { label: 'benzoic-salicylic-ointment-combo', input: 'BENZOIC ACID + SALICYLIC ACID -60+30-mg-OINTMENT', generic: 'BENZOIC ACID + SALICYLIC ACID', strength: '60+30-mg', form: 'ointment' },
    { label: 'dextromethorphan-syrup-15', input: 'DEXTROMETHORPHAN HYDROBROMIDE -15-mg/5ml-SYRUP', generic: 'DEXTROMETHORPHAN HYDROBROMIDE', strength: '15-mg/5ml', form: 'syrup' },
    { label: 'sulfamethoxazole-trimethoprim-susp', input: 'SULFAMETHOXAZOLE+ TRIMETHOPRIM -240-mg/5ml-SUSPENSION', generic: 'SULFAMETHOXAZOLE+ TRIMETHOPRIM', strength: '240-mg/5ml', form: 'suspension' },
    { label: 'mometasone-cream-0.1', input: 'MOMETASONE FUROATE -0.1-%-CREAM', generic: 'MOMETASONE FUROATE', strength: '0.1%', form: 'cream' },
    { label: 'gentamicin-drop-0.3', input: 'GENTAMICIN -0.3-%-DROP', generic: 'GENTAMICIN', strength: '0.3%', form: 'drop' },
    { label: 'diclofenac-gel-1-w-w', input: 'DICLOFENAC GEL -1%-w/w-GEL', generic: 'DICLOFENAC GEL', strength: '1%-w/w', form: 'gel' },
    { label: 'sanitizer-generic-only', input: 'Sanitizer', generic: 'Sanitizer', strength: null, form: null },
    { label: 'hydrocortisone-acetate-ointment', input: 'HYDROCORTISONE ACETATE -1-%-OINTMENT', generic: 'HYDROCORTISONE ACETATE', strength: '1%', form: 'ointment' },
    { label: 'clindamycin-gel-no-strength', input: 'Clindamycin gel', generic: 'Clindamycin', strength: null, form: 'gel' },
    { label: 'paracetamol-supp-125mg', input: 'PARACETAMOL 125 MG SUPPOSITORIES', generic: 'PARACETAMOL', strength: '125 MG', form: 'suppositories' },
    { label: 'gv-garbage', input: 'GV', generic: 'GV', strength: null, form: null },
    { label: 'amox-clav-312.5-susp', input: 'amoxicillin + CLAVULANIC ACID 312.5mg suspension', generic: 'amoxicillin + CLAVULANIC ACID', strength: '312.5mg', form: 'suspension' },
    { label: 'coal-tar-12%-w-w-ointment', input: 'Coal Tar solution+Salicylic Acid+Sulphur -12-%w/w-ointment', generic: 'Coal Tar solution+Salicylic Acid+Sulphur', strength: '12%w/w', form: 'ointment' },
    { label: 'clotrimazole-cream-1-w-w', input: 'CLOTRIMAZOLE CREAM -1%-w/w-CREAM', generic: 'CLOTRIMAZOLE CREAM', strength: '1%-w/w', form: 'cream' },
    { label: 'ciprofloxacin-injection-0.2', input: 'CIPROFLOXACIN -0.2-%-INJECTION', generic: 'CIPROFLOXACIN', strength: '0.2%', form: 'injection' },
    { label: 'cefixime-powder-susp-100', input: 'CEFIXIME -100-mg/5ml-POWDER FOR SUSPENSION', generic: 'CEFIXIME', strength: '100-mg/5ml', form: 'powder for suspension' },
    { label: 'metronidazole-injection-0.5', input: 'METRONIDAZOLE -0.5-%-INJECTION', generic: 'METRONIDAZOLE', strength: '0.5%', form: 'injection' },
    { label: 'clotrimazole-hydrocortisone-cream', input: 'Clotrimazole/Hydrocortisone cream', generic: 'Clotrimazole/Hydrocortisone', strength: null, form: 'cream' },
    { label: 'alcohol-70', input: 'Alcohol 70%', generic: 'Alcohol', strength: '70%', form: null },
    { label: 'chlorhexidine-mouth-wash', input: 'chlorhexidine mouth wash', generic: 'chlorhexidine', strength: null, form: 'mouth wash' },
    { label: 'omega3-fish-oil-placeholder', input: 'Omega-3 fish oil ---', generic: 'Omega-3 fish oil', strength: null, form: null },
    { label: 'zinc-oxide-plaster', input: 'ZINC OXIDE ADHESIVE PLASTER ---', generic: 'ZINC OXIDE ADHESIVE PLASTER', strength: null, form: null },
    { label: 'hcg-pregnancy-test', input: 'hCG one step Pregnancy test ---', generic: 'hCG one step Pregnancy test', strength: null, form: null },
    { label: 'salbutamol-susp-for-inhalation', input: 'SALBUTAMOL SULPHATE -100-mcg-SUSPENSION FOR INHALATION', generic: 'SALBUTAMOL SULPHATE', strength: '100-mcg', form: 'suspension for inhalation' },
    { label: 'isoconazole-diflucor-dual-percent', input: 'ISOCONAZOLE NITRATE + DIFLUCOR -1%/0.1%-%-CREAM', generic: 'ISOCONAZOLE NITRATE + DIFLUCOR', strength: '1%/0.1%', form: 'cream' },
    { label: 'calcium-vitd3-effervescent', input: 'CALCIUM&VITAMIN D3 EFFERVESCENT TABLETS ---', generic: 'CALCIUM&VITAMIN D3', strength: null, form: 'effervescent tablets' },
    { label: 'paracetamol-chlorphen-pseudoephedrine-syrup', input: 'PARACETAMOL +CHLORPHENIRAMINE MALEATE+PSEUDOEPHEDRINE -120+1+10/5-mg/ml-SYRUP', generic: 'PARACETAMOL +CHLORPHENIRAMINE MALEATE+PSEUDOEPHEDRINE', strength: '120+1+10/5-mg/ml', form: 'syrup' },
    { label: 'simethicon-infant-drop', input: 'Simethicon infant drop', generic: 'Simethicon infant', strength: null, form: 'drop' },
    { label: 'alumina-magnesia-simethicone-chewable', input: 'Alumnia,Magnesia And Simethicone Chewable Tablet', generic: 'Alumnia,Magnesia And Simethicone', strength: null, form: 'chewable tablet' },
  ];
  for (const c of CASES) {
    const res = splitNameGenericStrengthForm(c.input);
    assert.equal(res.generic_name, c.generic, `${c.label}: generic_name`);
    if (c.strength !== undefined) assert.equal((res.strength ?? null), c.strength, `${c.label}: strength`);
    const actualFormRaw = res.form ?? (res.leftover ? String(res.leftover).replace(/^[-\s]+/, "").toLowerCase() : null);
    const expectedFormRaw = c.form ?? null;
    if (expectedFormRaw !== undefined) assert.equal((actualFormRaw ? canonForm(actualFormRaw) : null), (expectedFormRaw ? canonForm(expectedFormRaw) : null), `${c.label}: form`);
  }
}

/**
 * Column-level concatenation detector sanity tests.
 */
async function testConcatColumnDetector() {
  const mkRow = (v) => ({ col_1: v });
  const posRows = [
    mkRow('DICLOFENAC GEL -1%-w/w-GEL'),
    mkRow('METRONIDAZOLE -125-mg/5ml-SUSPENSION'),
    mkRow('PARACETAMOL -125-mg/5ml-SYRUP'),
    mkRow('MOMETASONE FUROATE -0.1-%-CREAM'),
    mkRow('GENTAMICIN -0.3-%-DROP'),
    mkRow('DEXTROMETHORPHAN HYDROBROMIDE -15-mg/5ml-SYRUP'),
    mkRow('CIPROFLOXACIN -0.2-%-INJECTION'),
    mkRow('CEFIXIME -100-mg/5ml-POWDER FOR SUSPENSION'),
    mkRow('METRONIDAZOLE -0.5-%-INJECTION'),
    mkRow('DICLOFENAC GEL -1%-w/w-GEL'),
  ];
  const negRows = [
    mkRow('PARACETAMOL'), mkRow('AMOXICILLIN'), mkRow('DICLOFENAC'), mkRow('METFORMIN'), mkRow('IBUPROFEN'),
    mkRow('Simethicon infant'), mkRow('Sanitizer'), mkRow('GV'), mkRow('ZINC OXIDE ADHESIVE PLASTER'), mkRow('Omega-3 fish oil')
  ];
  const flagged = inferConcatenatedColumns(posRows);
  const notFlagged = inferConcatenatedColumns(negRows);
  assert.ok(flagged.some((c) => c.index === 0), 'positive rows should flag col_1');
  assert.ok(!notFlagged.some((c) => c.index === 0), 'negative rows should not flag col_1');
}

async function testModesConsistency() {
  const csv = [
    "Generic (International Name),Strength,Dosage Form,Product Category,Expiry Date,Pack Contents,Item Quantity,Unit Price,Country of Manufacture,Serial Number",
    "Paracetamol,500mg,tablet,Analgesics,31/12/2099,30TAB,B123,100,12.5,India,SN001",
    "Ibuprofen,200mg,tablet,Analgesics,31/12/2099,30TAB,B124,50,7.25,India,SN002",
  ].join("\n");
  const bytes = new TextEncoder().encode(csv).buffer;
  const fast = await parseProductsFileFromBuffer(bytes, "modes.csv", { mode: "fast", validationMode: "full" });
  const deep = await parseProductsFileFromBuffer(bytes, "modes.csv", { mode: "deep", validationMode: "full" });
  assert.equal(fast.rows.length, deep.rows.length, "rows length equal");
  assert.equal(JSON.stringify(fast.rows.slice(0,2)), JSON.stringify(deep.rows.slice(0,2)), "rows canonical equal for sample");
}

/**
 * testFastDeepMetaDiffers - Fast vs Deep meta should differ (sampleSize) while rows are identical.
 * Signed: EyosiyasJ
 */
async function testFastDeepMetaDiffers() {
  const base = path.resolve("./testFiles/Items.xlsx");
  const buf = await fs.promises.readFile(base);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const fast = await parseProductsFileFromBuffer(bytes, "Items.xlsx", { mode: "fast", validationMode: "errorsOnly" });
  const deep = await parseProductsFileFromBuffer(bytes, "Items.xlsx", { mode: "deep", validationMode: "errorsOnly" });
  assert.equal(JSON.stringify(fast.rows), JSON.stringify(deep.rows));
  assert.notEqual(fast.meta.sampleSize, deep.meta.sampleSize);
}

/**
 * testDevicesRelaxedValidation - Devices-only fixture should not require strength/form/expiry/COO.
 * Signed: EyosiyasJ
 */
async function testDevicesRelaxedValidation() {
  const base = path.resolve("./testFiles/devices_only.xlsx");
  const buf = await fs.promises.readFile(base);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const res = await parseProductsFileFromBuffer(bytes, "devices_only.xlsx", { mode: "fast", validationMode: "full" });
  const missingDoseErrs = res.errors.filter((e) => e.code === "E_REQUIRED_MISSING" && ["product.strength","product.form"].includes(e.field));
  assert.equal(missingDoseErrs.length, 0);
  const missingExpiryCooErrs = res.errors.filter((e) => e.code === "E_REQUIRED_MISSING" && ["batch.expiry_date","identity.coo"].includes(e.field));
  assert.equal(missingExpiryCooErrs.length, 0);
}

/**
 * testHeaderlessPosDetection - Headerless POS should still detect schema and map fields.
 * Signed: EyosiyasJ
 */
async function testHeaderlessPosDetection() {
  const base = path.resolve("./testFiles/headerless_pos.xlsx");
  const buf = await fs.promises.readFile(base);
  const wb = XLSX.read(buf, { type: "buffer" });
  const u8 = XLSX.write(wb, { type: "array" });
  const res = await parseProductsFileFromBuffer(u8, "headerless_pos.xlsx", { mode: "fast", validationMode: "errorsOnly" });
  assert.ok(["concat_items","legacy_items","unknown"].includes(res.meta.sourceSchema));
  assert.ok(res.rows.length >= 1);
  assert.ok(Array.isArray(res.meta.concatenatedColumns) && res.meta.concatenatedColumns.length > 0);
}

/**
 * testGarbageNoCrash - Garbage fixture should produce errors but not crash.
 * Signed: EyosiyasJ
 */
async function testGarbageNoCrash() {
  const base = path.resolve("./testFiles/garbage.xlsx");
  const buf = await fs.promises.readFile(base);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const res = await parseProductsFileFromBuffer(bytes, "garbage.xlsx", { mode: "deep", validationMode: "full" });
  assert.ok(res.errors.length >= 1);
  assert.ok(res.rows.length >= 0);
}

async function testValidationModeBehaviour() {
  const base = path.resolve("./testFiles/Items.xlsx");
  const buf = await fs.promises.readFile(base);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const full = await parseProductsFileFromBuffer(bytes, "Items.xlsx", { mode: "fast", validationMode: "full" });
  const errsOnly = await parseProductsFileFromBuffer(bytes, "Items.xlsx", { mode: "fast", validationMode: "errorsOnly" });
  const none = await parseProductsFileFromBuffer(bytes, "Items.xlsx", { mode: "fast", validationMode: "none" });
  assert.ok(errsOnly.errors.length <= full.errors.length, "errorsOnly should not exceed full error count");
  assert.equal(none.errors.length, 0, "none should produce zero errors");
  assert.equal(JSON.stringify(full.rows.slice(0,5)), JSON.stringify(none.rows.slice(0,5)), "canonical rows should match under none mode");
}

/**
 * Column detection should not rely on header names.
 */
async function testConcatColumnHeaderAgnostic() {
  const samples = [
    'PARACETAMOL -125-mg/5ml-SYRUP',
    'DICLOFENAC -50-mg-TABLET',
    'CEFIXIME -100-mg/5ml-POWDER FOR SUSPENSION',
  ];
  const mkRows = (header) => samples.map((v, idx) => ({ [header]: v, Notes: `n-${idx}` }));
  for (const header of ['Name', 'Description', 'FooBar']) {
    const flagged = inferConcatenatedColumns(mkRows(header));
    assert.ok(flagged.some((c) => c.index === 0), `header ${header} should be flagged`);
  }
}

/**
 * Ensure remainder routing honors column semantics (Name vs Description vs unknown).
 */
async function testColumnRemainderRouting() {
  const buildCsv = (header) => [
    `${header},"Expiry Date","Batch / Lot Number","Item Quantity"`,
    `"PARACETAMOL -125-mg/5ml-SYRUP","31/12/2099","B321","12"`,
  ].join("\n");
  const parse = async (header, filename) => {
    const bytes = new TextEncoder().encode(buildCsv(header)).buffer;
    return parseProductsFileFromBuffer(bytes, filename);
  };

  const nameRes = await parse('Name', 'name.csv');
  assert.ok(nameRes.meta.concatenatedColumns?.some((c) => c.index === 0), 'Name column should be flagged');
  const nameRow = nameRes.rows[0];
  assert.equal(nameRow.product.generic_name, 'PARACETAMOL');
  assert.equal(nameRow.product.strength, '125-mg/5ml');
  assert.equal(nameRow.product.form, 'syrup');

  const descRes = await parse('Description', 'desc.csv');
  assert.ok(descRes.meta.concatenatedColumns?.some((c) => c.index === 0), 'Description column should be flagged');
  const descRow = descRes.rows[0];
  assert.equal(descRow.product.description, 'PARACETAMOL');
  assert.equal(descRow.product.generic_name, 'PARACETAMOL');
  assert.equal(descRow.product.form, 'syrup');

  const unknownRes = await parse('FooBar', 'foo.csv');
  assert.ok(unknownRes.meta.concatenatedColumns?.some((c) => c.index === 0), 'Unknown column should be flagged');
  const unknownRow = unknownRes.rows[0];
  assert.equal(unknownRow.product.generic_name, 'PARACETAMOL');
  assert.equal(unknownRow.product.strength, '125-mg/5ml');
  assert.equal(unknownRow.product.form, 'syrup');
}

/**
 * Batch/expiry/country concatenations work regardless of header label.
 */
async function testBatchInfoDecomposition() {
  const csv = [
    'Name,BatchInfo,Item Quantity',
    '"Sample Product","LOT: B555 EXP: 05/03/2027 ETH","5"',
  ].join("\n");
  const bytes = new TextEncoder().encode(csv).buffer;
  const res = await parseProductsFileFromBuffer(bytes, 'batchinfo.csv');
  const row = res.rows[0];
  assert.equal(row.batch.batch_no, 'B555');
  assert.ok(String(row.batch.expiry_date).startsWith('2027-03-05'), 'expiry should normalize to ISO');
  assert.equal(row.batch.coo, 'ET');
}
/**
 * Country normalizer unit tests for messy real-world inputs
 * Signed: EyosiyasJ
 */
async function testCountryNormalizer() {
  const cases = [
    ["Eth", "ET"],
    ["Ethio", "ET"],
    ["ETH", "ET"],
    ["Ethiopia", "ET"],
    ["America", "US"],
    ["Ame", "US"],
    ["U.S.A", "US"],
    ["UK", "GB"],
    ["England", "GB"],
    ["Deutschland", "DE"],
    ["Cote d Ivoire", "CI"],
    ["Ivory Coast", "CI"],
    ["Bharat", "IN"],
    ["UAE", "AE"],
    ["KSA", "SA"],
    ["Türkiye", "TR"],
    ["Holland", "NL"],
  ];
  for (const [input, expected] of cases) {
    const iso = normalizeCountryToIso2(input);
    assert.equal(iso, expected, `normalizeCountryToIso2('${input}') => ${expected}`);
  }
  // Invalid should return null
  assert.equal(normalizeCountryToIso2("Mars"), null);
  assert.equal(normalizeCountryToIso2("Narnia"), null);

  // Ensure country normalizer corrects non-ISO2 tokens
  const ok = sanitizeCanonicalRow(
    { product: { generic_name: "X", strength: "1mg", form: "tablet", category: "Analgesic" }, batch: { expiry_date: "31/12/2099", on_hand: 1, coo: "USA" } },
    1
  );
  const hasFormatErrUSA = ok.errors.some((e) => e.field === "identity.coo" && e.code === "E_COO_FORMAT");
  assert.equal(hasFormatErrUSA, false, "USA should normalize to US without format error");

  // Invalid should trigger format error
  const bad = sanitizeCanonicalRow(
    { product: { generic_name: "X", strength: "1mg", form: "tablet", category: "Analgesic" }, batch: { expiry_date: "31/12/2099", on_hand: 1, coo: "XYZ" } },
    1
  );
  const hasFormatErrXYZ = bad.errors.some((e) => e.field === "identity.coo" && e.code === "E_COO_FORMAT");
  assert.equal(hasFormatErrXYZ, true, "XYZ should trigger E_COO_FORMAT");
}

/**
 * Expiry parsing flexible formats to deterministic ISO (last day of month)
 * Signed: EyosiyasJ
 */
async function testExpiryFlexibleFormats() {
  const rowBase = {
    product: { generic_name: "X", strength: "1mg", form: "tablet", category: "Analgesic" },
    batch: { on_hand: 1, coo: "ET" },
  };

  const check = async (inp, expectedIsoStart) => {
    const { row, errors } = sanitizeCanonicalRow({ ...rowBase, batch: { ...rowBase.batch, expiry_date: inp } }, 1);
    assert.ok(row, "row present");
    assert.ok(!errors.some((e) => e.field === "batch.expiry_date" && e.code === "invalid_format"), `no invalid_format for '${inp}'`);
    assert.ok(String(row.batch?.expiry_date).startsWith(expectedIsoStart), `expiry '${inp}' => '${row.batch?.expiry_date}' starts with '${expectedIsoStart}'`);
  };

  await check("Nov-28", "2028-11-");
  await check("Feb-28", "2028-02-");
  await check("Dec-30", "2030-12-");
  await check("11/28", "2028-11-");
  await check("11-28", "2028-11-");
  await check("Nov/2028", "2028-11-");
  await check("07/2030", "2030-07-");
}
