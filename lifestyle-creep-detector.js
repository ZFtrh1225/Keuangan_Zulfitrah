/**
 * lifestyle-creep-detector.js — Fetch & render lifestyle creep analysis.
 *
 * Backend: Code.gs getLifestyleCreepAnalysis() membandingkan pertumbuhan
 * income vs pengeluaran "Keinginan" (wants) tahun-ke-tahun + perubahan
 * savings rate. Modul ini memanggil endpoint itu & mengisi elemen yang
 * SUDAH ADA di index.html tab Analytics: #lifestyleCreepAlert & #lifestyleCreepMsg.
 *
 * Dipanggil dari app.js: MT.lifestyleCreep.checkAndRender() — idealnya
 * sekali saat tab Analytics pertama kali dibuka (bukan tiap render dashboard,
 * karena datanya tahunan, tidak berubah tiap bulan).
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const escapeHtml = (MT.fmt && MT.fmt.escapeHtml) || (s => s);

  let checked = false; // cache: cukup 1x per sesi, data tahunan tidak berubah tiap render

  async function checkAndRender(force) {
    if (checked && !force) return;
    const alertEl = document.getElementById('lifestyleCreepAlert');
    const msgEl = document.getElementById('lifestyleCreepMsg');
    if (!alertEl || !msgEl) return; // markup belum ada di halaman ini

    try {
      const res = await MT.api.call('getLifestyleCreepAnalysis', {});
      checked = true;
      if (!res || !res.success || !res.hasEnoughData) {
        alertEl.hidden = true;
        return;
      }
      if (!res.detected) {
        alertEl.hidden = true;
        return;
      }

      const isHigh = res.severity === 'high';
      alertEl.hidden = false;
      alertEl.style.borderColor = isHigh ? 'var(--red)' : 'var(--amber)';

      const titleEl = alertEl.querySelector('div > div:first-child'); // ikon
      const headEl = alertEl.querySelector('div[style*="font-weight:700"]');
      if (headEl) {
        headEl.textContent = isHigh
          ? '🚨 Lifestyle Creep Terdeteksi (Kritis)'
          : '⚠️ Lifestyle Creep Terdeteksi';
        headEl.style.color = isHigh ? 'var(--red)' : 'var(--amber)';
      }

      msgEl.innerHTML = `
        ${escapeHtml(res.message)}
        <div class="lc-stats">
          <span>Income: <b class="${res.incomeGrowthPct >= 0 ? 'positive' : 'negative'}">${res.incomeGrowthPct >= 0 ? '+' : ''}${res.incomeGrowthPct.toFixed(1)}%</b></span>
          <span>Keinginan: <b class="${res.wantsGrowthPct > res.incomeGrowthPct ? 'negative' : 'positive'}">${res.wantsGrowthPct >= 0 ? '+' : ''}${res.wantsGrowthPct.toFixed(1)}%</b></span>
          <span>Savings Rate: <b>${res.previousSavingsRate.toFixed(1)}% → ${res.currentSavingsRate.toFixed(1)}%</b></span>
        </div>
      `;
    } catch (e) {
      alertEl.hidden = true;
    }
  }

  MT.lifestyleCreep = { checkAndRender };
})();
