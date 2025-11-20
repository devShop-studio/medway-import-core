export type UmbrellaCategoryId =
  | "GASTROINTESTINAL"
  | "RESPIRATORY"
  | "CARDIOVASCULAR"
  | "ANTI_INFECTIVES"
  | "CNS"
  | "ANESTHESIA"
  | "MUSCULOSKELETAL"
  | "OPHTHALMIC"
  | "BLOOD"
  | "ENDO_CONTRACEPTIVES"
  | "VACCINES"
  | "IMMUNOMODULATORS"
  | "DERMATOLOGICAL"
  | "VITAMINS"
  | "OB_GYN"
  | "BPH"
  | "FLUID_ELECTROLYTE"
  | "ANTINEOPLASTICS_SUPPORT"
  | "ENT"
  | "SERA_IG"
  | "ANTIDOTES_POISONING"
  | "RADIOCONTRAST"
  | "MISC";

export interface UmbrellaCategoryRule {
  id: UmbrellaCategoryId;
  label: string;
  categoryKeywords: string[];
  genericKeywords: string[];
  deviceKeywords?: string[];
  negativeCategoryKeywords?: string[];
  negativeGenericKeywords?: string[];
}

// Use the extensive library below: UMBRELLA_CATEGORY_RULES

/**
 * Map 3-letter therapeutic codes to umbrella IDs.
 * Signed: EyosiyasJ
 */
export const CATEGORY_CODE_TO_UMBRELLA: Record<string, UmbrellaCategoryId> = {
  ANT: "ANTI_INFECTIVES",
  CVS: "CARDIOVASCULAR",
  RES: "RESPIRATORY",
  CNS: "CNS",
  ANE: "ANESTHESIA",
  MSK: "MUSCULOSKELETAL",
  OPH: "OPHTHALMIC",
  HEM: "BLOOD",
  END: "ENDO_CONTRACEPTIVES",
  VAC: "VACCINES",
  IMM: "IMMUNOMODULATORS",
  DER: "DERMATOLOGICAL",
  VIT: "VITAMINS",
  OBG: "OB_GYN",
  BPH: "BPH",
  FER: "OB_GYN",
  ONC: "ANTINEOPLASTICS_SUPPORT",
  ENT: "ENT",
  GIT: "GASTROINTESTINAL",
  SIG: "SERA_IG",
  TOX: "ANTIDOTES_POISONING",
  RCM: "RADIOCONTRAST",
  MSC: "MISC",
};

/**
 * Resolve umbrella ID from a 3-letter code.
 * Signed: EyosiyasJ
 */
export function mapCategoryCodeToUmbrella(code: string | null | undefined): UmbrellaCategoryId | undefined {
  const k = String(code ?? "").trim().toUpperCase();
  return k ? CATEGORY_CODE_TO_UMBRELLA[k] : undefined;
}

const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const textIncludesAny = (hay: string, needles: string[]): boolean => needles.some((n) => hay.includes(n));

/**
 * Score and select umbrella category based on raw product fields.
 * Weights category keywords, generic/brand signals, description hits, device signals,
 * and negative keywords with separation threshold to avoid misclassification.
 * Signed: EyosiyasJ
 */
