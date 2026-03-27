#!/usr/bin/env node
/**
 * Boat data validation utilities
 */

/** US postal abbrev → canonical full name (location / `state` field normalization). */
const US_STATE_BY_ABBR = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

/**
 * Collect accepted forms for `boatData.state` and lowercase substrings for city/location.
 * @param {string} requiredState
 */
function requiredStateHints(requiredState) {
  const raw = (requiredState ?? '').trim();
  // `*` = US-wide; empty = misconfiguration — do not run substring checks (`includes('')` is always true).
  if (!raw || raw === '*') {
    return { skip: true, stateForms: [], locationSubstrings: [] };
  }

  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  const stateForms = new Set([raw, upper, lower]);

  if (raw.length === 2 && US_STATE_BY_ABBR[upper]) {
    const full = US_STATE_BY_ABBR[upper];
    stateForms.add(full);
    stateForms.add(full.toLowerCase());
  } else if (raw.length > 2) {
    const abbr = Object.entries(US_STATE_BY_ABBR).find(
      ([, name]) => name.toLowerCase() === lower,
    )?.[0];
    if (abbr) {
      stateForms.add(abbr);
      stateForms.add(abbr.toLowerCase());
    }
  }

  const locationSubstrings = new Set([lower]);
  if (raw.length === 2 && US_STATE_BY_ABBR[upper]) {
    locationSubstrings.add(US_STATE_BY_ABBR[upper].toLowerCase());
  } else if (raw.length > 2) {
    const abbr = Object.entries(US_STATE_BY_ABBR).find(
      ([, name]) => name.toLowerCase() === lower,
    )?.[0];
    if (abbr) locationSubstrings.add(abbr.toLowerCase());
  }

  return {
    skip: false,
    stateForms: [...stateForms],
    locationSubstrings: [...locationSubstrings],
  };
}

/**
 * @param {Record<string, unknown>} boatData
 * @param {{ stateForms: string[], locationSubstrings: string[] }} hints
 */
function boatMatchesRequiredState(boatData, hints) {
  const boatState = String(boatData.state ?? '').trim();
  if (boatState) {
    const boatLower = boatState.toLowerCase();
    if (hints.stateForms.some((f) => f.toLowerCase() === boatLower)) {
      return true;
    }
  }

  const haystacks = [boatData.location, boatData.city]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  for (const hay of haystacks) {
    if (hints.locationSubstrings.some((sub) => hay.includes(sub))) {
      return true;
    }
  }

  return false;
}

/**
 * Validate boat meets our criteria:
 * - Sport fisher type
 * - 40-60 feet in length
 * - Reasonable price
 * - Location in `requiredState` (full name, 2-letter code), or any US listing when `requiredState` is `'*'`
 */
export function validateBoat(boatData, options = {}) {
  const {
    minLength = 40,
    maxLength = 60,
    minPrice = 50000,
    maxPrice = 10000000,
    requiredState = 'Texas',
  } = options;

  const errors = [];
  const warnings = [];

  // 1. Length validation
  if (!boatData.length) {
    errors.push('Missing length');
  } else {
    const length = parseFloat(boatData.length);
    if (isNaN(length)) {
      errors.push(`Invalid length: ${boatData.length}`);
    } else if (length < minLength || length > maxLength) {
      errors.push(`Length ${length}ft outside range ${minLength}-${maxLength}ft`);
    }
  }

  // 2. Price validation
  if (boatData.price) {
    const price = parseInt(boatData.price, 10);
    if (isNaN(price)) {
      errors.push(`Invalid price: ${boatData.price}`);
    } else if (price < minPrice) {
      warnings.push(`Price $${price.toLocaleString()} seems too low for a ${boatData.length || '?'}ft boat`);
    } else if (price > maxPrice) {
      warnings.push(`Price $${price.toLocaleString()} seems unusually high`);
    }
  }

  // 3. Location validation (requiredState or '*' for US-wide — no geographic filter)
  const locationHints = requiredStateHints(requiredState);
  if (!locationHints.skip && !boatMatchesRequiredState(boatData, locationHints)) {
    errors.push(
      `Not in required region (${String(requiredState).trim()}): ${boatData.location || boatData.state || 'Unknown'}`,
    );
  }

  // 4. Boat type validation (sport fisher)
  const boatType = determineBoatType(boatData);
  if (boatType !== 'sport_fisher' && boatType !== 'unknown') {
    errors.push(`Not a sport fisher: ${boatType} (${boatData.make} ${boatData.model})`);
  }

  // 5. Year validation (reasonable range)
  if (boatData.year) {
    const year = parseInt(boatData.year, 10);
    const currentYear = new Date().getFullYear();
    if (year < 1950 || year > currentYear + 1) {
      warnings.push(`Unusual year: ${year}`);
    }
  }

  // 6. Make/Model validation
  if (!boatData.make || !boatData.model) {
    warnings.push('Missing make or model');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    boatType,
  };
}

