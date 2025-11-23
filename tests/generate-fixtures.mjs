import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

/**
 * ensureDir - Create directory if missing.
 * Signed: EyosiyasJ
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * writeXlsx - Write an array-of-arrays sheet to disk.
 * Signed: EyosiyasJ
 */
function writeXlsx(filepath, sheetName, header, rows, metaSheets = []) {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  for (const m of metaSheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(m.rows), m.name);
  const u8 = XLSX.write(wb, { type: "buffer" });
  fs.writeFileSync(filepath, u8);
}

/**
 * genTemplateClean - Generate a clean MedWay template fixture.
 * Signed: EyosiyasJ
 */
function genTemplateClean(baseDir) {
  const file = path.join(baseDir, "template_clean.xlsx");
  const header = [
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
  const rows = [
    ["Paracetamol","medicine","500mg","tablet","Analgesics","31/12/2099","30TAB","B100",100,1.2,"India","SN1","BrandA","MakerA",""],
    ["Amoxicillin","medicine","250mg","capsule","Antibiotic","30/11/2030","20CAP","B200",50,2.5,"Ethiopia","SN2","BrandB","MakerB",""],
    ["Salbutamol","medicine","2mg/5ml","syrup","Respiratory","01/01/2031","1BTL","B300",25,3.75,"USA","SN3","BrandC","MakerC",""],
  ];
  const metaSheets = [{ name: "__meta", rows: [["template_version","MedWay_Template_v3"],["header_checksum","f9802bc8"]] }];
  writeXlsx(file, "Products", header, rows, metaSheets);
}

/**
 * genDevicesOnly - Generate devices-only fixture without dose fields.
 * Signed: EyosiyasJ
 */
function genDevicesOnly(baseDir) {
  const file = path.join(baseDir, "devices_only.xlsx");
  const header = [
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
  ];
  const rows = [
    ["THERMOMETER","","","Devices","","","B-T1",5,10.0,"China"],
    ["PREGNANCY TEST KIT","","","Devices","","","B-P1",20,5.5,"USA"],
    ["GLUCOSE STRIPS","","","Devices","","","B-G1",100,15.0,"India"],
  ];
  writeXlsx(file, "Products", header, rows);
}

/**
 * genHeaderlessPos - Generate headerless POS-like fixture.
 * Signed: EyosiyasJ
 */
function genHeaderlessPos(baseDir) {
  const file = path.join(baseDir, "headerless_pos.xlsx");
  const rows = [
    ["PARACETAMOL -125-mg/5ml-SYRUP","31/12/2099","B321","12"],
    ["DICLOFENAC -50-mg-TABLET","30/06/2030","B654","20"],
    ["MOMETASONE FUROATE -0.1-%-CREAM","","B987","5"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "POS");
  const u8 = XLSX.write(wb, { type: "buffer" });
  fs.writeFileSync(file, u8);
}

/**
 * genGarbage - Generate a garbage fixture with random/empty values.
 * Signed: EyosiyasJ
 */
function genGarbage(baseDir) {
  const file = path.join(baseDir, "garbage.xlsx");
  const header = ["A","B","C","D"]; 
  const rows = [["","","",""],[123,"foo",null,undefined],["--","???","N/A","0"]];
  writeXlsx(file, "Sheet1", header, rows);
}

/**
 * genBigItems - Generate a large synthetic sheet by repeating Items.xlsx.
 * Signed: EyosiyasJ
 */
function genBigItems(baseDir) {
  const src = path.join(baseDir, "Items.xlsx");
  if (!fs.existsSync(src)) return;
  const buf = fs.readFileSync(src);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const header = aoa[0] || [];
  const data = aoa.slice(1);
  const big = [];
  for (let i = 0; i < 10; i++) big.push(...data);
  const out = XLSX.utils.aoa_to_sheet([header, ...big]);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, out, "ItemsBig");
  const u8 = XLSX.write(outWb, { type: "buffer" });
  fs.writeFileSync(path.join(baseDir, "BigItems.xlsx"), u8);
}

/**
 * generateAll - Entry point to generate all fixtures under testFiles/.
 * Signed: EyosiyasJ
 */
export async function generateAll() {
  const baseDir = path.resolve("./testFiles");
  ensureDir(baseDir);
  genTemplateClean(baseDir);
  genDevicesOnly(baseDir);
  genHeaderlessPos(baseDir);
  genGarbage(baseDir);
  genBigItems(baseDir);
}

/**
 * If invoked directly, run generator.
 * Signed: EyosiyasJ
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAll().catch((e) => { console.error(e); process.exit(1); });
}