export function classifyUmbrellaCategory(input: {
  generic_name?: string | null;
  brand_name?: string | null;
  category?: string | null;
  description?: string | null;
}): UmbrellaCategoryId | undefined {
  const g = norm(input.generic_name);
  const b = norm(input.brand_name);
  const c = norm(input.category);
  const d = norm(input.description);
  const combined = [g, b, c, d].filter(Boolean).join(" ");
  let bestId: UmbrellaCategoryId | undefined;
  let bestScore = 0;
  let secondScore = 0;
  for (const rule of UMBRELLA_CATEGORY_RULES) {
    const catScore = c && textIncludesAny(c, rule.categoryKeywords) ? 3 : 0;
    const genScore = (textIncludesAny(g, rule.genericKeywords) || textIncludesAny(b, rule.genericKeywords)) ? 2 : 0;
    const descScore = d && textIncludesAny(d, rule.categoryKeywords) ? 1 : 0;
    const deviceScore = rule.deviceKeywords ? (textIncludesAny(combined, rule.deviceKeywords) ? (rule.id === "MISC" ? 4 : 2) : 0) : 0;
    let negative = 0;
    if (rule.negativeCategoryKeywords?.length) {
      if (textIncludesAny(combined, rule.negativeCategoryKeywords)) negative += 3;
    }
    if (rule.negativeGenericKeywords?.length) {
      if (textIncludesAny(combined, rule.negativeGenericKeywords)) negative += 2;
    }
    const score = catScore + genScore + descScore + deviceScore - negative * 2;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestId = rule.id;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (!bestId) return undefined;
  if (bestScore < 3) return undefined;
  if (bestScore - secondScore < 2) return undefined;
  return bestId;
}

/**
 * Index of umbrella category definitions for O(1) lookups.
 * Signed: EyosiyasJ
 */
// UMBRELLA_CATEGORY_INDEX moved below rule declarations to avoid use-before-declaration.

// src/category.ts

/**
 * High-level therapeutic umbrellas used by MedWay.
 * Keep IDs stable; UI can show human-readable labels.
 */
// Removed duplicate UmbrellaCategoryId redefinition to avoid conflicts; using the canonical union defined at top.

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
// Removed duplicate helpers (norm/scoreContains) from the legacy block to consolidate utilities.

/**
 * All umbrella category rules.
 * This is intentionally data-heavy; do not add logic here beyond static config.
 */
export const UMBRELLA_CATEGORY_RULES: UmbrellaCategoryRule[] = [
  {
    id: "GASTROINTESTINAL",
    label: "Gastrointestinal",
    description:
      "GI tract, liver, pancreas, motility, acid suppression, antiemetics, laxatives, antidiarrheals.",
    categoryKeywords: [
      "gastrointestinal",
      "gi",
      "gi tract",
      "acid suppress",
      "antiulcer",
      "anti-ulcer",
      "ulcer",
      "ppi",
      "proton pump inhibitor",
      "h2 blocker",
      "antacid",
      "antiemetic",
      "anti-emetic",
      "emetic",
      "laxative",
      "cathartic",
      "stool softener",
      "antidiarrheal",
      "antidiarrhoea",
      "antispasmodic",
      "spasmolytic",
      "hepatic",
      "liver",
      "pancreatic",
      "pancreatin",
      "digestive enzyme",
      "cholagogue",
      "cholestatic",
    ],
    genericKeywords: [
      "omeprazole",
      "pantoprazole",
      "esomeprazole",
      "lansoprazole",
      "rabeprazole",
      "ranitidine",
      "famotidine",
      "cimetidine",
      "domperidone",
      "metoclopramide",
      "ondansetron",
      "granisetron",
      "loperamide",
      "diphenoxylate",
      "bisacodyl",
      "senna",
      "sennoside",
      "lactulose",
      "polyethylene glycol",
      "macrogol",
      "ors",
      "oral rehydration",
      "pancreatin",
      "ursodeoxycholic",
      "ursodiol",
      "cholestyramine",
    ],
  },
  {
    id: "RESPIRATORY",
    label: "Respiratory",
    description:
      "Asthma, COPD, cough, cold, bronchodilators, mucolytics, antitussives, nasal decongestants.",
    categoryKeywords: [
      "respiratory",
      "asthma",
      "copd",
      "bronchial",
      "bronchitis",
      "bronchodilator",
      "broncho dilator",
      "antiasthmatic",
      "anti-asthmatic",
      "antitussive",
      "anti-tussive",
      "cough syrup",
      "cough",
      "mucolytic",
      "expectorant",
      "cold preparation",
      "decongestant",
      "nasal spray",
      "nasal drops",
      "inhaler",
      "nebuliser",
      "nebulizer",
    ],
    genericKeywords: [
      "salbutamol",
      "albuterol",
      "terbutaline",
      "formoterol",
      "salmeterol",
      "bambuterol",
      "budesonide",
      "beclomethasone",
      "fluticasone",
      "mometasone",
      "montelukast",
      "zafirlukast",
      "theophylline",
      "aminophylline",
      "ambroxol",
      "bromhexine",
      "guaifenesin",
      "xylometazoline",
      "oxymetazoline",
      "ipratropium",
      "tiotropium",
    ],
  },
  {
    id: "CARDIOVASCULAR",
    label: "Cardiovascular (CVS)",
    description:
      "Hypertension, heart failure, ischemic heart disease, dyslipidemia, antiplatelets, anticoagulants.",
    categoryKeywords: [
      "cardiovascular",
      "cvs",
      "cardiac",
      "hypertension",
      "antihypertensive",
      "anti-hypertensive",
      "blood pressure",
      "heart failure",
      "antianginal",
      "anti-anginal",
      "ischemic heart disease",
      "ischemia",
      "statin",
      "lipid lowering",
      "antihyperlipidemic",
      "antihyperlipidaemic",
      "antiplatelet",
      "anti-platelet",
      "anticoagulant",
      "antithrombotic",
      "antithrombotic",
      "diuretic",
      "ace inhibitor",
      "angiotensin receptor blocker",
      "arb",
      "beta blocker",
      "calcium channel blocker",
    ],
    genericKeywords: [
      "amlodipine",
      "nifedipine",
      "felodipine",
      "atenolol",
      "metoprolol",
      "propranolol",
      "bisoprolol",
      "carvedilol",
      "losartan",
      "valsartan",
      "candesartan",
      "enalapril",
      "lisinopril",
      "ramipril",
      "furosemide",
      "spironolactone",
      "hydrochlorothiazide",
      "hctz",
      "torsemide",
      "atorvastatin",
      "simvastatin",
      "rosuvastatin",
      "pravastatin",
      "clopidogrel",
      "aspirin",
      "acetylsalicylic acid",
      "warfarin",
      "heparin",
      "enoxaparin",
      "digoxin",
      "isosorbide",
      "nitroglycerin",
      "glyceryl trinitrate",
    ],
  },
  {
    id: "ANTI_INFECTIVES",
    label: "Anti-infectives",
    description:
      "Antibiotics, antivirals, antifungals, antituberculars, antimalarials, anthelmintics, antiparasitics.",
    categoryKeywords: [
      "antiinfective",
      "anti-infective",
      "anti infective",
      "antibiotic",
      "antibacterial",
      "anti-bacterial",
      "antimicrobial",
      "anti-microbial",
      "antiseptic",
      "antiviral",
      "anti-viral",
      "antiretroviral",
      "art",
      "hiv",
      "antifungal",
      "anti-fungal",
      "antitubercular",
      "anti-tubercular",
      "tuberculosis",
      "tb",
      "antimalarial",
      "anti-malarial",
      "malaria",
      "anthelmintic",
      "antihelmintic",
      "antiparasitic",
      "anti-parasitic",
      "antiprotozoal",
    ],
    genericKeywords: [
      "amoxicillin",
      "ampicillin",
      "ceftriaxone",
      "cefixime",
      "cephalexin",
      "cefuroxime",
      "ciprofloxacin",
      "levofloxacin",
      "ofloxacin",
      "moxifloxacin",
      "azithromycin",
      "clarithromycin",
      "erythromycin",
      "doxycycline",
      "tetracycline",
      "metronidazole",
      "tinidazole",
      "co-trimoxazole",
      "sulfamethoxazole",
      "trimethoprim",
      "gentamicin",
      "amikacin",
      "vancomycin",
      "rifampicin",
      "isoniazid",
      "ethambutol",
      "pyrazinamide",
      "streptomycin",
      "artemether",
      "lumefantrine",
      "artemether-lumefantrine",
      "chloroquine",
      "quinine",
      "acyclovir",
      "valacyclovir",
      "oseltamivir",
      "lamivudine",
      "efavirenz",
      "tenofovir",
      "nevirapine",
      "fluconazole",
      "itraconazole",
      "clotrimazole",
      "ketoconazole",
      "albendazole",
      "mebendazole",
      "praziquantel",
      "nitrofurantoin",
    ],
  },
  {
    id: "CNS",
    label: "Central Nervous System (CNS)",
    description:
      "Antidepressants, antipsychotics, anticonvulsants, anxiolytics, sedatives, stimulants.",
    categoryKeywords: [
      "cns",
      "neuro",
      "neurologic",
      "antidepressant",
      "anti-depressant",
      "antipsychotic",
      "anti-psychotic",
      "mood stabilizer",
      "antiepileptic",
      "anti-epileptic",
      "anticonvulsant",
      "sedative",
      "hypnotic",
      "anxiolytic",
      "benzodiazepine",
      "stimulant",
      "parkinson",
      "adhd",
    ],
    genericKeywords: [
      "fluoxetine",
      "sertraline",
      "citalopram",
      "paroxetine",
      "amitriptyline",
      "imipramine",
      "haloperidol",
      "risperidone",
      "olanzapine",
      "quetiapine",
      "clozapine",
      "valproate",
      "valproic acid",
      "sodium valproate",
      "carbamazepine",
      "phenytoin",
      "lamotrigine",
      "diazepam",
      "lorazepam",
      "clonazepam",
      "alprazolam",
      "phenobarbital",
      "methylphenidate",
      "levodopa",
      "carbidopa",
      "biperiden",
    ],
  },
  {
    id: "ANESTHESIA",
    label: "Anesthesia",
    description:
      "General and local anesthetics, neuromuscular blockers, adjuncts used in anesthesia.",
    categoryKeywords: [
      "anesthesia",
      "anaesthesia",
      "anesthetic",
      "anaesthetic",
      "general anesthesia",
      "local anesthesia",
      "pre-anaesthetic",
      "premedication",
      "neuromuscular blocker",
      "muscle relaxant (anaesthesia)",
    ],
    genericKeywords: [
      "lidocaine",
      "lignocaine",
      "bupivacaine",
      "ropivacaine",
      "procaine",
      "articaine",
      "propofol",
      "ketamine",
      "thiopental",
      "etomidate",
      "midazolam",
      "fentanyl",
      "sufentanil",
      "succinylcholine",
      "suxamethonium",
      "atracurium",
      "cisatracurium",
      "rocuronium",
      "vecuronium",
    ],
  },
  {
    id: "MUSCULOSKELETAL",
    label: "Musculoskeletal",
    description:
      "Analgesics, NSAIDs, muscle relaxants, gout drugs, osteoporosis therapies.",
    categoryKeywords: [
      "musculoskeletal",
      "rheumatology",
      "rheumatic",
      "analgesic",
      "pain relief",
      "nsaid",
      "nonsteroidal anti-inflammatory",
      "anti-inflammatory",
      "muscle relaxant",
      "antispasmodic (muscle)",
      "gout",
      "osteoporosis",
      "bone health",
    ],
    genericKeywords: [
      "paracetamol",
      "acetaminophen",
      "ibuprofen",
      "diclofenac",
      "naproxen",
      "ketoprofen",
      "meloxicam",
      "celecoxib",
      "tramadol",
      "codeine",
      "morphine",
      "pethidine",
      "thiocolchicoside",
      "tizanidine",
      "baclofen",
      "colchicine",
      "allopurinol",
      "febuxostat",
      "alendronate",
      "risedronate",
      "calcitonin",
    ],
  },
  {
    id: "OPHTHALMIC",
    label: "Ophthalmic",
    description: "Eye preparations: drops, ointments, intraocular therapies.",
    categoryKeywords: [
      "ophthalmic",
      "eye",
      "ocular",
      "eye drops",
      "eye ointment",
      "eye gel",
      "intraocular",
      "glaucoma",
      "tear substitute",
    ],
    genericKeywords: [
      "timolol",
      "latanoprost",
      "bimatoprost",
      "brimonidine",
      "pilocarpine",
      "tobramycin",
      "gentamicin",
      "ciprofloxacin",
      "chloramphenicol",
      "ofloxacin",
      "olopatadine",
      "ketotifen",
      "artificial tears",
      "carboxymethylcellulose",
      "hyaluronate",
    ],
  },
  {
    id: "BLOOD",
    label: "Blood",
    description:
      "Hematinics, iron, B12, folate, erythropoiesis-stimulating agents, some coagulation-related drugs.",
    categoryKeywords: [
      "hematinic",
      "haematinic",
      "iron supplement",
      "iron and folate",
      "anemia",
      "anaemia",
      "erythropoietin",
      "anticoagulant",
      "antiplatelet",
      "coagulation",
      "hemostatic",
      "haemostatic",
    ],
    genericKeywords: [
      "ferrous",
      "iron",
      "ferric",
      "folic acid",
      "folate",
      "vitamin b12",
      "cyanocobalamin",
      "hydroxocobalamin",
      "erythropoietin",
      "epoetin",
      "tranexamic",
      "etamsylate",
    ],
  },
  {
    id: "ENDO_CONTRACEPTIVES",
    label: "Endocrine & Contraceptives",
    description:
      "Diabetes, thyroid, adrenal hormones and combined hormonal or progestin-only contraceptives.",
    categoryKeywords: [
      "endocrine",
      "diabetes",
      "antidiabetic",
      "anti-diabetic",
      "insulin",
      "thyroid",
      "hypothyroidism",
      "hyperthyroidism",
      "hormone replacement",
      "hrt",
      "contraceptive",
      "oral contraceptive",
      "ocp",
      "family planning",
      "injectable contraceptive",
      "implant",
    ],
    genericKeywords: [
      "metformin",
      "glibenclamide",
      "glyburide",
      "glimepiride",
      "gliclazide",
      "insulin",
      "aspart",
      "lispro",
      "glargine",
      "detemir",
      "levothyroxine",
      "thyroxine",
      "methimazole",
      "carbimazole",
      "ethinylestradiol",
      "levonorgestrel",
      "norethisterone",
      "medroxyprogesterone",
      "desogestrel",
      "drospirenone",
    ],
  },
  {
    id: "VACCINES",
    label: "Vaccines",
    description:
      "Preventive immunization products: childhood schedule, adult vaccines, toxoids.",
    categoryKeywords: [
      "vaccine",
      "vaccination",
      "immunization",
      "immunisation",
      "toxoid",
      "boosters",
      "penta",
      "pentavalent",
      "bcg",
      "mmr",
      "hpv vaccine",
    ],
    genericKeywords: [
      "bcg",
      "measles vaccine",
      "mmr",
      "dpt",
      "diphtheria",
      "tetanus toxoid",
      "polio vaccine",
      "opv",
      "ipv",
      "hepatitis b vaccine",
      "pneumococcal vaccine",
      "hpv",
      "rabies vaccine",
      "influenza vaccine",
      "covid-19 vaccine",
    ],
  },
  {
    id: "IMMUNOMODULATORS",
    label: "Immunomodulators",
    description:
      "Systemic steroids, immunosuppressants, biologics primarily used to modulate immune response.",
    categoryKeywords: [
      "immunomodulator",
      "immunomodulatory",
      "immunosuppressant",
      "immunosuppressive",
      "biologic",
      "disease modifying",
      "dmard",
      "autoimmune",
      "rheumatoid arthritis",
      "transplant",
    ],
    genericKeywords: [
      "prednisone",
      "prednisolone",
      "dexamethasone",
      "hydrocortisone",
      "methylprednisolone",
      "azathioprine",
      "cyclosporine",
      "cyclosporin",
      "tacrolimus",
      "mycophenolate",
      "methotrexate",
      "infliximab",
      "adalimumab",
      "rituximab",
    ],
  },
  {
    id: "DERMATOLOGICAL",
    label: "Dermatological",
    description:
      "Topical creams, ointments, lotions, gels for skin conditions, acne, infections, inflammation.",
    categoryKeywords: [
      "dermatological",
      "dermatology",
      "skin",
      "topical",
      "acne",
      "psoriasis",
      "eczema",
      "atopic dermatitis",
      "antifungal cream",
      "antiseptic cream",
      "keratolytic",
    ],
    genericKeywords: [
      "clotrimazole",
      "miconazole",
      "ketoconazole",
      "terbinafine",
      "salicylic acid",
      "benzoyl peroxide",
      "tretinoin",
      "adapalene",
      "betamethasone",
      "hydrocortisone",
      "clobetasol",
      "fusidic acid",
      "neomycin",
      "silver sulfadiazine",
      "urea cream",
    ],
  },
  {
    id: "VITAMINS",
    label: "Vitamins & Supplements",
    description:
      "Vitamins, minerals, multivitamins, nutritional supplements, trace elements.",
    categoryKeywords: [
      "vitamin",
      "multivitamin",
      "multi-vitamin",
      "supplement",
      "nutritional supplement",
      "mineral",
      "trace element",
      "nutrition",
    ],
    genericKeywords: [
      "vitamin a",
      "retinol",
      "vitamin b",
      "thiamine",
      "riboflavin",
      "niacin",
      "pyridoxine",
      "vitamin b6",
      "vitamin b12",
      "cyanocobalamin",
      "folic acid",
      "folate",
      "vitamin c",
      "ascorbic",
      "vitamin d",
      "cholecalciferol",
      "vitamin e",
      "tocopherol",
      "zinc",
      "iron and folate",
      "calcium",
      "magnesium",
      "multivitamin",
    ],
  },
  {
    id: "OB_GYN",
    label: "Obstetrics & Gynecological",
    description:
      "Drugs used in labour, postpartum haemorrhage, gynecological infections and hormonal support.",
    categoryKeywords: [
      "obstetric",
      "obstetrics",
      "gynecologic",
      "gynaecologic",
      "labour",
      "labor",
      "uterotonic",
      "oxytocic",
      "postpartum haemorrhage",
      "pph",
      "tocolytic",
      "infertility",
      "pcos",
    ],
    genericKeywords: [
      "oxytocin",
      "misoprostol",
      "ergometrine",
      "methylergometrine",
      "carbetocin",
      "clomiphene",
      "clomifene",
      "letrozole",
      "metronidazole",
      "doxycycline",
    ],
  },
  {
    id: "BPH",
    label: "Benign Prostate Hyperplasia (BPH)",
    description:
      "Drugs for BPH: alpha blockers and 5-alpha-reductase inhibitors targeting lower urinary tract symptoms.",
    categoryKeywords: [
      "bph",
      "benign prostatic hyperplasia",
      "prostate",
      "lower urinary tract symptoms",
      "luts",
      "uroselective alpha blocker",
    ],
    genericKeywords: [
      "tamsulosin",
      "alfuzosin",
      "doxazosin",
      "terazosin",
      "silodosin",
      "finasteride",
      "dutasteride",
    ],
  },
  {
    id: "FLUID_ELECTROLYTE",
    label: "Fluid & Electrolyte Replacement",
    description:
      "IV fluids, oral rehydration, electrolytes, dextrose solutions, parenteral nutrition components.",
    categoryKeywords: [
      "fluid",
      "electrolyte",
      "iv fluids",
      "intravenous fluids",
      "oral rehydration",
      "ors",
      "parenteral nutrition",
      "crystalloid",
      "colloid",
    ],
    genericKeywords: [
      "sodium chloride",
      "normal saline",
      "0.9% nacl",
      "ringer lactate",
      "lactated ringer",
      "dextrose",
      "glucose 5%",
      "d5w",
      "d10w",
      "potassium chloride",
      "oral rehydration salts",
      "ors",
      "sodium bicarbonate",
    ],
  },
  {
    id: "ANTINEOPLASTICS_SUPPORT",
    label: "Antineoplastics & Supportive",
    description:
      "Cytotoxic chemotherapy and supportive agents used in oncology.",
    categoryKeywords: [
      "antineoplastic",
      "anti-neoplastic",
      "chemotherapy",
      "cytotoxic",
      "oncology",
      "antitumor",
      "anti-tumour",
    ],
    genericKeywords: [
      "cyclophosphamide",
      "doxorubicin",
      "epirubicin",
      "vincristine",
      "vinblastine",
      "methotrexate",
      "cisplatin",
      "carboplatin",
      "paclitaxel",
      "docetaxel",
      "fluorouracil",
      "5-fu",
      "tamoxifen",
      "letrozole",
      "anastrozole",
      "filgrastim",
      "ondansetron",
      "granisetron",
      "palonosetron",
    ],
  },
  {
    id: "ENT",
    label: "Ear, Nose & Throat Preparations",
    description:
      "Ear drops, nasal sprays, lozenges and other ENT-focused treatments.",
    categoryKeywords: [
      "ent",
      "ear nose throat",
      "ear",
      "nose",
      "throat",
      "otic",
      "auricular",
      "nasal spray",
      "nasal drops",
      "nasal",
      "lozenge",
      "gargle",
      "throat spray",
      "decongestant",
    ],
    genericKeywords: [
      "xylometazoline",
      "oxymetazoline",
      "chloramphenicol ear",
      "ciprofloxacin ear",
      "neomycin ear",
      "nystatin suspension",
      "lidocaine throat",
      "benzocaine lozenge",
      "flurbiprofen lozenge",
      "povidone iodine gargle",
    ],
  },
  {
    id: "SERA_IG",
    label: "Sera & Immunoglobulin",
    description:
      "Immune globulins and antisera for passive immunization (e.g. anti-rabies, anti-tetanus).",
    categoryKeywords: [
      "immunoglobulin",
      "immune globulin",
      "ig",
      "antiserum",
      "anti-serum",
      "antitoxin",
      "anti-toxin",
      "anti-rabies serum",
      "anti-tetanus serum",
    ],
    genericKeywords: [
      "anti-rabies immunoglobulin",
      "rabies immunoglobulin",
      "tetanus immunoglobulin",
      "hepatitis b immunoglobulin",
      "ivig",
      "intravenous immunoglobulin",
    ],
  },
  {
    id: "ANTIDOTES_POISONING",
    label: "Antidotes & Used in Poisoning",
    description:
      "Specific antidotes and agents used for acute poisoning and overdose management.",
    categoryKeywords: [
      "antidote",
      "poisoning",
      "toxicity",
      "overdose",
      "toxicology",
      "poison control",
    ],
    genericKeywords: [
      "naloxone",
      "flumazenil",
      "atropine",
      "pralidoxime",
      "2-pam",
      "n-acetylcysteine",
      "acetylcysteine",
      "activated charcoal",
      "desferrioxamine",
      "deferoxamine",
      "fomepizole",
      "calcium gluconate",
    ],
  },
  {
    id: "RADIOCONTRAST",
    label: "Radiocontrast Media",
    description:
      "Iodinated and other contrast agents used in radiographic and CT imaging.",
    categoryKeywords: [
      "contrast",
      "radiocontrast",
      "radiopaque",
      "contrast media",
      "iodinated contrast",
      "ct contrast",
      "x-ray contrast",
    ],
    genericKeywords: [
      "iohexol",
      "iodixanol",
      "iopamidol",
      "iomeprol",
      "diatrizoate",
      "barium sulfate",
    ],
  },
  {
    id: "MISC",
    label: "Miscellaneous (Devices & Others)",
    description:
      "Medical devices, disposables, diagnostics, and items not clearly classified elsewhere.",
    categoryKeywords: [
      "device",
      "medical device",
      "surgical",
      "instrument",
      "disposable",
      "non-drug",
      "miscellaneous",
      "other",
      "diagnostic",
      "equipment",
    ],
    genericKeywords: [
      "glucometer",
      "stethoscope",
      "sphygmomanometer",
      "bp apparatus",
      "blood pressure monitor",
      "thermometer",
      "pulse oximeter",
      "autoclave",
      "nebulizer",
      "nebuliser",
      "suction machine",
      "suture",
      "catheter",
      "cannula",
    ],
    deviceKeywords: [
      "scalpel",
      "scissors",
      "forceps",
      "needle",
      "syringe",
      "catheter",
      "cannula",
      "glove",
      "gloves",
      "mask",
      "face mask",
      "gauze",
      "bandage",
      "plaster",
      "tape",
      "dressing",
      "speculum",
      "set",
      "infusion set",
      "giving set",
      "test strip",
      "strip",
      "lancet",
    ],
  },
];

export const UMBRELLA_CATEGORY_INDEX: Record<UmbrellaCategoryId, UmbrellaCategoryRule> = UMBRELLA_CATEGORY_RULES.reduce(
  (acc, r) => {
    acc[r.id] = r;
    return acc;
  },
  {} as Record<UmbrellaCategoryId, UmbrellaCategoryRule>
);

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
// Removed duplicate UMBRELLA_CATEGORY_INDEX; unified above.
/**
 * Module: Therapeutic Umbrella Categories
 * Purpose: Provide stable umbrella categories and mapping utilities used by UI and analytics.
 * Features:
 * - 3-letter code → umbrella mapping (`CATEGORY_CODE_TO_UMBRELLA`).
 * - Text-based classification (`classifyUmbrellaCategory`) with weighted signals and guardrails.
 * Signed: EyosiyasJ
 */
