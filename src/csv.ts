export type RawRow = Record<string, string | number | null>;

/**
 * Parse CSV text into rows using simple state machine that handles quoted fields and commas within quotes.
 * Borrowed from the existing web importer to preserve behavior.
 */
export function parseCsvToRows(csvText: string): RawRow[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    current.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(current);
    current = [];
  };

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    if (inQuotes) {
      if (c === `"`) {
        if (csvText[i + 1] === `"`) {
          field += `"`;
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === `"`) {
        inQuotes = true;
      } else if (c === ",") {
        pushField();
      } else if (c === "\n") {
        pushField();
        pushRow();
      } else if (c === "\r") {
        // ignore CR
      } else {
        field += c;
      }
    }
  }
  pushField();
  pushRow();
  // Trim possible trailing empty last row
  if (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();

  const headers = rows[0]?.map((h) => String(h ?? "").trim()) ?? [];
  const out: RawRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const rowVals = rows[r];
    const obj: RawRow = {};
    headers.forEach((h, idx) => {
      obj[h] = rowVals[idx] ?? null;
    });
    out.push(obj);
  }
  return out;
}
