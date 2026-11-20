/**
 * spending-trend.js — Fitur Tren Pengeluaran Kumulatif (Spending Trend)
 * Menggantikan grafik Pengeluaran Harian standar.
 * Membandingkan akumulasi pengeluaran harian Bulan Ini (kurva hijau/aksen)
 * dengan benchmark Bulan Lalu (kurva abu-abu) dalam satu sumbu hari.
 * Dilengkapi filter kategori, pemilih bulan, kartu KPI selisih (delta),
 * guideline interaktif, dan sentuhan scrubber mobile.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const { fmtRp, fmtRpShort } = MT.fmt || {
    fmtRp: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID'),
    fmtRpShort: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID')
  };

  const MONTH_NAMES = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const SHORT_MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  let selectedCategory = 'all'; // 'all' atau nama kategori
  let cachedData = null;
  let activeTooltip = null;

  /**
   * Hitung deret kumulatif harian dari array pengeluaran per hari
   */
  function computeCumulativeSeries(dailyArr, limitDay) {
    if (!dailyArr || !dailyArr.length) return [];
    let cumulative = 0;
    const len = limitDay ? Math.min(dailyArr.length, limitDay) : dailyArr.length;
    const result = [];
    for (let i = 0; i < len; i++) {
      cumulative += Number(dailyArr[i]) || 0;
      result.push({
        day: i + 1,
        dailyValue: Number(dailyArr[i]) || 0,
        value: cumulative
      });
    }
    return result;
  }

  /**
   * Ambil data harian spesifik untuk kategori yang dipilih (jika ada)
   */
  function getDailyForCategory(d, cat, isPrevious) {
    if (cat === 'all') {
      return isPrevious ? (d.pDaily || []) : (d.daily || []);
    }
    const catMap = isPrevious ? (d.pDailyByCategory || {}) : (d.dailyByCategory || {});
    if (catMap[cat]) {
      return catMap[cat];
    }
    // Fallback hitung dari state.transactions jika data lokal ada
    if (!isPrevious && MT.state && MT.state.transactions) {
      const year = MT.state.currentYear || new Date().getFullYear();
      const month = MT.state.currentMonth || (new Date().getMonth() + 1);
      const days = new Date(year, month, 0).getDate();
      const arr = new Array(days).fill(0);
      MT.state.transactions.forEach((t) => {
        if (t.kind === 'expense' && t.category === cat && t.date) {
          const dt = new Date(t.date);
          const day = dt.getDate();
          if (day >= 1 && day <= days) {
            arr[day - 1] += Number(t.amount) || 0;
          }
        }
      });
      return arr;
    }
    return [];
  }

  /**
   * Render utama Spending Trend
   */
  function render(dashboardData) {
    if (dashboardData) cachedData = dashboardData;
    const d = cachedData || (MT.state && MT.state.dashboard);
    if (!d) return;

    const curMonth = (MT.state && MT.state.currentMonth) || (new Date().getMonth() + 1);
    const curYear = (MT.state && MT.state.currentYear) || new Date().getFullYear();
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;

    const todayDate = new Date();
    const isCurrentActiveMonth = (todayDate.getMonth() + 1 === curMonth && todayDate.getFullYear() === curYear);
    const daysInCurMonth = new Date(curYear, curMonth, 0).getDate();
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
    const elapsedDays = isCurrentActiveMonth ? Math.min(todayDate.getDate(), daysInCurMonth) : daysInCurMonth;

    // Ambil deret harian berdasarkan filter kategori
    let curDaily = getDailyForCategory(d, selectedCategory, false);
    if (!curDaily || !curDaily.length) curDaily = d.daily || new Array(daysInCurMonth).fill(0);

    let prevDaily = getDailyForCategory(d, selectedCategory, true);
    // Jika prevDaily belum tersedia di backend lama, buat benchmark proporsional dari pTotalExp
    if (!prevDaily || !prevDaily.length) {
      const pTot = selectedCategory === 'all'
        ? Number(d.summary && d.summary.pTotalExp) || 0
        : (d.catComp && d.catComp.find(c => c.category === selectedCategory)?.previous) || 0;

      if (pTot > 0) {
        prevDaily = new Array(daysInPrevMonth).fill(0).map(() => pTot / daysInPrevMonth);
      } else {
        prevDaily = new Array(daysInPrevMonth).fill(0);
      }
    }

    const curSeries = computeCumulativeSeries(curDaily, elapsedDays);
    const prevSeries = computeCumulativeSeries(prevDaily, daysInPrevMonth);

    const currentTotal = curSeries.length ? curSeries[curSeries.length - 1].value : 0;
    // Nilai pembanding bulan lalu s/d hari yang sama
    const prevComparisonIdx = Math.min(elapsedDays - 1, prevSeries.length - 1);
    const prevComparisonTotal = (prevComparisonIdx >= 0 && prevSeries[prevComparisonIdx]) ? prevSeries[prevComparisonIdx].value : 0;
    const prevFullTotal = prevSeries.length ? prevSeries[prevSeries.length - 1].value : 0;

    const delta = currentTotal - prevComparisonTotal;
    const deltaPct = prevComparisonTotal > 0 ? ((delta / prevComparisonTotal) * 100).toFixed(1) : 0;

    // 1. Update Header Controls (Tanggal & Dropdown Filter)
    updateHeaderInfo(curMonth, curYear, prevMonth, prevYear, elapsedDays, d);

    // 2. Update KPI Metric Cards
    updateKpiCards(currentTotal, delta, deltaPct, prevComparisonTotal, prevFullTotal, elapsedDays, isCurrentActiveMonth);

    // 3. Render Interactive Line Chart (SVG)
    renderSpendingChart(curSeries, prevSeries, daysInCurMonth, elapsedDays, curMonth, curYear, prevMonth);

    // 4. Update Peak Day Info
    updatePeakDay(curDaily);
  }

  function updateHeaderInfo(curMonth, curYear, prevMonth, prevYear, elapsedDays, d) {
    const rangeEl = document.getElementById('spendingDateRange');
    if (rangeEl) {
      rangeEl.textContent = `1 - ${elapsedDays} ${MONTH_NAMES[curMonth - 1]} ${curYear}`;
    }

    // Populate Category Filter dropdown jika belum
    const filterEl = document.getElementById('spendingCategorySelect');
    if (filterEl && (!filterEl.children.length || filterEl.children.length === 1)) {
      const cats = (d.catComp && d.catComp.map(c => c.category)) ||
                   (MT.state && MT.state.categories && MT.state.categories.map(c => c.name)) || [];
      const uniqueCats = Array.from(new Set(cats)).filter(Boolean);

      filterEl.innerHTML = '<option value="all">Semua Kategori</option>';
      uniqueCats.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        if (c === selectedCategory) opt.selected = true;
        filterEl.appendChild(opt);
      });

      filterEl.onchange = (e) => {
        selectedCategory = e.target.value;
        render();
      };
    }
  }

  function updateKpiCards(currentTotal, delta, deltaPct, prevComparisonTotal, prevFullTotal, elapsedDays, isCurrentActiveMonth) {
    const elCurTotal = document.getElementById('spendingCurrentTotal');
    const elDelta = document.getElementById('spendingDelta');
    const elPrevTotal = document.getElementById('spendingPrevTotal');
    const elPrevSub = document.getElementById('spendingPrevSub');

    if (elCurTotal) elCurTotal.textContent = fmtRp(currentTotal);

    if (elDelta) {
      if (delta === 0) {
        elDelta.textContent = 'Sama dengan bulan lalu';
        elDelta.className = 'spending-delta-badge neutral';
      } else if (delta < 0) {
        // Lebih hemat
        elDelta.textContent = `-${fmtRp(Math.abs(delta))} (${Math.abs(deltaPct)}% lebih hemat)`;
        elDelta.className = 'spending-delta-badge positive';
      } else {
        // Lebih boros
        elDelta.textContent = `+${fmtRp(delta)} (+${deltaPct}% lebih boros)`;
        elDelta.className = 'spending-delta-badge negative';
      }
    }

    if (elPrevTotal) {
      elPrevTotal.textContent = fmtRp(isCurrentActiveMonth ? prevComparisonTotal : prevFullTotal);
    }
    if (elPrevSub) {
      elPrevSub.textContent = isCurrentActiveMonth ? `(s/d tgl ${elapsedDays} bulan lalu)` : '(total sebulan penuh)';
    }
  }

  function updatePeakDay(curDaily) {
    const peakDayEl = document.getElementById('peakDay');
    if (!peakDayEl) return;
    let maxVal = 0;
    let peakIdx = -1;
    curDaily.forEach((val, idx) => {
      const v = Number(val) || 0;
      if (v > maxVal) {
        maxVal = v;
        peakIdx = idx;
      }
    });

    if (maxVal > 0 && peakIdx >= 0) {
      peakDayEl.textContent = `Tgl ${peakIdx + 1} — ${fmtRp(maxVal)}`;
    } else {
      peakDayEl.textContent = '—';
    }
  }

  /**
   * Render SVG Curve Chart
   */
  function renderSpendingChart(curSeries, prevSeries, maxDays, elapsedDays, curMonth, curYear, prevMonth) {
    const container = document.getElementById('spendingChartWrap');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width) || 600);
    const height = width < 500 ? 190 : 220;

    const margin = { top: 12, right: width < 500 ? 50 : 64, bottom: 26, left: 10 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    // Hitung max nilai y
    let maxVal = 100000;
    curSeries.forEach(p => { if (p.value > maxVal) maxVal = p.value; });
    prevSeries.forEach(p => { if (p.value > maxVal) maxVal = p.value; });
    maxVal = maxVal * 1.08; // room for top padding

    // Scale helpers
    const scaleX = (day) => margin.left + ((day - 1) / Math.max(1, maxDays - 1)) * innerW;
    const scaleY = (val) => margin.top + innerH - (val / maxVal) * innerH;

    // Buat SVG Path line
    function makePath(series) {
      if (!series || !series.length) return '';
      return series.map((p, i) => {
        const x = scaleX(p.day).toFixed(1);
        const y = scaleY(p.value).toFixed(1);
        return (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
      }).join(' ');
    }

    const curPathD = makePath(curSeries);
    const prevPathD = makePath(prevSeries);

    // Area fill untuk kurva saat ini
    let curAreaD = '';
    if (curSeries.length > 0) {
      const xStart = scaleX(curSeries[0].day).toFixed(1);
      const xEnd = scaleX(curSeries[curSeries.length - 1].day).toFixed(1);
      const yZero = (margin.top + innerH).toFixed(1);
      curAreaD = `${curPathD} L ${xEnd} ${yZero} L ${xStart} ${yZero} Z`;
    }

    // Gridlines (4 ticks)
    const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal * 0.95];
    const gridMarkup = yTicks.map((val) => {
      const y = scaleY(val).toFixed(1);
      return `
        <line x1="${margin.left}" y1="${y}" x2="${margin.left + innerW}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />
        <text x="${margin.left + innerW + 8}" y="${Number(y) + 4}" fill="var(--t4)" font-size="10px" font-family="var(--mono, monospace)">
          ${fmtRpShort(val)}
        </text>
      `;
    }).join('');

    // X-axis ticks (tgl 1, pertengahan, akhir bulan)
    const xTicks = [1, Math.round(maxDays / 2), maxDays];
    const xTicksMarkup = xTicks.map((day) => {
      const x = scaleX(day).toFixed(1);
      const textAnchor = day === 1 ? 'start' : (day === maxDays ? 'end' : 'middle');
      return `
        <text x="${x}" y="${margin.top + innerH + 18}" text-anchor="${textAnchor}" fill="var(--t3)" font-size="11px" font-weight="500">
          Tgl ${day}
        </text>
      `;
    }).join('');

    // Endpoint dot (Hari Ini)
    let todayDotMarkup = '';
    if (curSeries.length > 0) {
      const lastPoint = curSeries[curSeries.length - 1];
      const dotX = scaleX(lastPoint.day).toFixed(1);
      const dotY = scaleY(lastPoint.value).toFixed(1);
      todayDotMarkup = `
        <circle cx="${dotX}" cy="${dotY}" r="6" fill="var(--accent)" opacity="0.3" class="spending-pulse" />
        <circle cx="${dotX}" cy="${dotY}" r="4" fill="var(--accent)" stroke="var(--bg)" stroke-width="2" />
      `;
    }

    container.innerHTML = `
      <svg class="spending-trend-svg"
        viewBox="0 0 ${width} ${height}"
        width="100%"
        height="${height}"
        style="overflow: visible; display: block;"
      >
        <defs>
          <linearGradient id="spendingAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00e5b4" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#00e5b4" stop-opacity="0.01" />
          </linearGradient>
        </defs>

        <!-- Gridlines -->
        <g class="spending-grid">${gridMarkup}</g>

        <!-- Previous Month Line (Benchmark Abu-Abu) -->
        <path d="${prevPathD}" fill="none" stroke="var(--t4)" stroke-width="1.75" stroke-dasharray="3,3" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Current Month Area & Line (Aksen / Hijau) -->
        <path d="${curAreaD}" fill="url(#spendingAreaGrad)" />
        <path d="${curPathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Today Dot -->
        ${todayDotMarkup}

        <!-- X-Axis Labels -->
        <g class="spending-xaxis">${xTicksMarkup}</g>

        <!-- Interactive Guideline & Hover Elements -->
        <line id="spendingGuideLine" x1="0" y1="${margin.top}" x2="0" y2="${margin.top + innerH}" stroke="rgba(255,255,255,0.4)" stroke-dasharray="3,3" style="display:none;" />
        <circle id="spendingCurHoverDot" r="4.5" fill="var(--accent)" stroke="var(--card)" stroke-width="1.5" style="display:none;" />
        <circle id="spendingPrevHoverDot" r="4.5" fill="var(--t3)" stroke="var(--card)" stroke-width="1.5" style="display:none;" />

        <!-- Invisible Hit Surface for mouse/touch scrubbing -->
        <rect class="spending-hit-surface" x="${margin.left}" y="${margin.top}" width="${innerW}" height="${innerH}" fill="transparent" style="cursor: crosshair;" />
      </svg>
    `;

    // Pasang scrubber mouse & touch
    attachScrubber(container, curSeries, prevSeries, maxDays, scaleX, scaleY, curMonth, curYear, prevMonth);
  }

  function attachScrubber(container, curSeries, prevSeries, maxDays, scaleX, scaleY, curMonth, curYear, prevMonth) {
    const hitSurface = container.querySelector('.spending-hit-surface');
    const guideLine = container.querySelector('#spendingGuideLine');
    const curDot = container.querySelector('#spendingCurHoverDot');
    const prevDot = container.querySelector('#spendingPrevHoverDot');
    if (!hitSurface) return;

    const tooltip = getOrCreateTooltip();

    const curMap = new Map(curSeries.map(p => [p.day, p]));
    const prevMap = new Map(prevSeries.map(p => [p.day, p]));

    function handleMove(clientX, clientY) {
      const rect = hitSurface.getBoundingClientRect();
      const relX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, relX / rect.width));
      const targetDay = Math.round(1 + ratio * (maxDays - 1));

      const curPoint = curMap.get(targetDay);
      const prevPoint = prevMap.get(targetDay);
      if (!curPoint && !prevPoint) return;

      const posX = scaleX(targetDay);
      guideLine.setAttribute('x1', posX);
      guideLine.setAttribute('x2', posX);
      guideLine.style.display = 'block';

      if (curPoint) {
        curDot.setAttribute('cx', posX);
        curDot.setAttribute('cy', scaleY(curPoint.value));
        curDot.style.display = 'block';
      } else {
        curDot.style.display = 'none';
      }

      if (prevPoint) {
        prevDot.setAttribute('cx', posX);
        prevDot.setAttribute('cy', scaleY(prevPoint.value));
        prevDot.style.display = 'block';
      } else {
        prevDot.style.display = 'none';
      }

      const curVal = curPoint ? fmtRp(curPoint.value) : '—';
      const prevVal = prevPoint ? fmtRp(prevPoint.value) : '—';
      const dailyExpense = curPoint ? fmtRp(curPoint.dailyValue) : 'Rp 0';

      tooltip.innerHTML = `
        <div style="font-size:11px; color:var(--t3); margin-bottom:4px;">
          Tanggal ${targetDay} ${SHORT_MONTH_NAMES[curMonth - 1]}
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:2px;">
          <span style="display:flex; align-items:center; gap:6px; color:var(--t1); font-weight:600;">
            <span style="width:8px; height:8px; border-radius:50%; background:var(--accent);"></span>
            ${SHORT_MONTH_NAMES[curMonth - 1]}:
          </span>
          <span style="font-family:var(--mono, monospace); font-weight:700; color:var(--accent);">${curVal}</span>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:4px;">
          <span style="display:flex; align-items:center; gap:6px; color:var(--t3);">
            <span style="width:8px; height:8px; border-radius:50%; background:var(--t4);"></span>
            ${SHORT_MONTH_NAMES[prevMonth - 1]}:
          </span>
          <span style="font-family:var(--mono, monospace); color:var(--t2);">${prevVal}</span>
        </div>
        ${curPoint ? `
          <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:4px; font-size:10px; color:var(--t3);">
            Pengeluaran hari ini: <b style="color:var(--t1);">${dailyExpense}</b>
          </div>
        ` : ''}
      `;

      positionTooltip(tooltip, clientX, clientY);
    }

    function handleLeave() {
      if (guideLine) guideLine.style.display = 'none';
      if (curDot) curDot.style.display = 'none';
      if (prevDot) prevDot.style.display = 'none';
      hideTooltip(tooltip);
    }

    hitSurface.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    hitSurface.addEventListener('mouseleave', handleLeave);

    hitSurface.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    }, { passive: true });

    hitSurface.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    }, { passive: true });

    hitSurface.addEventListener('touchend', () => {
      setTimeout(handleLeave, 3000);
    });
  }

  function getOrCreateTooltip() {
    let tip = document.getElementById('spendingGlobalTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'spendingGlobalTooltip';
      tip.className = 'spending-floating-tooltip';
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
    const tipWidth = tip.offsetWidth || 190;
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
    if (cachedData) render();
  }

  function init() {
    window.addEventListener('resize', () => {
      clearTimeout(window._spendingResizeTimer);
      window._spendingResizeTimer = setTimeout(resize, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  MT.spending = {
    render,
    resize,
    setCategory: (cat) => {
      selectedCategory = cat;
      render();
    }
  };
})();
