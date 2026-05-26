/**
 * formatters.js — Currency, date & misc utility formatters
 * Exposed via global window.MT.fmt to avoid module overhead.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});

  /** Rupiah lengkap dengan separator titik */
  function fmtRp(n) {
    if (n === undefined || n === null || isNaN(n)) return 'Rp 0';
    const sign = n < 0 ? '-' : '';
    return sign + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  }

  /** Rupiah singkat (Rp 1,2jt / Rp 850rb / Rp 2,1M) */
  function fmtRpShort(n) {
    if (!n || isNaN(n)) return 'Rp 0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return sign + 'Rp ' + (abs / 1e9).toFixed(1).replace('.', ',') + 'M';
    if (abs >= 1e6) return sign + 'Rp ' + (abs / 1e6).toFixed(1).replace('.', ',') + 'jt';
    if (abs >= 1e3) return sign + 'Rp ' + Math.round(abs / 1e3) + 'rb';
    return sign + 'Rp ' + Math.round(abs).toLocaleString('id-ID');
  }

  /** Format input bertopeng "1.234.567" → kembalikan integer */
  function parseRp(s) {
    if (!s) return 0;
    const cleaned = String(s).replace(/[^0-9-]/g, '');
    return parseInt(cleaned, 10) || 0;
  }

  /** Pasang masking ribuan ke <input type="text"> */
  function applyCurrencyMask(el) {
    if (!el || el.dataset.maskApplied) return;
    el.dataset.maskApplied = '1';
    el.addEventListener('input', function () {
      const digits = el.value.replace(/[^0-9]/g, '');
      el.value = digits ? parseInt(digits, 10).toLocaleString('id-ID') : '';
    });
  }

  /** Tanggal ID singkat: 26 Mei */
  function fmtDateShort(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  /** Tanggal ID panjang: 26 Mei 2026 */
  function fmtDateLong(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Persen 1 desimal (0.5 → "0.5%") */
  function fmtPct(n, digits = 1) {
    if (n === undefined || n === null || isNaN(n)) return '0%';
    return n.toFixed(digits) + '%';
  }

  /** ISO yyyy-mm-dd */
  function toIsoDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  /** Selisih hari dari hari ini (positif = future) */
  function daysFromToday(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dt.setHours(0, 0, 0, 0);
    return Math.round((dt - today) / 86400000);
  }

  /** Escape HTML untuk innerHTML safe */
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Convert markdown sederhana ke HTML (untuk Gemini output) */
  function mdToHtml(md) {
    if (!md) return '';
    let html = escapeHtml(md);
    // bold **x**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    // italic _x_ atau *x*
    html = html.replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');
    html = html.replace(/_([^_]+)_/g, '<i>$1</i>');
    // newlines
    html = html.replace(/\n\n+/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    return '<p>' + html + '</p>';
  }

  /** Debounce */
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  MT.fmt = {
    fmtRp, fmtRpShort, parseRp, applyCurrencyMask,
    fmtDateShort, fmtDateLong, fmtPct, toIsoDate,
    daysFromToday, escapeHtml, mdToHtml, debounce
  };
})();
