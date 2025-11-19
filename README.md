# @medway/import-core

Lightweight, browser/RN-safe core for parsing MedWay stock import files (XLSX and CSV) and producing a canonical product payload with detailed row errors and metadata.

## Installation

Using a git tag:

```
"@medway/import-core": "git+ssh://git@github.com/devShop-studio/medway-import-core.git#v0.1.0"
```

Build locally:

```
pnpm install  # or npm/yarn
pnpm run build
```

## Public API

- `parseProductsFileFromBuffer(fileBytes, filename): Promise<ParsedImportResult>`
  - `fileBytes`: `ArrayBuffer` of the selected file
  - `filename`: original filename to detect extension
  - Returns `{ rows: CanonicalProduct[], errors: ParsedRowError[], meta: { sourceSchema, totalRows, parsedRows, templateVersion?, headerChecksum? } }`

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

## Changes (documentation)

- Added `.gitignore` for `node_modules`, lockfiles, debug logs, `.DS_Store`.
- Updated `package.json` with `files` and `devDependencies.typescript`.
- Made `tsconfig.json` standalone and strict.

Signed: EyosiyasJ