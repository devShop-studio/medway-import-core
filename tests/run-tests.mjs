import assert from "assert";
import * as XLSX from "xlsx";
import { parseProductsFileFromBuffer } from "../dist/index.js";
import fs from "fs";
import path from "path";

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
  assert.equal(res.meta.sourceSchema, "csv_generic");
  assert.equal(res.meta.parsedRows, 1);
  assert.ok(res.rows[0]);
  assert.equal(res.rows[0].product.generic_name, "Paracetamol");
  assert.equal(res.rows[0].product.form, "tablet");
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
  }
}

/**
 * Run all tests and report
 */
async function run() {
  const tests = [testCsvBasic, testXlsxTemplateV3, testLocalFixtures];
  for (const t of tests) {
    await t();
    console.log(`PASS: ${t.name}`);
  }
  console.log("All tests passed");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});