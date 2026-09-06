/**
 * debt-optimizer.js — "Cost of Debt vs Investment Return" panel renderer.
 *
 * Backend (Code.gs calculateDebtPayoff) sudah menghitung result.costOfDebt
 * (array per-hutang dengan verdict) & result.costOfDebtHeadline. Modul ini
 * cuma bertanggung jawab merender itu jadi HTML yang bisa ditempel ke
 * #debtPayoffResult, dipanggil dari app.js setelah runDebtPayoff() sukses.
 *
 * Prinsip advisory: melunasi utang = return BEBAS RISIKO (pasti), investasi
 * = return ASUMSI (variabel). Panel ini selalu menyertakan disclaimer itu
 * supaya user paham kenapa threshold-nya tidak sekadar "bunga > return".
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const escapeHtml = (MT.fmt && MT.fmt.escapeHtml) || (s => s);
  const fmtRp = (MT.fmt && MT.fmt.fmtRp) || (n => 'Rp ' + n);

  const SEVERITY_LABEL = {
    critical: { color: 'var(--red)', chip: '🔴 Prioritas Tinggi' },
    warning: { color: 'var(--amber)', chip: '🟡 Prioritas Sedang' },
    ok: { color: 'var(--green)', chip: '🟢 Aman' }
  };

  /**
   * @param {object} result - hasil dari api.calculateDebtPayoff() (sudah
   *   memuat costOfDebt[] & costOfDebtHeadline dari backend)
   * @returns {string} HTML siap disisipkan
   */
  function renderCostOfDebtPanel(result) {
    const items = result.costOfDebt || [];
    if (!items.length) return '';

    const headline = result.costOfDebtHeadline
      ? `<div class="cod-headline">${escapeHtml(result.costOfDebtHeadline)}</div>`
      : '';

    const rows = items.map(d => {
      const sev = SEVERITY_LABEL[d.severity] || SEVERITY_LABEL.ok;
      return `
        <div class="cod-row" style="border-left:3px solid ${sev.color};">
          <div class="cod-row-head">
            <span class="cod-name">${escapeHtml(d.name)}</span>
            <span class="cod-chip" style="color:${sev.color};">${sev.chip}</span>
          </div>
          <div class="cod-stats">
            <span>Saldo: <b>${fmtRp(d.balance)}</b></span>
            <span>Bunga: <b>${d.interestRatePct.toFixed(1)}%/thn</b></span>
            <span>Vs. Return Investasi: <b>${d.assumedInvestReturnPct.toFixed(1)}%/thn</b></span>
          </div>
          <div class="cod-verdict">${escapeHtml(d.verdict)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="cod-panel">
        <div class="cod-title">💡 Cost of Debt vs Investment Return</div>
        ${headline}
        <div class="cod-list">${rows}</div>
        <div class="cod-disclaimer">
          ℹ️ Melunasi utang = return <b>bebas risiko</b> (pasti mengurangi kewajiban).
          Return investasi di atas hanya <b>asumsi</b> — bisa lebih rendah di dunia nyata.
          Margin keamanan 2pp sudah diperhitungkan sebelum merekomendasikan "investasi dulu".
        </div>
      </div>
    `;
  }

  MT.debtOptimizer = { renderCostOfDebtPanel };
})();
