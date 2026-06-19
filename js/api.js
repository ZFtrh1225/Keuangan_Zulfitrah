/**
 * api.js — Centralized API client for Apps Script backend.
 * Semua endpoint via single fetch ke API_URL dengan body { action, data }.
 *
 * Auth: kalau backend sudah set APP_SECRET, frontend harus menyertakan
 * field _secret di setiap request. Secret disimpan di localStorage
 * (mtpro_app_secret). Tanpa secret, semua action selain getAuthStatus akan
 * di-tolak dengan { success:false, error:'Unauthorized: ...' }.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});

  const API_URL = 'https://script.google.com/macros/s/AKfycbzQ70iARKDd75Tbl8BTIkj5X0NQxoi2f1bx0t2Zm5w-aqphZwYfxvuxZB26nNLQIuUf0w/exec';

  const DEFAULT_TIMEOUT_MS = 30000;
  const MAX_RETRIES = 2;
  const RETRY_BASE_MS = 600;
  const LS_SECRET_KEY = 'mtpro_app_secret';

  /**
   * Action yang MENGUBAH data (create/update/delete/save). Apps Script kadang
   * lambat merespons walau request-nya sudah sukses diproses di server — kalau
   * timeout lalu kita retry begitu saja, action ini bisa terkirim 2×. Contoh:
   * addExpense timeout di percobaan pertama padahal baris pengeluarannya
   * sudah masuk Sheet, lalu retry otomatis membuat baris duplikat (uang
   * "berkurang dua kali" di laporan). Read-only action (get / list) aman
   * di-retry karena cuma membaca data, jadi default retries-nya tetap jalan.
   */
  const MUTATING_PREFIXES = ['add', 'edit', 'update', 'delete', 'save', 'rotate'];
  function isMutating(action) {
    return MUTATING_PREFIXES.some(p => action.indexOf(p) === 0);
  }

  /** Sleep helper */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /** Ambil secret dari localStorage. Return string kosong kalau belum di-set. */
  function getSecret() {
    try { return localStorage.getItem(LS_SECRET_KEY) || ''; }
    catch (e) { return ''; }
  }

  /** Simpan secret. Kosongkan untuk hapus. */
  function setSecret(s) {
    try {
      if (s) localStorage.setItem(LS_SECRET_KEY, String(s));
      else localStorage.removeItem(LS_SECRET_KEY);
    } catch (e) { /* quota — ignore */ }
  }

  /**
   * Low-level call dengan retry exponential backoff.
   * Otomatis lampirkan _secret ke setiap data payload.
   * Apps Script returns: { success, ...payload } or { success:false, error }
   */
  async function call(action, data, opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    const retries = opts.retries != null ? opts.retries : (isMutating(action) ? 0 : MAX_RETRIES);
    let attempt = 0;
    let lastErr = null;

    // Sertakan secret kalau ada (backend abaikan kalau APP_SECRET belum di-set)
    const payload = Object.assign({}, data || {});
    const secret = getSecret();
    if (secret) payload._secret = secret;

    while (attempt <= retries) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, data: payload }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        // Trigger event kalau auth gagal — UI bisa tampilkan token modal otomatis
        if (json && json.success === false && /Unauthorized/i.test(json.error || '')) {
          window.dispatchEvent(new CustomEvent('mt:auth-required', { detail: json.error }));
        }
        return json;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        attempt++;
        if (attempt > retries) break;
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
      }
    }
    if (isMutating(action) && lastErr) {
      // Koneksi putus/timeout TIDAK selalu berarti request gagal di server —
      // bisa saja datanya sudah tersimpan tapi responsnya yang tidak sampai.
      // Jangan klaim "gagal" secara pasti; minta user cek dulu sebelum ulang
      // supaya tidak input transaksi yang sama dua kali.
      return {
        success: false,
        uncertain: true,
        error: 'Koneksi terputus saat menyimpan (' + lastErr.message + '). ' +
          'Cek riwayat transaksi dulu sebelum mencoba lagi — datanya mungkin sudah tersimpan.'
      };
    }
    return { success: false, error: lastErr ? lastErr.message : 'Network failed' };
  }

  // ── Read ──
  const getDashboardData = (month, year) => call('getDashboardData', { month, year });
  const listRecentTransactions = (month, year, limit) => call('listRecentTransactions', { month, year, limit: limit || 100 });
  const listGoals = () => call('listGoals', {});
  const getSettings = () => call('getSettings', {});
  const getCategories = () => call('getCategories', {});
  const listTemplates = () => call('listTemplates', {});
  const listBills = (month, year) => call('listBills', { month, year });
  const listWallets = () => call('listWallets', {});
  const listTransfers = (month, year) => call('listTransfers', { month, year });
  const getAuthStatus = () => call('getAuthStatus', {}, { retries: 0, timeoutMs: 8000 });

  // ── Create ──
  const addIncome = (data) => call('addIncome', data);
  const addExpense = (data) => call('addExpense', data);
  const addSaving = (data) => call('addSaving', data);
  const addAsset = (data) => call('addAsset', data);
  const addDebt = (data) => call('addDebt', data);
  const addGoal = (data) => call('addGoal', data);
  const addGoalDeposit = (rowIndex, amount) => call('addGoalDeposit', { rowIndex, amount });
  const addTemplate = (data) => call('addTemplate', data);
  const addBill = (data) => call('addBill', data);
  const addWallet = (data) => call('addWallet', data);
  const addTransfer = (data) => call('addTransfer', data);

  // ── Update ──
  const editTransaction = (sheet, rowIndex, fields) =>
    call('editTransaction', { sheet, rowIndex, fields });
  const updateGoal = (data) => call('updateGoal', data);
  const updateDebt = (data) => call('updateDebt', data);
  const updateWallet = (data) => call('updateWallet', data);
  const saveSettings = (data) => call('saveSettings', data);
  const saveAppSecret = (newSecret) => call('saveAppSecret', { secret: newSecret });

  // ── Delete ──
  const deleteTransaction = (sheet, rowIndex) => call('deleteTransaction', { sheet, rowIndex });
  const deleteWealthItem = (type, rowIndex) => call('deleteWealthItem', { type, rowIndex });
  const deleteGoal = (rowIndex) => call('deleteGoal', { rowIndex });
  const deleteTemplate = (rowIndex) => call('deleteTemplate', { rowIndex });
  const deleteBill = (rowIndex) => call('deleteBill', { rowIndex });
  const deleteWallet = (rowIndex) => call('deleteWallet', { rowIndex });
  const deleteTransfer = (rowIndex) => call('deleteTransfer', { rowIndex });

  // ── Special ──
  const generatePDFReport = (month, year) => call('generatePDFReport', { month, year }, { timeoutMs: 60000 });
  const getGeminiDeepAnalysis = (summary) => call('getGeminiDeepAnalysis', summary, { timeoutMs: 60000 });
  const calculateDebtPayoff = (data) => call('calculateDebtPayoff', data, { timeoutMs: 30000 });
  const calculateFireProjection = (data) => call('calculateFireProjection', data);
  const parseGoalFromText = (text) => call('parseGoalFromText', { text }, { timeoutMs: 30000 });
  const extractReceiptData = (imageBase64, mimeType) =>
    call('extractReceiptData', { imageBase64, mimeType }, { timeoutMs: 60000 });
  const getSpendingDNA = () => call('getSpendingDNA', {}, { timeoutMs: 30000 });

  MT.api = {
    API_URL, call, getSecret, setSecret,
    getDashboardData, listRecentTransactions, listGoals, getSettings, getCategories,
    listTemplates, listBills, listWallets, listTransfers, getAuthStatus,
    addIncome, addExpense, addSaving, addAsset, addDebt, addGoal, addGoalDeposit,
    addTemplate, addBill, addWallet, addTransfer,
    editTransaction, updateGoal, updateDebt, updateWallet, saveSettings, saveAppSecret,
    deleteTransaction, deleteWealthItem, deleteGoal, deleteTemplate, deleteBill,
    deleteWallet, deleteTransfer,
    generatePDFReport, getGeminiDeepAnalysis,
    calculateDebtPayoff, calculateFireProjection,
    parseGoalFromText, extractReceiptData, getSpendingDNA
  };
})();
