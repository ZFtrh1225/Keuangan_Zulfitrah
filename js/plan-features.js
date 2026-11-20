/**
 * plan-features.js — Fitur Plan (Budget Donut interaktif & Goals Tracker ringkas)
 * Mengadopsi fitur Plan dari Fitur Tambahan:
 * - Donut Chart dengan hover segmen kategori interaktif & nilai di pusat donut
 * - Ringkasan performa alokasi budget dan target goal
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const { fmtRp, fmtRpShort } = MT.fmt || {
    fmtRp: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID'),
    fmtRpShort: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID')
  };

  let cachedData = null;

  /**
   * Render fitur-fitur Plan
   */
  function render(dashboardData) {
    if (dashboardData) cachedData = dashboardData;
    const d = cachedData || (MT.state && MT.state.dashboard);
    if (!d) return;

    renderPlanDonut(d);
    renderGoalsSummary(d);
  }

  /**
   * Render SVG Donut Chart untuk Alokasi Anggaran
   */
  function renderPlanDonut(d) {
    const container = document.getElementById('planDonutWrap');
    if (!container) return;

    const budgeting = d.budgeting || {};
    const totalInc = Number(budgeting.income) || 0;
    const totalExp = Number(d.summary && d.summary.totalExp) || (Number(budgeting.needs || 0) + Number(budgeting.wants || 0));
    const catComp = d.top10 || [];

    // Persiapkan segments
    const segments = [];
    const colors = MT.charts ? MT.charts.PIE_COLORS : [
      '#00e5b4', '#818cf8', '#f59e0b', '#f43f5e', '#60a5fa',
      '#a78bfa', '#fb7185', '#34d399', '#fbbf24', '#e879f9'
    ];

    let totalRecorded = 0;
    catComp.forEach((item, i) => {
      const name = item.name || item[0] || 'Kategori';
      const val = Number(item.amount || item[1]) || 0;
      if (val > 0) {
        totalRecorded += val;
        segments.push({
          id: 'cat_' + i,
          name: name,
          value: val,
          color: colors[i % colors.length]
        });
      }
    });

    const unallocated = Math.max(0, totalInc - totalExp);
    if (unallocated > 0) {
      segments.push({
        id: 'unused',
        name: 'Sisa Belum Terpakai',
        value: unallocated,
        color: 'rgba(255,255,255,0.08)'
      });
    }

    const totalBudgetVal = totalInc > 0 ? totalInc : Math.max(totalExp, 1);
    const size = 180;
    const strokeWidth = 18;
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * radius;

    let accumulatedOffset = 0;
    const arcsMarkup = segments.map((seg, i) => {
      const ratio = seg.value / totalBudgetVal;
      const strokeDash = (ratio * circumference).toFixed(2);
      const strokeDashoffset = (-accumulatedOffset).toFixed(2);
      accumulatedOffset += ratio * circumference;

      return `
        <circle
          class="plan-donut-segment"
          cx="${cx}"
          cy="${cy}"
          r="${radius}"
          fill="transparent"
          stroke="${seg.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${strokeDash} ${circumference}"
          stroke-dashoffset="${strokeDashoffset}"
          data-seg-id="${seg.id}"
          data-name="${escapeHtml(seg.name)}"
          data-val="${seg.value}"
          data-pct="${((seg.value / totalBudgetVal) * 100).toFixed(1)}"
          style="cursor: pointer; transition: stroke-width 0.2s, opacity 0.2s;"
        />
      `;
    }).join('');

    container.innerHTML = `
      <div class="plan-donut-container" style="position: relative; width: ${size}px; height: ${size}px; margin: 0 auto;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
          ${arcsMarkup}
        </svg>
        <div class="plan-donut-center" id="planDonutCenter" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; text-align: center; padding: 10px;">
          <div class="muted micro-label" id="planDonutCenterLbl" style="font-size: 10px;">Total Pengeluaran</div>
          <div class="plan-donut-amount" id="planDonutCenterAmt" style="font-size: 15px; font-weight: 700; color: var(--t1); font-family: var(--mono, monospace);">
            ${fmtRpShort(totalExp)}
          </div>
          <div class="muted" id="planDonutCenterSub" style="font-size: 10px; color: var(--t3);">
            dari ${fmtRpShort(totalInc)}
          </div>
        </div>
      </div>
    `;

    // Interactivity: segmen hover
    attachDonutInteractivity(container, totalExp, totalInc);
  }

  function attachDonutInteractivity(container, defaultExp, defaultInc) {
    const segments = container.querySelectorAll('.plan-donut-segment');
    const centerLbl = container.querySelector('#planDonutCenterLbl');
    const centerAmt = container.querySelector('#planDonutCenterAmt');
    const centerSub = container.querySelector('#planDonutCenterSub');

    segments.forEach((seg) => {
      const name = seg.getAttribute('data-name');
      const val = Number(seg.getAttribute('data-val')) || 0;
      const pct = seg.getAttribute('data-pct');

      const onHover = () => {
        segments.forEach(s => { s.style.opacity = '0.35'; });
        seg.style.opacity = '1';
        seg.style.strokeWidth = '22';

        if (centerLbl) centerLbl.textContent = name;
        if (centerAmt) centerAmt.textContent = fmtRpShort(val);
        if (centerSub) centerSub.textContent = `${pct}% dari budget`;
      };

      const onLeave = () => {
        segments.forEach(s => {
          s.style.opacity = '1';
          s.style.strokeWidth = '';
        });
        if (centerLbl) centerLbl.textContent = 'Total Pengeluaran';
        if (centerAmt) centerAmt.textContent = fmtRpShort(defaultExp);
        if (centerSub) centerSub.textContent = `dari ${fmtRpShort(defaultInc)}`;
      };

      seg.addEventListener('mouseenter', onHover);
      seg.addEventListener('mouseleave', onLeave);
      seg.addEventListener('touchstart', (e) => {
        onHover();
        setTimeout(onLeave, 2500);
      }, { passive: true });
    });
  }

  /**
   * Render Goals Summary Ring / Badge
   */
  function renderGoalsSummary(d) {
    const el = document.getElementById('goalsPaceSummary');
    if (!el) return;
    const goals = (MT.state && MT.state.goals) || [];
    if (!goals.length) {
      el.innerHTML = '<span class="text-secondary text-xs">Belum ada target keuangan dibuat.</span>';
      return;
    }

    const totalSaved = goals.reduce((s, g) => s + (Number(g.saved || g.initialSaved) || 0), 0);
    const totalTarget = goals.reduce((s, g) => s + (Number(g.target) || 0), 0);
    const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

    el.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <span style="font-size:12px; font-weight:600; color:var(--t1);">Terkumpul: ${fmtRp(totalSaved)}</span>
        <span style="font-size:12px; color:var(--accent); font-weight:700;">${overallPct}%</span>
      </div>
      <div style="height:6px; background:rgba(255,255,255,0.06); border-radius:999px; overflow:hidden;">
        <div style="height:100%; width:${overallPct}%; background:linear-gradient(90deg, var(--accent), var(--green)); border-radius:999px; transition:width 0.4s ease;"></div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resize() {
    if (cachedData) render();
  }

  MT.planFeatures = {
    render,
    resize
  };
})();
