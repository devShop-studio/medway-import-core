export type UmbrellaCategoryId = "GASTROINTESTINAL" | "RESPIRATORY" | "CARDIOVASCULAR" | "ANTI_INFECTIVES" | "CNS" | "ANESTHESIA" | "MUSCULOSKELETAL" | "OPHTHALMIC" | "BLOOD" | "ENDO_CONTRACEPTIVES" | "VACCINES" | "IMMUNOMODULATORS" | "DERMATOLOGICAL" | "VITAMINS" | "OB_GYN" | "BPH" | "FLUID_ELECTROLYTE" | "ANTINEOPLASTICS_SUPPORT" | "ENT" | "SERA_IG" | "ANTIDOTES_POISONING" | "RADIOCONTRAST" | "MISC";
export interface UmbrellaCategoryRule {
    id: UmbrellaCategoryId;
    label: string;
    categoryKeywords: string[];
    genericKeywords: string[];
    deviceKeywords?: string[];
    negativeCategoryKeywords?: string[];
    negativeGenericKeywords?: string[];
}
/**
 * Map 3-letter therapeutic codes to umbrella IDs.
 * Signed: EyosiyasJ
 */
export declare const CATEGORY_CODE_TO_UMBRELLA: Record<string, UmbrellaCategoryId>;
/**
 * Resolve umbrella ID from a 3-letter code.
 * Signed: EyosiyasJ
 */
export declare function mapCategoryCodeToUmbrella(code: string | null | undefined): UmbrellaCategoryId | undefined;
/**
 * Score and select umbrella category based on raw product fields.
 * Weights category keywords, generic/brand signals, description hits, device signals,
 * and negative keywords with separation threshold to avoid misclassification.
 * Signed: EyosiyasJ
 */
export declare function classifyUmbrellaCategory(input: {
    generic_name?: string | null;
    brand_name?: string | null;
    category?: string | null;
    description?: string | null;
}): UmbrellaCategoryId | undefined;
/**
 * Index of umbrella category definitions for O(1) lookups.
 * Signed: EyosiyasJ
 */
/**
 * High-level therapeutic umbrellas used by MedWay.
 * Keep IDs stable; UI can show human-readable labels.
 */
export interface UmbrellaCategoryRule {
    id: UmbrellaCategoryId;
    label: string;
    description: string;
    /**
     * Words/phrases expected in "product.category" or similar fields.
     * Must be lowercase and reasonably specific.
     */
    categoryKeywords: string[];
    /**
     * Key molecules / ingredient stems / strongly associated terms.
     * Also lowercase.
     */
    genericKeywords: string[];
    /**
     * Only used where devices/consumables are typical (e.g. Misc).
     */
    deviceKeywords?: string[];
    /**
     * Terms that should suppress this umbrella when present with strong
     * positive hits for another umbrella.
     */
    negativeCategoryKeywords?: string[];
    negativeGenericKeywords?: string[];
}
/**
 * Helper: normalize a free-text field to lowercase ASCII-ish.
 */
/**
 * All umbrella category rules.
 * This is intentionally data-heavy; do not add logic here beyond static config.
 */
export declare const UMBRELLA_CATEGORY_RULES: UmbrellaCategoryRule[];
export declare const UMBRELLA_CATEGORY_INDEX: Record<UmbrellaCategoryId, UmbrellaCategoryRule>;
/**
 * Optional helper used by sanitize.ts (or similar) to derive umbrella_category.
 * You can reuse or adjust thresholds in the caller if you already wrote a scorer.
 */
export interface UmbrellaClassificationInput {
    genericName?: string | null;
    category?: string | null;
    description?: string | null;
}
/**
 * Quick lookup map if you need O(1) access by id.
 */
/**
 * Module: Therapeutic Umbrella Categories
 * Purpose: Provide stable umbrella categories and mapping utilities used by UI and analytics.
 * Features:
 * - 3-letter code → umbrella mapping (`CATEGORY_CODE_TO_UMBRELLA`).
 * - Text-based classification (`classifyUmbrellaCategory`) with weighted signals and guardrails.
 * Signed: EyosiyasJ
 */
//# sourceMappingURL=category.d.ts.map