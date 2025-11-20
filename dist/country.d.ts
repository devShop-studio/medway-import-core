/**
 * Module: Country Normalization
 * Purpose: Normalize arbitrary country text to ISO-3166 alpha-2 codes and resolve names.
 * Implementation:
 * - Registers `i18n-iso-countries` English locale when available; degrades gracefully otherwise.
 * - Uses manual aliases for common real-world variants, direct ISO-2 checks, library lookups,
 *   and fuzzy matching heuristics to handle messy inputs.
 * Signed: EyosiyasJ
 */
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
export declare function normalizeCountryToIso2(raw: string | null | undefined): string | null;
/**
 * Resolve ISO-2 to display name.
 * Signed: EyosiyasJ
 */
export declare function iso2ToCountryName(code: string | null | undefined): string | null;
//# sourceMappingURL=country.d.ts.map