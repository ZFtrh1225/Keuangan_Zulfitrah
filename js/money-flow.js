/**
 * money-flow.js — Fitur Arus Masuk & Keluar (Money In / Out)
 * Menampilkan perbandingan Pemasukan (hijau) vs Pengeluaran (abu-abu)
 * selama 6 bulan terakhir dengan dual-bar chart dan kartu ringkasan interaktif.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const { fmtRp, fmtRpShort } = MT.fmt || {
    fmtRp: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID'),
    fmtRpShort: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID')
  };

  let cachedDashboard = null;
  let selectedMonthIndex = 5; // default ke bulan terakhir (current month)

  /**
   * Render utama Money In / Out
   */
  function render(dashboardData) {
    if (dashboardData) cachedDashboard = dashboardData;
    const d = cachedDashboard || (MT.state && MT.state.dashboard);
    if (!d || !d.sixMonths || !d.sixMonths.length) return;

    const sixMonths = d.sixMonths;
    // Pastikan index valid
    if (selectedMonthIndex < 0 || selectedMonthIndex >= sixMonths.length) {
      selectedMonthIndex = sixMonths.length - 1;
    }

    // 1. Render Dual Bar Chart
    renderBarChart(sixMonths, selectedMonthIndex);

    // 2. Render Selected Month Summary Card
    renderSummaryCard(sixMonths[selectedMonthIndex]);
  }

  /**
   * Render SVG Dual Bar Chart
   */
  function renderBarChart(sixMonths, selectedIdx) {
    const container = document.getElementById('moneyFlowChartWrap');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width) || 500);
    const height = width < 480 ? 175 : 195;

    const margin = { top: 14, right: 12, bottom: 26, left: 12 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Cari nilai maksimum pemasukan & pengeluaran untuk skala y
    let maxVal = 100000;
    sixMonths.forEach((m) => {
      const inc = Number(m.income) || 0;
      const exp = Number(m.expenses) || 0;
      if (inc > maxVal) maxVal = inc;
      if (exp > maxVal) maxVal = exp;
    });
    maxVal = maxVal * 1.1; // top padding

    const barHeight = (val) => {
      const v = Number(val) || 0;
      if (v <= 0) return 0;
      return Math.max(3, (v / maxVal) * innerH);
    };

    const numMonths = sixMonths.length;
    const groupW = innerW / numMonths;
    const barGap = 4;
    const barW = Math.max(6, Math.min(22, (groupW - 14) / 2));

    const today = new Date();
    const curMonth = today.getMonth() + 1;
    const curYear = today.getFullYear();

    // Buat markup batang-batang
    const barsMarkup = sixMonths.map((m, i) => {
      const isSelected = i === selectedIdx;
      const isCurMonth = (m.month === curMonth && m.year === curYear);

      const groupX = margin.left + i * groupW;
      const centerOffset = (groupW - (barW * 2 + barGap)) / 2;
      const incX = groupX + centerOffset;
      const expX = incX + barW + barGap;

      const incH = barHeight(m.income);
      const expH = barHeight(m.expenses);
      const incY = margin.top + innerH - incH;
      const expY = margin.top + innerH - expH;

      // Partial month opacity
      const opacity = (isCurMonth && today.getDate() < 28) ? 0.65 : 1;

      // Highlight bg for selected month
      const highlightRect = isSelected ? `
        <rect x="${groupX + 2}" y="${margin.top - 4}" width="${groupW - 4}" height="${innerH + 8}" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(0,229,180,0.3)" stroke-width="1" />
      ` : '';

      // Teks label sumbu X
      const shortLabel = m.label ? m.label.split(' ')[0] : `B${m.month}`;
      const labelWeight = isSelected ? '700' : '500';
      const labelColor = isSelected ? 'var(--accent)' : 'var(--t3)';

      return `
        <g class="money-flow-month-group" data-idx="${i}" style="cursor: pointer;" tabindex="0" role="button" aria-label="${m.label}">
          ${highlightRect}
          <!-- Income Bar (Green) -->
          <rect
            class="mf-bar mf-bar-inc"
            x="${incX}"
            y="${incY}"
            width="${barW}"
            height="${incH}"
            rx="3"
            fill="var(--green)"
            opacity="${opacity}"
          />
          <!-- Expense Bar (Slate / Subdued) -->
          <rect
            class="mf-bar mf-bar-exp"
            x="${expX}"
            y="${expY}"
            width="${barW}"
            height="${expH}"
            rx="3"
            fill="var(--t4)"
            opacity="${opacity}"
          />
          <!-- X Label -->
          <text
            x="${groupX + groupW / 2}"
            y="${margin.top + innerH + 18}"
            text-anchor="middle"
            fill="${labelColor}"
            font-size="11px"
            font-weight="${labelWeight}"
          >
            ${shortLabel}
          </text>
        </g>
      `;
    }).join('');

    container.innerHTML = `
      <svg class="money-flow-svg"
        viewBox="0 0 ${width} ${height}"
        width="100%"
        height="${height}"
        style="overflow: visible; display: block;"
      >
        <!-- Horizontal baseline -->
        <line x1="${margin.left}" y1="${margin.top + innerH}" x2="${margin.left + innerW}" y2="${margin.top + innerH}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
        <!-- Month Bars -->
        <g class="money-flow-bars-layer">${barsMarkup}</g>
      </svg>
    `;

    // Pasang listeners untuk klik & tooltip
    attachInteractivity(container, sixMonths);
  }

  function attachInteractivity(container, sixMonths) {
    const tooltip = getOrCreateTooltip();
    const groups = container.querySelectorAll('.money-flow-month-group');

    groups.forEach((g) => {
      const idx = Number(g.getAttribute('data-idx'));
      const m = sixMonths[idx];
      if (!m) return;

      const showTip = (clientX, clientY) => {
        const inc = Number(m.income) || 0;
        const exp = Number(m.expenses) || 0;
        const bal = Number(m.balance) || (inc - exp);
        const balColor = bal >= 0 ? 'var(--green)' : 'var(--red)';

        tooltip.innerHTML = `
          <div style="font-weight:700; color:var(--t1); margin-bottom:4px; font-size:12px;">${m.label}</div>
          <div style="display:flex; justify-content:space-between; gap:12px; font-size:11px; margin-bottom:2px;">
            <span style="color:var(--green); font-weight:600;">● Pemasukan:</span>
            <span style="font-family:var(--mono, monospace); font-weight:600; color:var(--t1);">${fmtRp(inc)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; gap:12px; font-size:11px; margin-bottom:4px;">
            <span style="color:var(--t3);">● Pengeluaran:</span>
            <span style="font-family:var(--mono, monospace); color:var(--t2);">${fmtRp(exp)}</span>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:4px; display:flex; justify-content:space-between; gap:12px; font-size:11px;">
            <span style="color:var(--t3);">Saldo Kas:</span>
            <span style="font-family:var(--mono, monospace); font-weight:700; color:${balColor};">${fmtRp(bal)}</span>
          </div>
        `;
        positionTooltip(tooltip, clientX, clientY);
      };

      const hideTip = () => hideTooltip(tooltip);

      g.addEventListener('mouseenter', (e) => showTip(e.clientX, e.clientY));
      g.addEventListener('mousemove', (e) => positionTooltip(tooltip, e.clientX, e.clientY));
      g.addEventListener('mouseleave', hideTip);

      // Klik untuk memilih bulan
      g.addEventListener('click', () => {
        selectedMonthIndex = idx;
        render();
      });

      g.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        showTip(t.clientX, t.clientY);
        selectedMonthIndex = idx;
        render();
        setTimeout(hideTip, 3000);
      }, { passive: true });
    });
  }

  /**
   * Render Kartu Ringkasan Bulan Terpilih (Sisi Kanan / Bawah)
   */
  function renderSummaryCard(m) {
    if (!m) return;
    const elMonth = document.getElementById('mfSelectedMonth');
    const elBal = document.getElementById('mfBalanceVal');
    const elInc = document.getElementById('mfIncomeVal');
    const elExp = document.getElementById('mfExpenseVal');
    const elSav = document.getElementById('mfSavingVal');

    const inc = Number(m.income) || 0;
    const exp = Number(m.expenses) || 0;
    const sav = Number(m.savings) || 0;
    const bal = Number(m.balance) || (inc - exp - sav);

    if (elMonth) elMonth.textContent = m.label || 'Bulan Terpilih';

    if (elBal) {
      elBal.textContent = fmtRp(bal);
      elBal.className = 'mf-balance-amount ' + (bal >= 0 ? 'income' : 'expense');
    }

    if (elInc) elInc.textContent = fmtRp(inc);
    if (elExp) elExp.textContent = fmtRp(exp);
    if (elSav) elSav.textContent = fmtRp(sav);
  }

  function getOrCreateTooltip() {
    let tip = document.getElementById('moneyFlowGlobalTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'moneyFlowGlobalTooltip';
      tip.className = 'money-flow-floating-tooltip';
      tip.style.position = 'fixed';
      tip.style.zIndex = '9999';
      tip.style.pointerEvents = 'none';
      tip.style.opacity = '0';
      tip.style.transition = 'opacity 0.15s ease';
      document.body.appendChild(tip);
    }
    return tip;
  }

  function positionTooltip(tip, clientX, clientY) {
    tip.style.opacity = '1';
    const tipWidth = tip.offsetWidth || 180;
    const tipHeight = tip.offsetHeight || 80;
    const pad = 12;

    let x = clientX + pad;
    let y = clientY - tipHeight - pad;

    if (x + tipWidth > window.innerWidth - pad) {
      x = clientX - tipWidth - pad;
    }
    if (y < pad) {
      y = clientY + pad + 10;
    }

    tip.style.left = Math.max(pad, x) + 'px';
    tip.style.top = Math.max(pad, y) + 'px';
  }

  function hideTooltip(tip) {
    if (tip) tip.style.opacity = '0';
  }

  function resize() {
    if (cachedDashboard) render();
  }

  function init() {
    window.addEventListener('resize', () => {
      clearTimeout(window._mfResizeTimer);
      window._mfResizeTimer = setTimeout(resize, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  MT.moneyFlow = {
    render,
    resize,
    selectMonth: (idx) => {
      selectedMonthIndex = idx;
      render();
    }
  };
})();
