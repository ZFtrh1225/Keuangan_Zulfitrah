/**
 * charts.js — Chart.js render helpers (line, donut/pie, gauge, sparkline, radar).
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const { fmtRp, fmtRpShort } = MT.fmt;

  const charts = {};

  const PIE_COLORS = [
    '#00e5b4', '#818cf8', '#f59e0b', '#f43f5e', '#60a5fa',
    '#a78bfa', '#fb7185', '#34d399', '#fbbf24', '#e879f9'
  ];

  const TOOLTIP_BASE = {
    backgroundColor: '#1e2337',
    titleColor: '#94a3b8',
    bodyColor: '#f1f5f9',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: false
  };

  function destroy(id) {
    if (charts[id]) {
      try { charts[id].destroy(); } catch (e) {}
      delete charts[id];
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Daily Expenses Line
  // ────────────────────────────────────────────────────────────────
  function renderDaily(canvasId, daily) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const ctx = el.getContext('2d');
    const maxVal = Math.max.apply(null, daily.concat([1]));
    const peakIdx = daily.indexOf(maxVal);

    const grad = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(244,63,94,0.35)');
    grad.addColorStop(1, 'rgba(244,63,94,0.02)');

    charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: daily.map((_, i) => i + 1),
        datasets: [{
          data: daily,
          borderColor: '#f43f5e',
          backgroundColor: grad,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: daily.map((v, i) => i === peakIdx ? 5 : v > 0 ? 2 : 0),
          pointBackgroundColor: '#f43f5e',
          pointBorderColor: '#111827',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_BASE, {
            callbacks: {
              title: items => 'Tanggal ' + items[0].label,
              label: item => '  ' + fmtRp(item.raw)
            }
          })
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 10 } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => fmtRpShort(v) }, beginAtZero: true }
        }
      }
    });
    return { peakIdx, peakVal: maxVal };
  }

  // ────────────────────────────────────────────────────────────────
  //  Pie / Doughnut (kategori)
  // ────────────────────────────────────────────────────────────────
  function renderPie(canvasId, items, opts) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const ctx = el.getContext('2d');
    if (!items || !items.length) return null;

    const total = items.reduce((s, x) => s + x.amount, 0);
    const colors = (opts && opts.colors) || PIE_COLORS;

    charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: items.map(x => x.name || x.label),
        datasets: [{
          data: items.map(x => x.amount || x.value),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#111827',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_BASE, {
            callbacks: {
              label: item => '  ' + fmtRp(item.raw) + ' (' + (item.raw / total * 100).toFixed(1) + '%)'
            }
          })
        }
      }
    });
    return total;
  }

  // ────────────────────────────────────────────────────────────────
  //  Gauge Speedometer (180°) untuk Budgeting
  // ────────────────────────────────────────────────────────────────
  const gaugeNeedlePlugin = {
    id: 'gaugeNeedle',
    afterDatasetDraw(chart) {
      if (chart.config.options.circumference !== 180) return;
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta.data.length) return;
      const cx = meta.data[0].x;
      const cy = meta.data[0].y;
      const outerRadius = meta.data[0].outerRadius;
      const v = chart.config.options.plugins.gaugeNeedle.value;
      const angle = Math.PI + (v / 120 * Math.PI);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(outerRadius - 12, 0);
      ctx.lineTo(0, 4);
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      ctx.restore();
    }
  };

  function renderGauge(canvasId, actual, budget, isExpense) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    destroy(canvasId);
    const ctx = el.getContext('2d');

    let ratio = budget > 0 ? (actual / budget * 100) : 0;
    if (budget === 0 && actual > 0) ratio = 120;

    let chartData, bgColors, color;
    if (isExpense) {
      // 0-80 hijau, 80-100 kuning, >100 merah
      chartData = [80, 20, 20];
      bgColors = ['rgba(34,197,94,0.65)', 'rgba(245,158,11,0.65)', 'rgba(244,63,94,0.65)'];
      color = ratio >= 100 ? 'var(--red)' : ratio >= 80 ? 'var(--amber)' : 'var(--green)';
    } else {
      // 0-50 merah, 50-100 kuning, >100 hijau
      chartData = [50, 50, 20];
      bgColors = ['rgba(244,63,94,0.65)', 'rgba(245,158,11,0.65)', 'rgba(34,197,94,0.65)'];
      color = ratio >= 100 ? 'var(--green)' : ratio >= 50 ? 'var(--amber)' : 'var(--red)';
    }

    const needlePos = Math.min(ratio, 120);

    charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      plugins: [gaugeNeedlePlugin],
      data: {
        labels: ['Z1', 'Z2', 'Z3'],
        datasets: [{ data: chartData, backgroundColor: bgColors, borderWidth: 2, borderColor: '#111827', hoverOffset: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        circumference: 180,
        rotation: -90,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          gaugeNeedle: { value: needlePos }
        },
        animation: { animateRotate: true, duration: 900 }
      }
    });
    return color;
  }

  // ────────────────────────────────────────────────────────────────
  //  Sparkline (Net Worth trend)
  // ────────────────────────────────────────────────────────────────
  function renderSparkline(canvasId, points, color) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const ctx = el.getContext('2d');
    color = color || '#00e5b4';

    charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: points.map(p => p.label || ''),
        datasets: [{
          data: points.map(p => (typeof p === 'number') ? p : p.value),
          borderColor: color,
          backgroundColor: 'rgba(0,229,180,0.12)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#111827',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_BASE, {
            callbacks: {
              title: items => items[0].label,
              label: item => '  ' + fmtRp(item.raw)
            }
          })
        },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  // ────────────────────────────────────────────────────────────────
  //  Forecast (3 bulan + history) — line chart
  // ────────────────────────────────────────────────────────────────
  function renderForecast(canvasId, history, forecastMonths) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const ctx = el.getContext('2d');

    const histLabels = history.map(m => m.label);
    const histInc = history.map(m => m.income);
    const histExp = history.map(m => m.expenses);
    const histSav = history.map(m => m.savings);

    const fcLabels = forecastMonths.map(m => m.label + ' *');
    const fcInc = forecastMonths.map(m => m.projectedIncome);
    const fcExp = forecastMonths.map(m => m.projectedExpense);
    const fcSav = forecastMonths.map(m => m.projectedSaving);

    const labels = histLabels.concat(fcLabels);

    // null padding agar dataset gabungan tetap aligned
    const incomeData = histInc.concat(fcInc);
    const expenseData = histExp.concat(fcExp);
    const savingData = histSav.concat(fcSav);

    charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Pemasukan',
            data: incomeData,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.08)',
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: 3,
            segment: {
              borderDash: ctx => ctx.p1DataIndex >= history.length ? [6, 4] : []
            }
          },
          {
            label: 'Pengeluaran',
            data: expenseData,
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244,63,94,0.08)',
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: 3,
            segment: {
              borderDash: ctx => ctx.p1DataIndex >= history.length ? [6, 4] : []
            }
          },
          {
            label: 'Tabungan',
            data: savingData,
            borderColor: '#818cf8',
            backgroundColor: 'rgba(129,140,248,0.08)',
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: 3,
            segment: {
              borderDash: ctx => ctx.p1DataIndex >= history.length ? [6, 4] : []
            }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { color: '#94a3b8', boxWidth: 10, boxHeight: 10, font: { size: 11 } }
          },
          tooltip: Object.assign({}, TOOLTIP_BASE, {
            displayColors: true,
            callbacks: { label: ctx => '  ' + ctx.dataset.label + ': ' + fmtRp(ctx.raw) }
          })
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => fmtRpShort(v) }, beginAtZero: true }
        }
      }
    });
  }

  // ────────────────────────────────────────────────────────────────
  //  Asset Allocation
  // ────────────────────────────────────────────────────────────────
  function renderAllocation(canvasId, allocation) {
    if (!allocation || !allocation.length) return null;
    const total = allocation.reduce((s, x) => s + x.value, 0);
    const items = allocation.map(a => ({ name: a.label, amount: a.value }));
    const colors = allocation.map(a => a.color);
    renderPie(canvasId, items, { colors });
    return total;
  }

  MT.charts = {
    PIE_COLORS,
    destroy,
    renderDaily,
    renderPie,
    renderGauge,
    renderSparkline,
    renderForecast,
    renderAllocation
  };
})();
