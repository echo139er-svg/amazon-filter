'use strict';

const { extractProductData } = require('../content.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(html, asin = 'B001234567') {
  const div = document.createElement('div');
  div.setAttribute('data-asin', asin);
  div.setAttribute('data-component-type', 's-search-result');
  div.innerHTML = html;
  return div;
}

// ─── extractProductData ───────────────────────────────────────────────────────

describe('extractProductData', () => {
  test('extracts ASIN from data-asin attribute', () => {
    const card = makeCard('', 'B00TEST123');
    const data = extractProductData(card);
    expect(data.asin).toBe('B00TEST123');
  });

  test('extracts star rating from .a-icon-alt', () => {
    const card = makeCard('<span class="a-icon-alt">4.5 out of 5 stars</span>');
    const data = extractProductData(card);
    expect(data.stars).toBe(4.5);
  });

  test('returns null stars when .a-icon-alt is absent', () => {
    const card = makeCard('<div>No stars here</div>');
    const data = extractProductData(card);
    expect(data.stars).toBeNull();
  });

  test('extracts review count from [aria-label*="ratings"] inside reviews block', () => {
    const card = makeCard(`
      <div data-cy="reviews-block">
        <a aria-label="2,345 ratings">2,345</a>
      </div>
    `);
    const data = extractProductData(card);
    expect(data.reviewCount).toBe(2345);
  });

  test('extracts review count from [aria-label*="reviews"] inside reviews block', () => {
    const card = makeCard(`
      <div data-cy="reviews-block">
        <a aria-label="876 reviews">876</a>
      </div>
    `);
    const data = extractProductData(card);
    expect(data.reviewCount).toBe(876);
  });

  test('falls back to .s-underline-text for review count', () => {
    const card = makeCard(`
      <div data-cy="reviews-block">
        <span class="s-underline-text">1,567</span>
      </div>
    `);
    const data = extractProductData(card);
    expect(data.reviewCount).toBe(1567);
  });

  test('ignores "Leave ad feedback" on sponsored cards outside reviews block', () => {
    const card = makeCard(`
      <div class="s-sponsored-feedback">
        <a aria-label="12 ratings">Leave ad feedback</a>
      </div>
      <div data-cy="reviews-block">
        <a aria-label="3,456 ratings">3,456</a>
      </div>
    `);
    const data = extractProductData(card);
    expect(data.reviewCount).toBe(3456);
  });

  test('defaults reviewCount to 0 when no review element is present', () => {
    const card = makeCard('<div>No reviews here</div>');
    const data = extractProductData(card);
    expect(data.reviewCount).toBe(0);
  });

  test('detects frequently returned via data-component-type', () => {
    const card = makeCard(`
      <div data-component-type="frequently-returned-badge">Frequently returned item</div>
    `);
    const data = extractProductData(card);
    expect(data.frequentlyReturned).toBe(true);
  });

  test('detects frequently returned via class name', () => {
    const card = makeCard(`
      <div class="s-frequently-returned-badge">badge</div>
    `);
    const data = extractProductData(card);
    expect(data.frequentlyReturned).toBe(true);
  });

  test('detects frequently returned via card text content', () => {
    const card = makeCard('<p>Frequently returned item</p>');
    const data = extractProductData(card);
    expect(data.frequentlyReturned).toBe(true);
  });

  test('case-insensitive frequently returned text detection', () => {
    const card = makeCard('<p>FREQUENTLY RETURNED ITEM</p>');
    const data = extractProductData(card);
    expect(data.frequentlyReturned).toBe(true);
  });

  test('frequentlyReturned is false for normal product', () => {
    const card = makeCard(`
      <span class="a-icon-alt">4.2 out of 5 stars</span>
      <div data-cy="reviews-block"><a aria-label="5,000 ratings">5,000</a></div>
    `);
    const data = extractProductData(card);
    expect(data.frequentlyReturned).toBe(false);
  });

  test('handles card with all data present', () => {
    const card = makeCard(`
      <span class="a-icon-alt">4.7 out of 5 stars</span>
      <div data-cy="reviews-block">
        <a aria-label="12,345 ratings">12,345</a>
      </div>
    `, 'B009876543');
    const data = extractProductData(card);
    expect(data.asin).toBe('B009876543');
    expect(data.stars).toBe(4.7);
    expect(data.reviewCount).toBe(12345);
    expect(data.frequentlyReturned).toBe(false);
  });
});

// ─── extractProductData — deliveryDays ─────────────────────────────────────────

describe('extractProductData — deliveryDays', () => {
  test('returns null when no delivery block is present', () => {
    const card = makeCard('<div>No delivery info</div>');
    const data = extractProductData(card);
    expect(data.deliveryDays).toBeNull();
  });

  test('returns null when the delivery message mentions Prime', () => {
    const card = makeCard(`
      <div data-cy="delivery-block">
        <div class="udm-primary-delivery-message">Join Prime to get FREE delivery Tomorrow</div>
      </div>
    `);
    const data = extractProductData(card);
    expect(data.deliveryDays).toBeNull();
  });

  test('parses a numeric delivery estimate from a non-Prime message', () => {
    const card = makeCard(`
      <div data-cy="delivery-block">
        <div class="udm-primary-delivery-message">$6.99 delivery Dec 25</div>
      </div>
    `);
    const data = extractProductData(card);
    expect(typeof data.deliveryDays).toBe('number');
  });

  test('falls back to the whole delivery-block text when the primary-message element is absent', () => {
    const card = makeCard(`
      <div data-cy="delivery-block">$4.99 delivery Dec 25</div>
    `);
    const data = extractProductData(card);
    expect(typeof data.deliveryDays).toBe('number');
  });

  test('ignores dates embedded in inline script tags', () => {
    const card = makeCard(`
      <div data-cy="delivery-block">
        <div class="udm-primary-delivery-message">
          <script>var fallbackDate = "Jan 1";</script>
          Delivery cost varies
        </div>
      </div>
    `);
    const data = extractProductData(card);
    expect(data.deliveryDays).toBeNull();
  });
});
