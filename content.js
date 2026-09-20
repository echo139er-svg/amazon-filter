/**
 * Amazon Product Filter — Content Script
 * Manifest V3, vanilla JS, no build step
 */

'use strict';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  enabled: true,
  minReviews: 1000,
  minStars: 4.0,
  minFiveStarPct: 0,
  mode: 'hide',
  filterFrequentlyReturned: true,
  autoLoadMore: true,
  minVisible: 16,
};

// ─── State ────────────────────────────────────────────────────────────────────

let settings = { ...DEFAULTS };
const asinCache = new Map(); // asin → { fiveStarPct: number|null, fetching: boolean }
const observedCards = new WeakSet();
let intersectionObserver = null;
let mutationObserver = null;
let autoLoadPagesLoaded = 0;
const MAX_AUTO_LOAD_PAGES = 3;

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Parse star rating from text like "4.3 out of 5 stars" → 4.3
 * Returns null if unparseable.
 */
function parseStarRating(text) {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s+out\s+of\s+5/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

/**
 * Parse review count from text like "1,234 ratings" or "1,234 reviews" → 1234
 * Returns 0 if unparseable or absent.
 */
function parseReviewCount(text) {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, '').trim();

  const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);

  const mMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);

  const match = cleaned.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Parse 5-star % from popover HTML.
 * Primary: aria-label="67% of reviews have 5 stars"
 * Fallback: "5 star ... 67%"
 * Returns null if not found.
 */
function parseFiveStarPct(html) {
  if (!html) return null;

  // Primary: aria-label pattern
  const ariaMatch = html.match(/aria-label="(\d+)%\s+of\s+reviews\s+have\s+5\s+stars"/i);
  if (ariaMatch) return parseInt(ariaMatch[1], 10);

  // Fallback: prose pattern
  const proseMatch = html.match(/5\s+star[\s\S]{0,200}?(\d+)%/i);
  if (proseMatch) return parseInt(proseMatch[1], 10);

  return null;
}

/**
 * Extract product data from a card element.
 * Returns { asin, stars, reviewCount, frequentlyReturned }
 */
function extractProductData(card) {
  const asin = card.getAttribute('data-asin') || '';

  // Star rating
  const starEl = card.querySelector('.a-icon-alt');
  const stars = starEl ? parseStarRating(starEl.textContent) : null;

  // Review count — scope to reviews-block first to avoid sponsored card false positives
  let reviewCount = 0;
  const reviewsBlock = card.querySelector('[data-cy="reviews-block"]');
  const reviewScope = reviewsBlock || card;
  const reviewEl =
    reviewScope.querySelector('[aria-label*="ratings"]') ||
    reviewScope.querySelector('[aria-label*="reviews"]') ||
    reviewScope.querySelector('.s-underline-text');
  if (reviewEl) {
    const ariaLabel = reviewEl.getAttribute('aria-label') || reviewEl.textContent;
    reviewCount = parseReviewCount(ariaLabel);
  }

  // Frequently returned
  const frequentlyReturned =
    !!card.querySelector('[data-component-type*="frequently-returned"]') ||
    !!card.querySelector('[class*="frequently-returned"]') ||
    /frequently returned/i.test(card.textContent);

  return { asin, stars, reviewCount, frequentlyReturned };
}

/**
 * Evaluate whether a product passes the current filter settings.
 * Returns true if the product should be SHOWN, false if it should be filtered.
 *
 * @param {{ stars: number|null, reviewCount: number, frequentlyReturned: boolean, fiveStarPct: number|null }} data
 * @param {object} cfg - settings object
 */
function passesFilter(data, cfg) {
  const { stars, reviewCount, frequentlyReturned, fiveStarPct } = data;

  // Review count threshold
  if (reviewCount < cfg.minReviews) return false;

  // Star rating threshold — only apply if stars is available
  if (stars !== null && stars < cfg.minStars) return false;

  // 5-star % threshold — skip if disabled (0) or not yet fetched (null)
  if (cfg.minFiveStarPct > 0 && fiveStarPct !== null && fiveStarPct < cfg.minFiveStarPct) {
    return false;
  }

  // Frequently returned
  if (cfg.filterFrequentlyReturned && frequentlyReturned) return false;

  return true;
}

