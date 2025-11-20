/**
 * Module: Country Normalization
 * Purpose: Normalize arbitrary country text to ISO-3166 alpha-2 codes and resolve names.
 * Implementation:
 * - Registers `i18n-iso-countries` English locale when available; degrades gracefully otherwise.
 * - Uses manual aliases for common real-world variants, direct ISO-2 checks, library lookups,
 *   and fuzzy matching heuristics to handle messy inputs.
 * Signed: EyosiyasJ
 */
var _a;
import countries from "i18n-iso-countries";
let localeRegistered = false;
try {
    const en = await import("i18n-iso-countries/langs/en.json", { with: { type: "json" } });
    countries.registerLocale((_a = en.default) !== null && _a !== void 0 ? _a : en);
    localeRegistered = true;
}
catch (e) {
    // If JSON import assertion is unavailable in this runtime, proceed without explicit locale registration.
    // Library functions that rely on names may return undefined until a locale is registered.
}
function normalizeKey(raw) {
    return raw
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/g, "");
}
/**
 * Manual aliases for messy real-world inputs.
 * Keys are normalized with normalizeKey, values are ISO-2 codes.
 * Signed: EyosiyasJ
 */
const MANUAL_ALIAS_TO_ISO2 = {
    // Ethiopia variants
    ethiopia: "ET",
    ethiopian: "ET",
    eth: "ET",
    ethio: "ET",
    ethi: "ET",
    // United States variants
    usa: "US",
    us: "US",
    america: "US",
    unitedstates: "US",
    unitedstatesofamerica: "US",
    amerika: "US",
    ame: "US",
    unitedstatesamerica: "US",
    unitedstatesa: "US",
    // United Kingdom / UK
    uk: "GB",
    unitedkingdom: "GB",
    greatbritain: "GB",
    britain: "GB",
    england: "GB",
    scotland: "GB",
    wales: "GB",
    northernireland: "GB",
    // Germany
    germany: "DE",
    deutschland: "DE",
    ger: "DE",
    // France
    france: "FR",
    fr: "FR",
    // India
    india: "IN",
    bharat: "IN",
    // China
    china: "CN",
    prc: "CN",
    peoplesrepublicofchina: "CN",
    // Popular Middle East shortcuts
    uae: "AE",
    unitedarabemirates: "AE",
    ksa: "SA",
    saudiarabia: "SA",
    // Turkey
    turkiye: "TR",
    turkey: "TR",
    // Netherlands
    holland: "NL",
    netherlands: "NL",
    // Ivory Coast / Côte d'Ivoire
    ivorycoast: "CI",
    cotedivoire: "CI",
    // Kenya & neighbors
    kenya: "KE",
    uganda: "UG",
    tanzania: "TZ",
    rwanda: "RW",
    burundi: "BI",
    // Horn of Africa
    somalia: "SO",
    djibouti: "DJ",
    eritrea: "ER",
    // Southern Africa
    southafrica: "ZA",
    sa: "ZA",
    botswana: "BW",
    namibia: "NA",
    zambia: "ZM",
    zimbabwe: "ZW",
    malawi: "MW",
    // West Africa
    nigeria: "NG",
    ghana: "GH",
    senegal: "SN",
    sierra_leone: "SL",
    sierraleone: "SL",
    liberia: "LR",
    benin: "BJ",
    togo: "TG",
    guinea: "GN",
    guineabissau: "GW",
    niger: "NE",
    burkinafaso: "BF",
    mali: "ML",
    // North Africa
    egypt: "EG",
    morocco: "MA",
    algeria: "DZ",
    tunisia: "TN",
    libya: "LY",
    // Central Africa
    cameroon: "CM",
    congodemocraticrepublic: "CD",
    drc: "CD",
    congo: "CG", // Republic of the Congo
    angola: "AO",
    mozambique: "MZ",
    // East Asia
    southkorea: "KR",
    republicofkorea: "KR",
    japan: "JP",
    // Europe additions
    spain: "ES",
    italy: "IT",
    poland: "PL",
    czechia: "CZ",
    czechrepublic: "CZ",
    sweden: "SE",
    norway: "NO",
    denmark: "DK",
};
/**
 * Get ISO-2 if the string already is an ISO-2 and valid.
 */
function tryIso2Direct(raw) {
    const upper = raw.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(upper))
        return null;
    const name = countries.getName(upper, "en");
    return name ? upper : null;
}
/**
 * Fuzzy match across country names using simple starts-with/contains heuristics.
 */
function fuzzyMatchCountry(key) {
    const allNames = countries.getNames("en");
    let bestCode = null;
    let bestScore = 0;
    for (const [code, name] of Object.entries(allNames)) {
        const normName = normalizeKey(name);
        if (!normName)
            continue;
        if (normName === key)
            return code;
        if (normName.startsWith(key) || key.startsWith(normName)) {
            const score = Math.max(key.length, normName.length);
            if (score > bestScore) {
                bestScore = score;
                bestCode = code;
            }
        }
        else if (normName.includes(key) || key.includes(normName)) {
            const score = Math.min(key.length, normName.length);
            if (score > bestScore) {
                bestScore = score;
                bestCode = code;
            }
        }
    }
    // Guard against short tokens causing false positives (e.g., "mars" → Marshall Islands)
    if (bestCode && key.length >= 5)
        return bestCode;
    return null;
}
/**
 * Normalize arbitrary country input → ISO-3166 alpha-2 code.
 *
 * Parameters:
 * - `raw`: free-text input (country name, alias, or ISO-2 code).
 *
 * Returns:
 * - ISO-2 code (e.g., `ET`, `IN`) or `null` if not resolvable.
 * Signed: EyosiyasJ
 */
export function normalizeCountryToIso2(raw) {
    if (raw == null)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const direct = tryIso2Direct(trimmed);
    if (direct)
        return direct;
    const key = normalizeKey(trimmed);
    if (!key)
        return null;
    const aliasHit = MANUAL_ALIAS_TO_ISO2[key];
    if (aliasHit)
        return aliasHit;
    const byName = countries.getAlpha2Code(trimmed, "en");
    if (byName)
        return byName;
    const fuzzy = fuzzyMatchCountry(key);
    if (fuzzy)
        return fuzzy;
    return null;
}
/**
 * Resolve ISO-2 to display name.
 * Signed: EyosiyasJ
 */
export function iso2ToCountryName(code) {
    if (!code)
        return null;
    const name = countries.getName(code.toUpperCase(), "en");
    return name || null;
}
