/**
 * Parse CSV text into rows using simple state machine that handles quoted fields and commas within quotes.
 * Borrowed from the existing web importer to preserve behavior.
 */
export function parseCsvToRows(csvText) {
    var _a, _b;
    const rows = [];
    let current = [];
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
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += c;
            }
        }
        else {
            if (c === `"`) {
                inQuotes = true;
            }
            else if (c === ",") {
                pushField();
            }
            else if (c === "\n") {
                pushField();
                pushRow();
            }
            else if (c === "\r") {
                // ignore CR
            }
            else {
                field += c;
            }
        }
    }
    pushField();
    pushRow();
    // Trim possible trailing empty last row
    if (rows.length && rows[rows.length - 1].every((v) => v === ""))
        rows.pop();
    const headers = (_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.map((h) => String(h !== null && h !== void 0 ? h : "").trim())) !== null && _b !== void 0 ? _b : [];
    const out = [];
    for (let r = 1; r < rows.length; r++) {
        const rowVals = rows[r];
        const obj = {};
        headers.forEach((h, idx) => {
            var _a;
            obj[h] = (_a = rowVals[idx]) !== null && _a !== void 0 ? _a : null;
        });
        out.push(obj);
    }
    return out;
}