/**
 * Determine boat type from data
 */
function determineBoatType(boatData) {
  const text = [
    boatData.make,
    boatData.model,
    boatData.title,
    boatData.description,
    boatData.fullText,
    boatData.listingType,
  ].filter(Boolean).join(' ').toLowerCase();

  const boatClass = (boatData.listingType || '').toLowerCase();

  const knownFishingClasses = [
    'sport fishing',
    'sportfish',
    'center console',
    'saltwater fishing',
    'sport fishing boat',
    'convertible',
    'billfish',
  ];

  const knownNonFishingClasses = [
    'motor yacht',
    'motoryacht',
    'houseboat',
    'pontoon',
    'catamaran',
    'sedan bridge',
    'aft cabin',
    'trawler',
    'express cruiser',
    'flybridge',
    'cruiser',
  ];

  if (knownFishingClasses.some((keyword) => boatClass.includes(keyword))) {
    return 'sport_fisher';
  }

  if (knownNonFishingClasses.some((keyword) => boatClass.includes(keyword))) {
    return 'not_sport_fisher';
  }

  // Sport fisher indicators (more specific)
  const sportFisherKeywords = [
    'sport fisher', 'sportfisher', 'sport fish', 'sportfish',
    'convertible', 'fishing', 'tuna', 'marlin', 'offshore',
    'cabo', 'bertram', 'hatteras', 'viking', 'contender',
    'yellowfin', 'everglades', 'intrepid', 'scout', 'grady-white',
    'pursuit', 'striper', 'center console', 'express sport',
    'sport express', 'fishing boat', 'sport fishing',
  ];

  // Non-sport fisher indicators (more comprehensive)
  const nonSportFisherKeywords = [
    'houseboat', 'pontoon', 'sail', 'catamaran', 'motor yacht',
    'cruiser', 'sedan bridge', 'aft cabin', 'trawler', 'bass boat',
    'bay boat', 'flats boat', 'skiff', 'jon boat', 'canoe', 'kayak',
    'sundancer', 'sundancer', 'sundancer', // Sea Ray Sundancer is a cruiser
    'sedan', 'bridge', 'motoryacht', 'motor yacht',
    'yacht', 'luxury', 'cockpit', 'aft cockpit',
  ];

  const hasSportFisher = sportFisherKeywords.some(keyword => text.includes(keyword));
  const hasNonSportFisher = nonSportFisherKeywords.some(keyword => text.includes(keyword));

  if (hasNonSportFisher && !hasSportFisher) {
    return 'not_sport_fisher';
  }

  if (hasSportFisher) {
    return 'sport_fisher';
  }

  return 'unknown';
}

/**
 * Extract and normalize length from text
 */
export function extractLength(text) {
  if (!text) return null;

  // Patterns: "40ft", "40'", "40 feet", "40 LOA", etc.
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:ft|feet|'|foot)\s*(?:loa|length|overall)?/i,
    /(\d+(?:\.\d+)?)\s*(?:loa|length|overall)/i,
    /length[:\s]+(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const length = parseFloat(match[1]);
      if (length >= 20 && length <= 200) { // Reasonable boat length range
        return length.toString();
      }
    }
  }

  return null;
}

/**
 * Clean and validate price
 */
export function cleanPrice(priceText) {
  if (!priceText) return null;

  // Keep digits only so values like "US$349,000" normalize correctly.
  const cleaned = priceText.toString().replace(/[^\d]/g, '');
  const price = parseInt(cleaned, 10);

  if (isNaN(price) || price < 1000 || price > 50000000) {
    return null;
  }

  return price.toString();
}
