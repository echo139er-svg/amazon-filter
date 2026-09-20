'use strict';

const {
  parseStarRating,
  parseReviewCount,
  passesFilter,
  parseFiveStarPct,
  parseDeliveryDays,
} = require('../content.js');

// ─── parseStarRating ──────────────────────────────────────────────────────────

describe('parseStarRating', () => {
  test('parses standard format', () => {
    expect(parseStarRating('4.3 out of 5 stars')).toBe(4.3);
  });

  test('parses integer rating', () => {
    expect(parseStarRating('5 out of 5 stars')).toBe(5);
  });

  test('parses with leading/trailing whitespace', () => {
    expect(parseStarRating('  3.8 out of 5 stars  ')).toBe(3.8);
  });

  test('returns null for empty string', () => {
    expect(parseStarRating('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseStarRating(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(parseStarRating(undefined)).toBeNull();
  });

  test('returns null for unrecognised format', () => {
    expect(parseStarRating('four point three stars')).toBeNull();
  });

  test('returns null for rating text with no "out of 5"', () => {
    expect(parseStarRating('4.3 stars')).toBeNull();
  });

  test('handles 1.0 correctly', () => {
    expect(parseStarRating('1.0 out of 5 stars')).toBe(1.0);
  });
});

// ─── parseReviewCount ─────────────────────────────────────────────────────────

describe('parseReviewCount', () => {
  test('parses comma-separated count with "ratings" suffix', () => {
    expect(parseReviewCount('1,234 ratings')).toBe(1234);
  });

  test('parses count with "reviews" suffix', () => {
    expect(parseReviewCount('850 reviews')).toBe(850);
  });

  test('parses count from aria-label style text', () => {
    expect(parseReviewCount('12,456 global ratings')).toBe(12456);
  });

  test('parses large number with multiple commas', () => {
    expect(parseReviewCount('1,234,567 ratings')).toBe(1234567);
  });

  test('parses K suffix (26K → 26000)', () => {
    expect(parseReviewCount('26K ratings')).toBe(26000);
  });

  test('parses decimal K suffix (1.2K → 1200)', () => {
    expect(parseReviewCount('1.2K ratings')).toBe(1200);
  });

  test('parses M suffix (1.5M → 1500000)', () => {
    expect(parseReviewCount('1.5M ratings')).toBe(1500000);
  });

  test('parses lowercase k suffix', () => {
    expect(parseReviewCount('5k reviews')).toBe(5000);
  });

  test('returns 0 for empty string', () => {
    expect(parseReviewCount('')).toBe(0);
  });

  test('returns 0 for null', () => {
    expect(parseReviewCount(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(parseReviewCount(undefined)).toBe(0);
  });

  test('returns 0 for non-numeric text', () => {
    expect(parseReviewCount('Leave ad feedback')).toBe(0);
  });

  test('returns 0 for empty-ish text', () => {
    expect(parseReviewCount('   ')).toBe(0);
  });
});

// ─── parseFiveStarPct ─────────────────────────────────────────────────────────

describe('parseFiveStarPct', () => {
  test('parses primary aria-label format', () => {
    const html = `<span aria-label="67% of reviews have 5 stars">67%</span>`;
    expect(parseFiveStarPct(html)).toBe(67);
  });

  test('parses aria-label with different percentage', () => {
    const html = `<span aria-label="42% of reviews have 5 stars">stuff</span>`;
    expect(parseFiveStarPct(html)).toBe(42);
  });

  test('falls back to prose pattern', () => {
    const html = `<div>5 star\n<span class="a-size-base">72%</span></div>`;
    expect(parseFiveStarPct(html)).toBe(72);
  });

  test('returns null when no pattern matches', () => {
    const html = `<div>Some unrelated content</div>`;
    expect(parseFiveStarPct(html)).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseFiveStarPct(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseFiveStarPct('')).toBeNull();
  });

  test('handles 100%', () => {
    const html = `<span aria-label="100% of reviews have 5 stars">100%</span>`;
    expect(parseFiveStarPct(html)).toBe(100);
  });

  test('aria-label takes precedence over prose fallback', () => {
    // Both present — aria-label should win
    const html = `
      <span aria-label="80% of reviews have 5 stars">80%</span>
      <div>5 star 50%</div>
    `;
    expect(parseFiveStarPct(html)).toBe(80);
  });
});

// ─── parseDeliveryDays ────────────────────────────────────────────────────────

describe('parseDeliveryDays', () => {
  const ref = new Date(2026, 0, 10); // Jan 10, 2026 — fixed "today" for determinism

  test('returns null for Prime-badged text regardless of the date present', () => {
    expect(parseDeliveryDays('Join Prime to get FREE delivery Tomorrow, Jan 11', ref)).toBeNull();
  });

  test('parses a single near-term date', () => {
    expect(parseDeliveryDays('FREE delivery Jan 12', ref)).toBe(2);
  });

  test('parses the start of a "Month Day - Month Day" range', () => {
    expect(parseDeliveryDays('$6.99 delivery Jan 20 - Jan 29', ref)).toBe(10);
  });

  test('parses the start of a "Month Day - Day" range (second month omitted)', () => {
    expect(parseDeliveryDays('$3.99 delivery Jan 25 - 30', ref)).toBe(15);
  });

  test('rolls over into next year across a December/January boundary', () => {
    const decRef = new Date(2025, 11, 28); // Dec 28, 2025
    expect(parseDeliveryDays('$4.99 delivery Jan 3 - 5', decRef)).toBe(6);
  });

  test('clamps to 0 for a date that is today', () => {
    expect(parseDeliveryDays('FREE delivery Jan 10', ref)).toBe(0);
  });

  test('returns null when no date is present', () => {
    expect(parseDeliveryDays('Delivery cost varies', ref)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseDeliveryDays('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseDeliveryDays(null)).toBeNull();
  });
});

// ─── passesFilter ─────────────────────────────────────────────────────────────

describe('passesFilter', () => {
  const defaultCfg = {
    minReviews: 1000,
    minStars: 4.0,
    minFiveStarPct: 0,
    filterFrequentlyReturned: true,
  };

  const goodProduct = {
    stars: 4.5,
    reviewCount: 2000,
    frequentlyReturned: false,
    fiveStarPct: 70,
  };

  test('passes a product meeting all thresholds', () => {
    expect(passesFilter(goodProduct, defaultCfg)).toBe(true);
  });

  test('filters product below minReviews', () => {
    const data = { ...goodProduct, reviewCount: 500 };
    expect(passesFilter(data, defaultCfg)).toBe(false);
  });

  test('filters product below minStars', () => {
    const data = { ...goodProduct, stars: 3.8 };
    expect(passesFilter(data, defaultCfg)).toBe(false);
  });

  test('filters product with stars exactly at threshold (boundary)', () => {
    const data = { ...goodProduct, stars: 4.0 };
    expect(passesFilter(data, defaultCfg)).toBe(true); // 4.0 >= 4.0 → pass
  });

  test('filters product just below star threshold', () => {
    const data = { ...goodProduct, stars: 3.9 };
    expect(passesFilter(data, defaultCfg)).toBe(false);
  });

  test('skips star filter when stars is null', () => {
    const data = { ...goodProduct, stars: null };
    expect(passesFilter(data, defaultCfg)).toBe(true);
  });

  test('filters frequently returned product when toggle is on', () => {
    const data = { ...goodProduct, frequentlyReturned: true };
    expect(passesFilter(data, defaultCfg)).toBe(false);
  });

  test('allows frequently returned product when toggle is off', () => {
    const data = { ...goodProduct, frequentlyReturned: true };
    const cfg = { ...defaultCfg, filterFrequentlyReturned: false };
    expect(passesFilter(data, cfg)).toBe(true);
  });

  test('filters by 5-star % when minFiveStarPct > 0 and pct is available', () => {
    const data = { ...goodProduct, fiveStarPct: 40 };
    const cfg = { ...defaultCfg, minFiveStarPct: 60 };
    expect(passesFilter(data, cfg)).toBe(false);
  });

  test('passes 5-star % threshold when pct meets minimum', () => {
    const data = { ...goodProduct, fiveStarPct: 65 };
    const cfg = { ...defaultCfg, minFiveStarPct: 60 };
    expect(passesFilter(data, cfg)).toBe(true);
  });

  test('skips 5-star % filter when minFiveStarPct is 0', () => {
    const data = { ...goodProduct, fiveStarPct: 10 };
    const cfg = { ...defaultCfg, minFiveStarPct: 0 };
    expect(passesFilter(data, cfg)).toBe(true);
  });

  test('skips 5-star % filter when fiveStarPct is null (not yet fetched)', () => {
    const data = { ...goodProduct, fiveStarPct: null };
    const cfg = { ...defaultCfg, minFiveStarPct: 60 };
    expect(passesFilter(data, cfg)).toBe(true);
  });

  test('filters product with 0 reviews (new/unlisted)', () => {
    const data = { ...goodProduct, reviewCount: 0 };
    expect(passesFilter(data, defaultCfg)).toBe(false);
  });

  test('passes product with exactly minReviews (boundary)', () => {
    const data = { ...goodProduct, reviewCount: 1000 };
    expect(passesFilter(data, defaultCfg)).toBe(true);
  });

  test('all filters off: passes any product', () => {
    const cfg = {
      minReviews: 0,
      minStars: 1.0,
      minFiveStarPct: 0,
      filterFrequentlyReturned: false,
    };
    const data = { stars: 1.0, reviewCount: 0, frequentlyReturned: true, fiveStarPct: 0 };
    expect(passesFilter(data, cfg)).toBe(true);
  });
});

// ─── passesFilter — slow/overseas delivery ────────────────────────────────────

describe('passesFilter — slow delivery', () => {
  const cfg = {
    minReviews: 0,
    minStars: 1.0,
    minFiveStarPct: 0,
    filterFrequentlyReturned: false,
    filterSlowDelivery: true,
    maxDeliveryDays: 10,
  };
  const base = { stars: 4.5, reviewCount: 2000, frequentlyReturned: false, fiveStarPct: null };

  test('filters a listing whose delivery estimate exceeds the threshold', () => {
    expect(passesFilter({ ...base, deliveryDays: 15 }, cfg)).toBe(false);
  });

  test('passes a listing within the threshold', () => {
    expect(passesFilter({ ...base, deliveryDays: 5 }, cfg)).toBe(true);
  });

  test('passes a listing exactly at the threshold (boundary)', () => {
    expect(passesFilter({ ...base, deliveryDays: 10 }, cfg)).toBe(true);
  });

  test('skips the check when deliveryDays is null (unknown or Prime)', () => {
    expect(passesFilter({ ...base, deliveryDays: null }, cfg)).toBe(true);
  });

  test('skips the check entirely when filterSlowDelivery is off', () => {
    const offCfg = { ...cfg, filterSlowDelivery: false };
    expect(passesFilter({ ...base, deliveryDays: 999 }, offCfg)).toBe(true);
  });
});