// ─── Filter application ───────────────────────────────────────────────────────

/**
 * Apply or remove filter styling on a card.
 */
function applyFilter(card, show, data) {
  if (show) {
    clearFilter(card);
    return;
  }

  card.setAttribute('data-amzf-filtered', 'true');

  if (settings.mode === 'hide') {
    card.style.display = 'none';
    // Remove any existing badge
    removeBadge(card);
  } else {
    // Dim mode
    card.style.opacity = '0.25';
    card.style.position = card.style.position || 'relative';
    upsertBadge(card, data);
  }
}

function clearFilter(card) {
  card.removeAttribute('data-amzf-filtered');
  card.style.display = '';
  card.style.opacity = '';
  removeBadge(card);
}

function removeBadge(card) {
  const badge = card.querySelector('.amzf-badge');
  if (badge) badge.remove();
}

function upsertBadge(card, data) {
  removeBadge(card);
  const badge = document.createElement('div');
  badge.className = 'amzf-badge';
  badge.style.cssText = `
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(0,0,0,0.75);
    color: #fff;
    font-size: 11px;
    font-family: Arial, sans-serif;
    padding: 3px 6px;
    border-radius: 3px;
    z-index: 999;
    pointer-events: none;
    white-space: nowrap;
  `;

  const parts = [];
  if (data.stars !== null) parts.push(`${data.stars}★`);
  parts.push(`${data.reviewCount.toLocaleString()} reviews`);
  const fiveStarPct = data.fiveStarPct !== null ? data.fiveStarPct : null;
  if (fiveStarPct !== null) parts.push(`${fiveStarPct}% 5★`);

  badge.textContent = `⚠ ${parts.join(' | ')}`;

  // Ensure card has relative positioning for absolute badge
  const pos = window.getComputedStyle(card).position;
  if (pos === 'static' || pos === '') {
    card.style.position = 'relative';
  }
  card.appendChild(badge);
}

// ─── Per-card processing ──────────────────────────────────────────────────────

function processCard(card) {
  if (!settings.enabled) {
    clearFilter(card);
    return;
  }

  const data = extractProductData(card);
  if (!data.asin) return; // Skip cards with no ASIN

  // Get cached 5-star pct if available
  const cached = asinCache.get(data.asin);
  data.fiveStarPct = cached ? cached.fiveStarPct : null;

  const show = passesFilter(data, settings);
  applyFilter(card, show, data);
}

function processAllCards() {
  const cards = getProductCards();
  cards.forEach(processCard);
}

function getProductCards() {
  return Array.from(
    document.querySelectorAll(
      '[data-component-type="s-search-result"], [data-asin][class*="s-result-item"]'
    )
  ).filter((card) => card.getAttribute('data-asin')); // must have ASIN
}

// ─── 5-star popover fetching ──────────────────────────────────────────────────

async function fetchFiveStarPct(asin) {
  if (!asin) return;
  const existing = asinCache.get(asin);
  if (existing && (existing.fetching || existing.fiveStarPct !== null)) return;

  asinCache.set(asin, { fiveStarPct: null, fetching: true });

  try {
    const host = window.location.hostname;
    const url = `https://${host}/gp/customer-reviews/widgets/average-customer-review/popover/?asin=${asin}&contextId=acrPopover`;
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const pct = parseFiveStarPct(html);
    asinCache.set(asin, { fiveStarPct: pct, fetching: false });
  } catch {
    asinCache.set(asin, { fiveStarPct: null, fetching: false });
  }

  // Re-evaluate any cards with this ASIN now that we have data
  getProductCards()
    .filter((card) => card.getAttribute('data-asin') === asin)
    .forEach(processCard);
}

// ─── IntersectionObserver (triggers popover fetch) ────────────────────────────

function setupIntersectionObserver() {
  if (intersectionObserver) intersectionObserver.disconnect();

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const asin = card.getAttribute('data-asin');
          if (asin && settings.minFiveStarPct > 0) {
            fetchFiveStarPct(asin);
          }
          intersectionObserver.unobserve(card); // only trigger once per card
        }
      });
    },
    { rootMargin: '200px' }
  );
}

