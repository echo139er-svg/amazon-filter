'use strict';

const DEFAULTS = {
  enabled: true,
  minReviews: 1000,
  minStars: 4.0,
  minFiveStarPct: 0,
  mode: 'hide',
  filterFrequentlyReturned: true,
  filterSlowDelivery: false,
  maxDeliveryDays: 10,
  autoLoadMore: true,
  minVisible: 16,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  enabled: $('enabled'),
  enabledLabel: $('enabledLabel'),
  statsBar: $('statsBar'),
  modeHide: $('modeHide'),
  modeDim: $('modeDim'),
  minReviews: $('minReviews'),
  minStars: $('minStars'),
  minFiveStarPct: $('minFiveStarPct'),
  filterFrequentlyReturned: $('filterFrequentlyReturned'),
  filterSlowDelivery: $('filterSlowDelivery'),
  maxDeliveryDays: $('maxDeliveryDays'),
  autoLoadMore: $('autoLoadMore'),
  minVisible: $('minVisible'),
};

// ─── State ────────────────────────────────────────────────────────────────────

let saveDebounceTimer = null;

// ─── Load settings → populate UI ─────────────────────────────────────────────

chrome.storage.sync.get(DEFAULTS, (stored) => {
  const s = { ...DEFAULTS, ...stored };

  els.enabled.checked = s.enabled;
  updateEnabledUI(s.enabled);

  (s.mode === 'dim' ? els.modeDim : els.modeHide).checked = true;

  els.minReviews.value = s.minReviews;
  els.minStars.value = s.minStars;
  els.minFiveStarPct.value = s.minFiveStarPct;
  els.filterFrequentlyReturned.checked = s.filterFrequentlyReturned;
  els.filterSlowDelivery.checked = s.filterSlowDelivery;
  els.maxDeliveryDays.value = s.maxDeliveryDays;
  els.autoLoadMore.checked = s.autoLoadMore;
  els.minVisible.value = s.minVisible;

  refreshStats();
});

// ─── UI helpers ───────────────────────────────────────────────────────────────

function updateEnabledUI(enabled) {
  els.enabledLabel.textContent = enabled ? 'ON' : 'OFF';
  document.body.classList.toggle('disabled', !enabled);
}

function refreshStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_COUNTS' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        els.statsBar.innerHTML = 'Open an Amazon search page to filter.';
        return;
      }
      els.statsBar.innerHTML =
        `Filtering <span>${resp.filtered}</span> of <span>${resp.total}</span> products &nbsp;·&nbsp; ${resp.visible} visible`;
    });
  });
}

// ─── Collect current UI values → settings object ──────────────────────────────

function collectSettings() {
  return {
    enabled: els.enabled.checked,
    mode: els.modeDim.checked ? 'dim' : 'hide',
    minReviews: Math.max(0, parseInt(els.minReviews.value, 10) || 0),
    minStars: Math.min(5, Math.max(1, parseFloat(els.minStars.value) || 4.0)),
    minFiveStarPct: Math.min(100, Math.max(0, parseInt(els.minFiveStarPct.value, 10) || 0)),
    filterFrequentlyReturned: els.filterFrequentlyReturned.checked,
    filterSlowDelivery: els.filterSlowDelivery.checked,
    maxDeliveryDays: Math.max(1, parseInt(els.maxDeliveryDays.value, 10) || DEFAULTS.maxDeliveryDays),
    autoLoadMore: els.autoLoadMore.checked,
    minVisible: Math.max(1, parseInt(els.minVisible.value, 10) || 16),
  };
}

// ─── Save (debounced for number inputs, immediate for toggles/radios) ─────────

function saveNow() {
  const s = collectSettings();
  chrome.storage.sync.set(s, () => {
    updateEnabledUI(s.enabled);
    refreshStats();
  });
}

function saveDebounced() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(saveNow, 300);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Immediate save for toggles and radios
els.enabled.addEventListener('change', saveNow);
els.filterFrequentlyReturned.addEventListener('change', saveNow);
els.filterSlowDelivery.addEventListener('change', saveNow);
els.autoLoadMore.addEventListener('change', saveNow);
els.modeHide.addEventListener('change', saveNow);
els.modeDim.addEventListener('change', saveNow);

// Debounced save for number inputs
els.minReviews.addEventListener('input', saveDebounced);
els.minStars.addEventListener('input', saveDebounced);
els.minFiveStarPct.addEventListener('input', saveDebounced);
els.maxDeliveryDays.addEventListener('input', saveDebounced);
els.minVisible.addEventListener('input', saveDebounced);

// Also save on blur for number inputs (in case user tabs away without triggering input)
els.minReviews.addEventListener('change', saveNow);
els.minStars.addEventListener('change', saveNow);
els.minFiveStarPct.addEventListener('change', saveNow);
els.maxDeliveryDays.addEventListener('change', saveNow);
els.minVisible.addEventListener('change', saveNow);

// Refresh stats periodically while popup is open
setInterval(refreshStats, 2000);
