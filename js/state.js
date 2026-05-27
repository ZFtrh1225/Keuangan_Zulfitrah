/**
 * state.js — Global application state, localStorage cache, settings persistence.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});

  const LS_KEY_PREFIX = 'mtpro_';
  const LS_DASHBOARD_PREFIX = LS_KEY_PREFIX + 'dash_';
  const LS_TX_PREFIX = LS_KEY_PREFIX + 'tx_';
  const LS_GOALS = LS_KEY_PREFIX + 'goals';
  const LS_SETTINGS = LS_KEY_PREFIX + 'settings';
  const LS_CATEGORIES = LS_KEY_PREFIX + 'categories_v1';
  const LS_ONBOARDED = LS_KEY_PREFIX + 'onboarded_v1';

  const today = new Date();
  const state = {
    currentMonth: today.getMonth() + 1,
    currentYear: today.getFullYear(),
    dashboard: null,
    transactions: [],
    goals: [],
    categories: [],
    settings: {
      budgetRule: '50/30/20',
      customBudget: { needs: 50, wants: 30, invest: 20 },
      monthlyEmergencyTarget: 6
    },
    wallets: {},
    isLoading: false
  };

  // ── localStorage helpers ──
  function lsGet(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function dashKey(month, year) { return `${LS_DASHBOARD_PREFIX}${year}_${month}`; }
  function txKey(month, year) { return `${LS_TX_PREFIX}${year}_${month}`; }

  // ── Cached dashboard ──
  function getCachedDashboard(month, year) {
    return lsGet(dashKey(month, year));
  }
  function setCachedDashboard(month, year, data) {
    if (!data) return;
    lsSet(dashKey(month, year), { data, ts: Date.now() });
  }
  function invalidateAllCache() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(LS_DASHBOARD_PREFIX) || k.startsWith(LS_TX_PREFIX))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }

  // ── Cached transactions ──
  function getCachedTransactions(month, year) {
    return lsGet(txKey(month, year));
  }
  function setCachedTransactions(month, year, items) {
    lsSet(txKey(month, year), { items, ts: Date.now() });
  }

  // ── Goals cache ──
  function getCachedGoals() { return lsGet(LS_GOALS) || []; }
  function setCachedGoals(items) { lsSet(LS_GOALS, items || []); }

  // ── Categories cache (single source of truth dari backend) ──
  function getCachedCategories() { return lsGet(LS_CATEGORIES) || []; }
  function setCachedCategories(list) { lsSet(LS_CATEGORIES, list || []); }

  // ── Settings ──
  function loadSettings() {
    const s = lsGet(LS_SETTINGS);
    if (s && typeof s === 'object') {
      Object.assign(state.settings, s);
    }
    return state.settings;
  }
  function saveSettings(partial) {
    Object.assign(state.settings, partial);
    lsSet(LS_SETTINGS, state.settings);
    return state.settings;
  }

  // ── Onboarding ──
  function isOnboarded() { return !!lsGet(LS_ONBOARDED); }
  function setOnboarded() { lsSet(LS_ONBOARDED, true); }

  // ── Mutations ──
  function setDashboard(d) {
    state.dashboard = d;
    if (d && d.walletBalances) state.wallets = d.walletBalances;
  }
  function setTransactions(items) { state.transactions = items || []; }
  function setGoals(items) { state.goals = items || []; setCachedGoals(items); }
  function setCategories(list) { state.categories = list || []; setCachedCategories(list); }
  function setMonthYear(m, y) {
    state.currentMonth = m;
    state.currentYear = y;
  }

  MT.state = state;
  MT.store = {
    getCachedDashboard, setCachedDashboard, invalidateAllCache,
    getCachedTransactions, setCachedTransactions,
    getCachedGoals, setCachedGoals,
    getCachedCategories, setCachedCategories,
    loadSettings, saveSettings,
    isOnboarded, setOnboarded,
    setDashboard, setTransactions, setGoals, setCategories, setMonthYear
  };

  // boot: load settings
  loadSettings();
})();