function observeCard(card) {
  if (observedCards.has(card)) return;
  observedCards.add(card);
  intersectionObserver.observe(card);
}

function observeAllCards() {
  getProductCards().forEach(observeCard);
}

// ─── MutationObserver (infinite scroll) ──────────────────────────────────────

function setupMutationObserver() {
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = new MutationObserver((mutations) => {
    let hasNewCards = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check if the added node itself is a card
        const isCard =
          node.matches &&
          node.matches(
            '[data-component-type="s-search-result"], [data-asin][class*="s-result-item"]'
          ) &&
          node.getAttribute('data-asin');

        if (isCard) {
          processCard(node);
          observeCard(node);
          hasNewCards = true;
        } else if (node.querySelector) {
          // Check for cards nested within the added node
          const nested = node.querySelectorAll(
            '[data-component-type="s-search-result"], [data-asin][class*="s-result-item"]'
          );
          nested.forEach((card) => {
            if (card.getAttribute('data-asin')) {
              processCard(card);
              observeCard(card);
              hasNewCards = true;
            }
          });
        }
      }
    }

    if (hasNewCards && settings.autoLoadMore) {
      scheduleAutoLoad();
    }
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

// ─── Auto-load more pages ─────────────────────────────────────────────────────

let autoLoadTimer = null;

function scheduleAutoLoad() {
  clearTimeout(autoLoadTimer);
  autoLoadTimer = setTimeout(maybeAutoLoadMore, 500);
}

function countVisibleCards() {
  return getProductCards().filter(
    (card) => card.getAttribute('data-amzf-filtered') !== 'true'
  ).length;
}

async function maybeAutoLoadMore() {
  if (!settings.enabled || !settings.autoLoadMore) return;
  if (autoLoadPagesLoaded >= MAX_AUTO_LOAD_PAGES) return;

  const visible = countVisibleCards();
  if (visible >= settings.minVisible) return;

  const nextLink = document.querySelector(
    '.s-pagination-next:not(.s-pagination-disabled)'
  );
  if (!nextLink) return;

  const nextUrl = nextLink.href;
  if (!nextUrl) return;

  autoLoadPagesLoaded++;

  try {
    const resp = await fetch(nextUrl, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const newCards = doc.querySelectorAll(
      '[data-component-type="s-search-result"], [data-asin][class*="s-result-item"]'
    );

    const container =
      document.querySelector('.s-search-results') ||
      document.querySelector('.s-main-slot');

    if (!container) return;

    newCards.forEach((card) => {
      if (!card.getAttribute('data-asin')) return;
      const adopted = document.adoptNode(card);
      container.appendChild(adopted);
      processCard(adopted);
      observeCard(adopted);
    });

    // Recursively check if we still need more
    scheduleAutoLoad();
  } catch {
    // Silently fail on network errors
  }
}

// ─── Settings sync ────────────────────────────────────────────────────────────

function reapplyAll() {
  // Clear all filtered cards first, then reprocess
  document.querySelectorAll('[data-amzf-filtered]').forEach(clearFilter);
  processAllCards();
  if (settings.autoLoadMore) scheduleAutoLoad();
}

// ─── Message handler ──────────────────────────────────────────────────────────

function getCountsMessage() {
  const all = getProductCards();
  const filtered = all.filter(
    (card) => card.getAttribute('data-amzf-filtered') === 'true'
  ).length;
  return { total: all.length, filtered, visible: all.length - filtered };
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

function init() {
  // Only run Chrome extension APIs in browser context
  if (typeof chrome !== 'undefined' && chrome.storage) {
    // Load settings then start
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      settings = { ...DEFAULTS, ...stored };
      setupIntersectionObserver();
      setupMutationObserver();
      processAllCards();
      observeAllCards();
      if (settings.autoLoadMore) scheduleAutoLoad();
    });

    // Live-update when popup changes settings
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        settings[key] = newValue;
      }
      reapplyAll();
    });

    // Message handler for popup stats
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'GET_COUNTS') {
        sendResponse(getCountsMessage());
      }
    });
  }
}

init();

// ─── CommonJS export guard (for Jest) ────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseStarRating,
    parseReviewCount,
    passesFilter,
    parseFiveStarPct,
    extractProductData,
    applyFilter,
    clearFilter,
  };
}
