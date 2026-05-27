/**
 * api.js — Centralized API client for Apps Script backend.
 * Semua endpoint via single fetch ke API_URL dengan body { action, data }.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});

  const API_URL = 'https://script.google.com/macros/s/AKfycbzQ70iARKDd75Tbl8BTIkj5X0NQxoi2f1bx0t2Zm5w-aqphZwYfxvuxZB26nNLQIuUf0w/exec';

  const DEFAULT_TIMEOUT_MS = 30000;
  const MAX_RETRIES = 2;
  const RETRY_BASE_MS = 600;

  /** Sleep helper */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * Low-level call dengan retry exponential backoff.
   * Apps Script returns: { success, ...payload } or { success:false, error }
   */
  async function call(action, data, opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    const retries = opts.retries != null ? opts.retries : MAX_RETRIES;
    let attempt = 0;
    let lastErr = null;

    while (attempt <= retries) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, data: data || {} }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        return json;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        attempt++;
        if (attempt > retries) break;
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
      }
    }
    return { success: false, error: lastErr ? lastErr.message : 'Network failed' };
  }

  // ── Read ──
  const getDashboardData = (month, year) => call('getDashboardData', { month, year });
  const listRecentTransactions = (month, year, limit) => call('listRecentTransactions', { month, year, limit: limit || 100 });
  const listGoals = () => call('listGoals', {});
  const getSettings = () => call('getSettings', {});
  const getCategories = () => call('getCategories', {});
  const getCategoryBudgets = () => call('getCategoryBudgets', {});
  const listTemplates = () => call('listTemplates', {});

  // ── Create ──
  const addIncome = (data) => call('addIncome', data);
  const addExpense = (data) => call('addExpense', data);
  const addSaving = (data) => call('addSaving', data);
  const addAsset = (data) => call('addAsset', data);
  const addDebt = (data) => call('addDebt', data);
  const addGoal = (data) => call('addGoal', data);
  const addGoalDeposit = (rowIndex, amount) => call('addGoalDeposit', { rowIndex, amount });
  const addTemplate = (data) => call('addTemplate', data);

  // ── Update ──
  const editTransaction = (sheet, rowIndex, fields) =>
    call('editTransaction', { sheet, rowIndex, fields });
  const updateGoal = (data) => call('updateGoal', data);
  const saveSettings = (data) => call('saveSettings', data);
  const saveCategoryBudgets = (budgets) => call('saveCategoryBudgets', { budgets });

  // ── Delete ──
  const deleteTransaction = (sheet, rowIndex) => call('deleteTransaction', { sheet, rowIndex });
  const deleteWealthItem = (type, rowIndex) => call('deleteWealthItem', { type, rowIndex });
  const deleteGoal = (rowIndex) => call('deleteGoal', { rowIndex });
  const deleteTemplate = (rowIndex) => call('deleteTemplate', { rowIndex });

  // ── Special ──
  const generatePDFReport = (month, year) => call('generatePDFReport', { month, year }, { timeoutMs: 60000 });
  const getGeminiDeepAnalysis = (summary) => call('getGeminiDeepAnalysis', summary, { timeoutMs: 60000 });

  MT.api = {
    API_URL, call,
    getDashboardData, listRecentTransactions, listGoals, getSettings, getCategories,
    getCategoryBudgets,
    listTemplates,
    addIncome, addExpense, addSaving, addAsset, addDebt, addGoal, addGoalDeposit,
    addTemplate,
    editTransaction, updateGoal, saveSettings, saveCategoryBudgets,
    deleteTransaction, deleteWealthItem, deleteGoal,
    deleteTemplate,
    generatePDFReport, getGeminiDeepAnalysis
  };
})();
