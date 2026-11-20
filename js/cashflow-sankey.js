/**
 * cashflow-sankey.js — Visualisasi Arus Kas (Sankey Flow Chart)
 * Menampilkan aliran dana: Pemasukan -> Arus Kas / Dompet -> Pengeluaran, Tabungan & Surplus.
 * Terintegrasi penuh dengan sistem state MTPro, mendukung mode Kategori & Dompet,
 * dialog zoom fullscreen, dan dioptimalkan responsif untuk tampilan mobile.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const { fmtRp, fmtRpShort } = MT.fmt || {
    fmtRp: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID'),
    fmtRpShort: (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID')
  };

  const DEFAULT_COLORS = [
    '#22c55e', '#00e5b4', '#38bdf8', '#818cf8', '#f59e0b',
    '#f43f5e', '#e879f9', '#a78bfa', '#fb7185', '#34d399', '#fbbf24'
  ];
  const COLOR_INCOME = '#22c55e';
  const COLOR_EXPENSE = '#f43f5e';
  const COLOR_SAVING = '#0d9488';
  const COLOR_SURPLUS = '#10b981';
  const COLOR_DEFICIT = '#ef4444';
  const COLOR_HUB = '#6366f1';

  let currentViewMode = 'category'; // 'category' | 'wallet'
  let cachedDashboardData = null;
  let activeTooltip = null;

  /**
   * Bangun graph nodes & links dari data dashboard
   */
  function buildSankeyData(d, mode) {
    if (!d || !d.summary) return null;
    const summary = d.summary;
    const totalInc = Math.max(0, Number(summary.totalInc) || 0);
    const totalExp = Math.max(0, Number(summary.totalExp) || 0);
    const totalSav = Math.max(0, Number(summary.totalSav) || 0);
    const balance = Number(summary.balance) || (totalInc - totalExp - totalSav);

    if (totalInc === 0 && totalExp === 0 && totalSav === 0) {
      return null;
    }

    const nodes = [];
    const links = [];
    const nodeMap = {};

    function addNode(id, name, value, col, color, extra) {
      if (nodeMap[id] !== undefined) return nodeMap[id];
      const idx = nodes.length;
      nodeMap[id] = idx;
      nodes.push({
        id,
        name,
        value: Math.max(0, Number(value) || 0),
        col,
        color: color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
        extra: extra || ''
      });
      return idx;
    }

    function addLink(sourceIdx, targetIdx, value) {
      const val = Math.max(0, Number(value) || 0);
      if (val <= 0 || sourceIdx === undefined || targetIdx === undefined) return;
      links.push({
        source: sourceIdx,
        target: targetIdx,
        value: val
      });
    }

    // 1. Inflows (Pemasukan)
    const incSources = d.incomeSources || {};
    let incEntries = Object.entries(incSources).filter(([, v]) => Number(v) > 0);
    if (!incEntries.length) {
      // Fallback: dari transactions di state jika ada
      const txs = (MT.state && MT.state.transactions) || [];
      const tempInc = {};
      txs.forEach((t) => {
        if (t.kind === 'income') {
          const type = t.type || 'Pemasukan';
          tempInc[type] = (tempInc[type] || 0) + (Number(t.amount) || 0);
        }
      });
      incEntries = Object.entries(tempInc).filter(([, v]) => Number(v) > 0);
    }
    if (!incEntries.length && totalInc > 0) {
      incEntries = [['Pemasukan', totalInc]];
    }

    // 2. Hub / Intermediate
    if (mode === 'wallet') {
      // Mode Dompet
      const wallets = d.walletBalances || {};
      const walletEntries = Object.entries(wallets).filter(([, v]) => Number(v) > 0);
      const activeWallets = walletEntries.length ? walletEntries : [['Dompet Utama', totalInc]];

      // Inflows ke masing-masing dompet / rata
      const incNodeIndices = incEntries.map(([name, amt], idx) => {
        return addNode('inc_' + name, name, amt, 0, DEFAULT_COLORS[idx % DEFAULT_COLORS.length]);
      });

      const walletNodeIndices = activeWallets.map(([wName, wBal], idx) => {
        return addNode('w_' + wName, wName, wBal, 1, '#818cf8', 'Saldo: ' + fmtRpShort(wBal));
      });

      // Hubungkan income ke wallets secara proporsional
      const totalW = activeWallets.reduce((s, [, v]) => s + Number(v), 0) || 1;
      incNodeIndices.forEach((incIdx) => {
        const incVal = nodes[incIdx].value;
        walletNodeIndices.forEach((wIdx) => {
          const wProp = nodes[wIdx].value / totalW;
          addLink(incIdx, wIdx, incVal * wProp);
        });
      });

      // Outflows dari wallets
      // Top categories
      const topCats = (d.top10 && d.top10.length) ? d.top10 : [];
      let expTotalRecorded = 0;
      topCats.forEach(([catName, amt]) => {
        const cVal = Number(amt) || 0;
        if (cVal > 0) {
          expTotalRecorded += cVal;
          const expIdx = addNode('exp_' + catName, catName, cVal, 2, COLOR_EXPENSE);
          walletNodeIndices.forEach((wIdx) => {
            const wProp = nodes[wIdx].value / totalW;
            addLink(wIdx, expIdx, cVal * wProp);
          });
        }
      });
      const remainingExp = Math.max(0, totalExp - expTotalRecorded);
      if (remainingExp > 0) {
        const expIdx = addNode('exp_lainnya', 'Pengeluaran Lain', remainingExp, 2, '#fb7185');
        walletNodeIndices.forEach((wIdx) => {
          const wProp = nodes[wIdx].value / totalW;
          addLink(wIdx, expIdx, remainingExp * wProp);
        });
      }

      if (totalSav > 0) {
        const savIdx = addNode('sav_tabungan', 'Tabungan & Investasi', totalSav, 2, COLOR_SAVING);
        walletNodeIndices.forEach((wIdx) => {
          const wProp = nodes[wIdx].value / totalW;
          addLink(wIdx, savIdx, totalSav * wProp);
        });
      }

      if (balance > 0) {
        const surpIdx = addNode('surplus', 'Surplus Kas', balance, 2, COLOR_SURPLUS);
        walletNodeIndices.forEach((wIdx) => {
          const wProp = nodes[wIdx].value / totalW;
          addLink(wIdx, surpIdx, balance * wProp);
        });
      }
    } else {
      // Mode Kategori (Standard Sankey Maybe Style)
      const hubCapacity = Math.max(totalInc, totalExp + totalSav);
      const hubIdx = addNode('hub_cashflow', 'Arus Kas Bersih', hubCapacity, 1, COLOR_HUB, 'Kapasitas: ' + fmtRp(hubCapacity));

      // Inflow -> Hub
      incEntries.forEach(([srcName, amt], idx) => {
        const incIdx = addNode('inc_' + srcName, srcName, amt, 0, DEFAULT_COLORS[idx % DEFAULT_COLORS.length]);
        addLink(incIdx, hubIdx, amt);
      });

      // Hub -> Outflows
      // 1. Kategori Pengeluaran
      const catList = (d.top10 && d.top10.length) ? d.top10 : [];
      let expRecorded = 0;
      catList.forEach(([catName, amt], idx) => {
        const val = Number(amt) || 0;
        if (val > 0) {
          expRecorded += val;
          const expIdx = addNode('exp_' + catName, catName, val, 2, DEFAULT_COLORS[(idx + 4) % DEFAULT_COLORS.length]);
          addLink(hubIdx, expIdx, val);
        }
      });
      const remainingExp = Math.max(0, totalExp - expRecorded);
      if (remainingExp > 0) {
        const expIdx = addNode('exp_lainnya', 'Pengeluaran Lain', remainingExp, 2, '#fb7185');
        addLink(hubIdx, expIdx, remainingExp);
      }

      // 2. Tabungan & Investasi
      if (totalSav > 0) {
        const savIdx = addNode('sav_node', 'Tabungan & Investasi', totalSav, 2, COLOR_SAVING);
        addLink(hubIdx, savIdx, totalSav);
      }

      // 3. Surplus / Defisit
      if (balance > 0) {
        const surpIdx = addNode('surplus_node', 'Surplus (Sisa Kas)', balance, 2, COLOR_SURPLUS);
        addLink(hubIdx, surpIdx, balance);
      } else if (balance < 0) {
        const defIdx = addNode('deficit_node', 'Defisit Kas', Math.abs(balance), 0, COLOR_DEFICIT);
        addLink(defIdx, hubIdx, Math.abs(balance));
      }
    }

    return { nodes, links, totalFlow: Math.max(totalInc, totalExp + totalSav) };
  }

  /**
   * Layout engine murni SVG untuk Sankey (zero external dependency fallback)
   */
  function computeSankeyLayout(data, width, height) {
    const { nodes, links } = data;
    const padding = Math.max(12, Math.min(24, height * 0.04));
    const nodeWidth = width < 480 ? 12 : 18;

    // Kelompokkan node berdasarkan col (0, 1, 2)
    const cols = [[], [], []];
    nodes.forEach((n) => {
      const c = Math.max(0, Math.min(2, n.col || 0));
      cols[c].push(n);
    });

    // Hitung posisi x tiap kolom
    const colX = [
      4,
      Math.round(width / 2 - nodeWidth / 2),
      width - nodeWidth - 4
    ];

    // Hitung y dan height tiap node
    cols.forEach((colNodes, cIdx) => {
      const totalColVal = colNodes.reduce((s, n) => s + n.value, 0) || 1;
      const usableHeight = height - (colNodes.length - 1) * padding - 16;
      let curY = 8;

      colNodes.forEach((node) => {
        node.x = colX[cIdx];
        node.width = nodeWidth;
        const h = Math.max(16, (node.value / totalColVal) * usableHeight);
        node.y = curY;
        node.height = h;
        curY += h + padding;
      });
    });

    // Siapkan port offset untuk links
    const sourceOutOffsets = new Array(nodes.length).fill(0);
    const targetInOffsets = new Array(nodes.length).fill(0);

    const ribbonPaths = links.map((link) => {
      const src = nodes[link.source];
      const tgt = nodes[link.target];
      if (!src || !tgt) return null;

      const linkRatioSrc = src.value > 0 ? link.value / src.value : 0;
      const linkRatioTgt = tgt.value > 0 ? link.value / tgt.value : 0;

      const linkH0 = Math.max(2, src.height * linkRatioSrc);
      const linkH1 = Math.max(2, tgt.height * linkRatioTgt);

      const y0 = src.y + (sourceOutOffsets[link.source] || 0);
      const y1 = tgt.y + (targetInOffsets[link.target] || 0);

      sourceOutOffsets[link.source] += linkH0;
      targetInOffsets[link.target] += linkH1;

      const x0 = src.x + src.width;
      const x1 = tgt.x;

      // Cubic bezier curve coordinates
      const dx = (x1 - x0) * 0.5;
      const path = `M ${x0} ${y0}
        C ${x0 + dx} ${y0}, ${x1 - dx} ${y1}, ${x1} ${y1}
        L ${x1} ${y1 + linkH1}
        C ${x1 - dx} ${y1 + linkH1}, ${x0 + dx} ${y0 + linkH0}, ${x0} ${y0 + linkH0}
        Z`;

      return {
        path,
        link,
        src,
        tgt,
        value: link.value
      };
    }).filter(Boolean);

    return { nodes, ribbonPaths, width, height };
  }

  /**
   * Render SVG Sankey ke container element
   */
  function renderSvgSankey(containerId, sankeyData, isModal) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!sankeyData || !sankeyData.nodes.length || !sankeyData.links.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 40px 16px;">
          <div class="empty-state-icon">🌊</div>
          <div>Belum ada data arus kas untuk ditampilkan bulan ini.</div>
          <div class="muted micro-label" style="margin-top:6px;">Catat pemasukan atau pengeluaran untuk melihat visualisasi alur kas.</div>
        </div>
      `;
      return;
    }

    const rect = container.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width) || (isModal ? 800 : 640));
    const height = isModal ? Math.max(480, Math.min(640, window.innerHeight - 200)) : (width < 600 ? 340 : 380);

    const layout = computeSankeyLayout(sankeyData, width, height);

    // Definisikan defs untuk gradien warna
    const defs = layout.ribbonPaths.map((rp, i) => {
      const gradId = `sankey_grad_${isModal ? 'm_' : ''}${i}`;
      return `
        <linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" x1="${rp.src.x + rp.src.width}" y1="0" x2="${rp.tgt.x}" y2="0">
          <stop offset="0%" stop-color="${rp.src.color}" stop-opacity="0.45" />
          <stop offset="100%" stop-color="${rp.tgt.color}" stop-opacity="0.45" />
        </linearGradient>
      `;
    }).join('');

    // Render Ribbons (Links)
    const linksMarkup = layout.ribbonPaths.map((rp, i) => {
      const gradId = `sankey_grad_${isModal ? 'm_' : ''}${i}`;
      return `
        <path class="sankey-ribbon"
          d="${rp.path}"
          fill="url(#${gradId})"
          stroke="none"
          data-link-index="${i}"
          data-src="${escapeHtml(rp.src.name)}"
          data-tgt="${escapeHtml(rp.tgt.name)}"
          data-val="${rp.value}"
          tabindex="0"
          role="img"
          aria-label="${rp.src.name} ke ${rp.tgt.name}: ${fmtRp(rp.value)}"
        />
      `;
    }).join('');

    // Render Nodes
    const isMobile = width < 600;
    const nodesMarkup = layout.nodes.map((n, i) => {
      const isLeft = n.col === 0;
      const isRight = n.col === 2;
      const isCenter = n.col === 1;

      let labelX = n.x + n.width + 6;
      let textAnchor = 'start';
      if (isRight) {
        labelX = n.x - 6;
        textAnchor = 'end';
      } else if (isCenter) {
        labelX = n.x + n.width / 2;
        textAnchor = 'middle';
      }

      const pct = sankeyData.totalFlow > 0 ? ((n.value / sankeyData.totalFlow) * 100).toFixed(1) : 0;
      const displayName = isMobile && n.name.length > 14 ? n.name.substring(0, 12) + '…' : n.name;

      return `
        <g class="sankey-node-group" data-node-index="${i}" data-name="${escapeHtml(n.name)}" data-val="${n.value}" data-extra="${escapeHtml(n.extra || '')}">
          <rect
            class="sankey-node-rect"
            x="${n.x}"
            y="${n.y}"
            width="${n.width}"
            height="${n.height}"
            rx="4"
            fill="${n.color}"
          />
          <text
            class="sankey-node-label"
            x="${labelX}"
            y="${n.y + Math.min(n.height / 2, 14)}"
            text-anchor="${textAnchor}"
            fill="var(--t1)"
            font-size="${isMobile ? '10px' : '11px'}"
            font-weight="600"
          >
            ${escapeHtml(displayName)}
          </text>
          <text
            class="sankey-node-val"
            x="${labelX}"
            y="${n.y + Math.min(n.height / 2 + 12, 26)}"
            text-anchor="${textAnchor}"
            fill="var(--t3)"
            font-size="${isMobile ? '9px' : '10px'}"
            font-family="var(--mono, monospace)"
          >
            ${fmtRpShort(n.value)} ${!isMobile ? `(${pct}%)` : ''}
          </text>
        </g>
      `;
    }).join('');

    container.innerHTML = `
      <svg class="sankey-svg"
        viewBox="0 0 ${width} ${height}"
        width="100%"
        height="${height}"
        style="overflow: visible; display: block;"
      >
        <defs>${defs}</defs>
        <g class="sankey-links-layer">${linksMarkup}</g>
        <g class="sankey-nodes-layer">${nodesMarkup}</g>
      </svg>
    `;

    // Pasang interactive listeners (hover, tap & tooltip)
    attachInteractivity(container, sankeyData, layout);
  }

  function attachInteractivity(container, sankeyData, layout) {
    const tooltip = getOrCreateTooltip();

    // Ribbons hover / touch
    const ribbons = container.querySelectorAll('.sankey-ribbon');
    ribbons.forEach((ribbon) => {
      const showTip = (e) => {
        const src = ribbon.getAttribute('data-src');
        const tgt = ribbon.getAttribute('data-tgt');
        const val = Number(ribbon.getAttribute('data-val')) || 0;
        const total = sankeyData.totalFlow || 1;
        const pct = ((val / total) * 100).toFixed(1);

        ribbon.style.fillOpacity = '0.85';
        ribbon.style.stroke = 'rgba(255,255,255,0.4)';
        ribbon.style.strokeWidth = '1px';

        tooltip.innerHTML = `
          <div style="font-size:11px; color:var(--t3); margin-bottom:2px;">Alur Kas</div>
          <div style="font-weight:700; color:var(--t1);">${src} &rarr; ${tgt}</div>
          <div style="font-size:13px; font-weight:700; color:var(--accent); margin-top:3px;">
            ${fmtRp(val)} <span style="font-size:11px; color:var(--t3); font-weight:400;">(${pct}%)</span>
          </div>
        `;
        positionTooltip(tooltip, e);
      };

      const hideTip = () => {
        ribbon.style.fillOpacity = '';
        ribbon.style.stroke = '';
        ribbon.style.strokeWidth = '';
        hideTooltip(tooltip);
      };

      ribbon.addEventListener('mouseenter', showTip);
      ribbon.addEventListener('mousemove', (e) => positionTooltip(tooltip, e));
      ribbon.addEventListener('mouseleave', hideTip);
      ribbon.addEventListener('touchstart', (e) => {
        showTip(e.touches[0]);
        setTimeout(hideTip, 3500);
      }, { passive: true });
    });

    // Nodes hover / touch
    const nodeGroups = container.querySelectorAll('.sankey-node-group');
    nodeGroups.forEach((ng) => {
      const showNodeTip = (e) => {
        const name = ng.getAttribute('data-name');
        const val = Number(ng.getAttribute('data-val')) || 0;
        const extra = ng.getAttribute('data-extra');
        const total = sankeyData.totalFlow || 1;
        const pct = ((val / total) * 100).toFixed(1);

        ng.querySelector('.sankey-node-rect').style.filter = 'brightness(1.25) drop-shadow(0 0 6px rgba(0,229,180,0.5))';

        tooltip.innerHTML = `
          <div style="font-weight:700; color:var(--t1); font-size:13px;">${name}</div>
          <div style="font-size:13px; font-weight:700; color:var(--accent); margin-top:2px;">
            ${fmtRp(val)} <span style="font-size:11px; color:var(--t3); font-weight:400;">(${pct}% arus kas)</span>
          </div>
          ${extra ? `<div style="font-size:11px; color:var(--t2); margin-top:3px;">${extra}</div>` : ''}
        `;
        positionTooltip(tooltip, e);
      };

      const hideNodeTip = () => {
        const rect = ng.querySelector('.sankey-node-rect');
        if (rect) rect.style.filter = '';
        hideTooltip(tooltip);
      };

      ng.addEventListener('mouseenter', showNodeTip);
      ng.addEventListener('mousemove', (e) => positionTooltip(tooltip, e));
      ng.addEventListener('mouseleave', hideNodeTip);
      ng.addEventListener('touchstart', (e) => {
        showNodeTip(e.touches[0]);
        setTimeout(hideNodeTip, 3500);
      }, { passive: true });
    });
  }

  function getOrCreateTooltip() {
    let tip = document.getElementById('sankeyGlobalTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'sankeyGlobalTooltip';
      tip.className = 'sankey-floating-tooltip';
      tip.style.position = 'fixed';
      tip.style.zIndex = '9999';
      tip.style.pointerEvents = 'none';
      tip.style.opacity = '0';
      tip.style.transition = 'opacity 0.15s ease';
      document.body.appendChild(tip);
    }
    return tip;
  }

  function positionTooltip(tip, e) {
    tip.style.opacity = '1';
    const clientX = e.clientX || 0;
    const clientY = e.clientY || 0;
    const tipWidth = tip.offsetWidth || 180;
    const tipHeight = tip.offsetHeight || 60;
    const pad = 12;

    let x = clientX + pad;
    let y = clientY - tipHeight - pad;

    // Boundary check
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

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Render utama Cashflow Sankey ke card dashboard
   */
  function render(dashboardData) {
    if (dashboardData) cachedDashboardData = dashboardData;
    const d = cachedDashboardData || (MT.state && MT.state.dashboard);
    if (!d) return;

    const sankeyData = buildSankeyData(d, currentViewMode);
    renderSvgSankey('cashflowSankeyWrap', sankeyData, false);

    // Update stats header pada card
    const summary = d.summary || {};
    const totalInc = Number(summary.totalInc) || 0;
    const totalExp = Number(summary.totalExp) || 0;
    const totalSav = Number(summary.totalSav) || 0;
    const balance = totalInc - totalExp - totalSav;

    const elTotalInc = document.getElementById('cfTotalIncome');
    const elTotalExp = document.getElementById('cfTotalExpense');
    const elBalance = document.getElementById('cfNetBalance');
    if (elTotalInc) elTotalInc.textContent = fmtRpShort(totalInc);
    if (elTotalExp) elTotalExp.textContent = fmtRpShort(totalExp);
    if (elBalance) {
      elBalance.textContent = fmtRp(balance);
      elBalance.className = 'cf-stat-val ' + (balance >= 0 ? 'income' : 'expense');
    }
  }

  /**
   * Buka modal dialog zoom fullscreen
   */
  function openZoomModal() {
    const modal = document.getElementById('cashflowModalOverlay');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    const d = cachedDashboardData || (MT.state && MT.state.dashboard);
    const sankeyData = buildSankeyData(d, currentViewMode);
    renderSvgSankey('cashflowModalSankeyWrap', sankeyData, true);
  }

  function closeZoomModal() {
    const modal = document.getElementById('cashflowModalOverlay');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setViewMode(mode) {
    currentViewMode = mode;
    document.querySelectorAll('[data-cf-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-cf-mode') === mode);
    });
    render();
    const modal = document.getElementById('cashflowModalOverlay');
    if (modal && modal.classList.contains('active')) {
      const d = cachedDashboardData || (MT.state && MT.state.dashboard);
      renderSvgSankey('cashflowModalSankeyWrap', buildSankeyData(d, currentViewMode), true);
    }
  }

  function resize() {
    if (cachedDashboardData) {
      render();
    }
  }

  // Setup DOM events saat DOM siap
  function init() {
    const btnZoom = document.getElementById('btnCashflowZoom');
    if (btnZoom) btnZoom.addEventListener('click', openZoomModal);

    const btnClose = document.getElementById('btnCloseCashflowModal');
    if (btnClose) btnClose.addEventListener('click', closeZoomModal);

    const modalOverlay = document.getElementById('cashflowModalOverlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeZoomModal();
      });
    }

    document.querySelectorAll('[data-cf-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-cf-mode');
        if (mode) setViewMode(mode);
      });
    });

    window.addEventListener('resize', () => {
      clearTimeout(window._cfResizeTimer);
      window._cfResizeTimer = setTimeout(resize, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  MT.cashflow = {
    render,
    resize,
    setViewMode,
    openZoomModal,
    closeZoomModal
  };
})();
