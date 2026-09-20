'use strict';

const { applyFilter, clearFilter } = require('../content.js');

// Mock settings used internally by applyFilter
// We expose settings indirectly — applyFilter references the module-level `settings` var.
// To control it in tests, we patch via jest.mock or by reassigning module internals.
// Since content.js uses a closure-level `settings`, we use a workaround:
// require the module, then override via the exported functions' behaviour,
// but since settings isn't exported, we test via observable DOM state.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(asin = 'B001234567') {
  const div = document.createElement('div');
  div.setAttribute('data-asin', asin);
  div.setAttribute('data-component-type', 's-search-result');
  document.body.appendChild(div);
  return div;
}

const sampleData = {
  stars: 3.5,
  reviewCount: 200,
  frequentlyReturned: false,
  fiveStarPct: 30,
};

beforeEach(() => {
  document.body.innerHTML = '';
  // Re-require fresh module with hide mode
  jest.resetModules();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── applyFilter (hide mode) ──────────────────────────────────────────────────

describe('applyFilter — hide mode', () => {
  let applyFilterFn, clearFilterFn;

  beforeEach(() => {
    // content.js reads `settings.mode` at call time; since settings isn't
    // exported we test the hide path by checking display style after calling
    // applyFilter with show=false and the internal mode being 'hide' (default).
    jest.resetModules();
    const mod = require('../content.js');
    applyFilterFn = mod.applyFilter;
    clearFilterFn = mod.clearFilter;
  });

  test('hides card when show=false (default hide mode)', () => {
    const card = makeCard();
    applyFilterFn(card, false, sampleData);
    // Default mode is 'hide'
    expect(card.style.display).toBe('none');
  });

  test('sets data-amzf-filtered="true" when filtering', () => {
    const card = makeCard();
    applyFilterFn(card, false, sampleData);
    expect(card.getAttribute('data-amzf-filtered')).toBe('true');
  });

  test('does not add badge in hide mode', () => {
    const card = makeCard();
    applyFilterFn(card, false, sampleData);
    expect(card.querySelector('.amzf-badge')).toBeNull();
  });

  test('shows card when show=true', () => {
    const card = makeCard();
    // First hide it
    applyFilterFn(card, false, sampleData);
    // Then show it
    applyFilterFn(card, true, sampleData);
    expect(card.style.display).toBe('');
    expect(card.getAttribute('data-amzf-filtered')).toBeNull();
  });
});

// ─── clearFilter ─────────────────────────────────────────────────────────────

describe('clearFilter', () => {
  let applyFilterFn, clearFilterFn;

  beforeEach(() => {
    jest.resetModules();
    const mod = require('../content.js');
    applyFilterFn = mod.applyFilter;
    clearFilterFn = mod.clearFilter;
  });

  test('removes data-amzf-filtered attribute', () => {
    const card = makeCard();
    applyFilterFn(card, false, sampleData);
    clearFilterFn(card);
    expect(card.getAttribute('data-amzf-filtered')).toBeNull();
  });

  test('restores display', () => {
    const card = makeCard();
    applyFilterFn(card, false, sampleData);
    clearFilterFn(card);
    expect(card.style.display).toBe('');
  });

  test('restores opacity', () => {
    const card = makeCard();
    card.style.opacity = '0.25';
    clearFilterFn(card);
    expect(card.style.opacity).toBe('');
  });

  test('removes badge if present', () => {
    const card = makeCard();
    // Manually add a badge
    const badge = document.createElement('div');
    badge.className = 'amzf-badge';
    card.appendChild(badge);
    clearFilterFn(card);
    expect(card.querySelector('.amzf-badge')).toBeNull();
  });

  test('is safe to call on a card that was never filtered', () => {
    const card = makeCard();
    expect(() => clearFilterFn(card)).not.toThrow();
  });

  test('leaves unrelated styles intact', () => {
    const card = makeCard();
    card.style.color = 'red';
    clearFilterFn(card);
    expect(card.style.color).toBe('red');
  });
});

// ─── applyFilter idempotency ──────────────────────────────────────────────────

describe('applyFilter — idempotency', () => {
  let applyFilterFn;

  beforeEach(() => {
    jest.resetModules();
    applyFilterFn = require('../content.js').applyFilter;
  });

  test('calling hide twice does not double-apply or create extra badges', () => {
    const card = makeCard();
    applyFilterFn(card, false, sampleData);
    applyFilterFn(card, false, sampleData);
    const badges = card.querySelectorAll('.amzf-badge');
    // hide mode: no badges at all
    expect(badges.length).toBe(0);
    expect(card.style.display).toBe('none');
  });

  test('toggling show/hide works correctly across multiple calls', () => {
    const card = makeCard();
    applyFilterFn(card, false, sampleData);
    expect(card.getAttribute('data-amzf-filtered')).toBe('true');
    applyFilterFn(card, true, sampleData);
    expect(card.getAttribute('data-amzf-filtered')).toBeNull();
    applyFilterFn(card, false, sampleData);
    expect(card.getAttribute('data-amzf-filtered')).toBe('true');
  });
});
