/**
 * app.js — Main application logic.
 * Wires DOM events, render functions, modals, FAB, onboarding, transactions edit/delete.
 */
(function () {
  'use strict';

  const MT = window.MT;
  const { fmtRp, fmtRpShort, parseRp, applyCurrencyMask, fmtDateShort, fmtDateLong, fmtPct, escapeHtml, mdToHtml, debounce, daysFromToday } = MT.fmt;
  const api = MT.api;
  const store = MT.store;
  const state = MT.state;
  const charts = MT.charts;

  // ────────────────────────────────────────────────────────────────
  //  CATEGORIES (dynamically loaded from backend, single source of truth)
  // ────────────────────────────────────────────────────────────────
  // Daftar kategori + subkategori sekarang dimuat dari backend Code.gs
  // (lihat const CATEGORIES & endpoint getCategories). Frontend tidak
  // hardcode lagi — sehingga menambah kategori cukup edit 1 file di server.

  /**
   * Cari subkategori untuk kategori bernama `cat` dari state.categories.
   * Fallback ke generic ['Umum', 'Lainnya'] kalau belum dimuat.
   */
  function getSubcatsFor(cat) {
    const cats = (state.categories || []);
    const found = cats.find(c => c.name === cat);
    return (found && found.subcategories && found.subcategories.length)
      ? found.subcategories
      : ['Umum', 'Lainnya'];
  }

  /**
   * Isi dropdown <select id="expCat"> dari state.categories.
   * Dipanggil setelah categories berhasil di-load.
   */
  function populateCategoryDropdown() {
    const sel = $('expCat');
    if (!sel) return;
    const prevValue = sel.value;
    const cats = state.categories || [];
    if (!cats.length) {
      sel.innerHTML = '<option value="">— Memuat kategori… —</option>';
      return;
    }

    // Group by type → Kebutuhan / Keinginan / Investasi
    const groups = {
      needs: { label: '🏠 Kebutuhan', items: [] },
      wants: { label: '🛍️ Keinginan', items: [] },
      invest: { label: '📈 Investasi & Tabungan', items: [] }
    };
    cats.forEach(c => {
      const g = groups[c.type] || groups.wants;
      g.items.push(c);
    });

    let html = '<option value="">— Pilih Kategori —</option>';
    Object.values(groups).forEach(g => {
      if (!g.items.length) return;
      html += `<optgroup label="${escapeHtml(g.label)}">`;
      g.items.forEach(c => {
        const lbl = (c.icon ? c.icon + ' ' : '') + c.name;
        html += `<option value="${escapeHtml(c.name)}">${escapeHtml(lbl)}</option>`;
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;

    // Restore previous selection if still valid
    if (prevValue && cats.some(c => c.name === prevValue)) {
      sel.value = prevValue;
      loadSubcat();
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  UI HELPERS
  // ────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function showLoading(show) {
    const el = $('loadingOverlay');
    if (!el) return;
    el.classList.toggle('hidden', !show);
    el.setAttribute('aria-hidden', String(!show));
  }
  function showToast(msg, type = 'info') {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add('open');
  }
  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('open');
  }

  // ────────────────────────────────────────────────────────────────
  //  INIT
  // ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupFilters();
    setDefaultDates();
    setupEventDelegation();
    setupModalDismissal();
    setupCurrencyMasks();
    setupFab();
    setupSearch();

    // Load kategori dari cache lokal dulu (instan), lalu fetch terbaru di background
    const cachedCats = store.getCachedCategories();
    if (cachedCats && cachedCats.length) {
      store.setCategories(cachedCats);
      populateCategoryDropdown();
    }
    loadCategories(); // refresh non-blocking

    if (!store.isOnboarded()) {
      openModal('onboardingOverlay');
      setupOnboarding();
    }

    // Load cached data first (instant render), then fetch
    const cached = store.getCachedDashboard(state.currentMonth, state.currentYear);
    if (cached && cached.data) {
      store.setDashboard(cached.data);
      renderAll(cached.data);
      showLoading(false);
    }
    await loadDashboard();
    loadGoals();
    loadTransactions();
  }

  /** Fetch daftar kategori dari backend & isi dropdown. */
  async function loadCategories() {
    const res = await api.getCategories();
    if (res && res.success && Array.isArray(res.categories)) {
      store.setCategories(res.categories);
      populateCategoryDropdown();
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  FILTERS (Month / Year)
  // ────────────────────────────────────────────────────────────────
  function setupFilters() {
    const m = $('monthSel');
    const y = $('yearSel');
    const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    months.forEach((mn, i) => {
      const o = new Option(mn, i + 1);
      if (i + 1 === state.currentMonth) o.selected = true;
      m.add(o);
    });
    const yr = new Date().getFullYear();
    for (let yy = yr; yy >= 2020; yy--) {
      const o = new Option(yy, yy);
      if (yy === state.currentYear) o.selected = true;
      y.add(o);
    }
    m.addEventListener('change', () => { store.setMonthYear(parseInt(m.value, 10), state.currentYear); refresh(); });
    y.addEventListener('change', () => { store.setMonthYear(state.currentMonth, parseInt(y.value, 10)); refresh(); });
  }

  function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    ['incomeDate', 'expDate', 'savDate', 'goalDeadline'].forEach(id => {
      const el = $(id);
      if (el && !el.value) el.value = today;
    });
  }

  async function refresh() {
    const cached = store.getCachedDashboard(state.currentMonth, state.currentYear);
    if (cached && cached.data) {
      store.setDashboard(cached.data);
      renderAll(cached.data);
    }
    await loadDashboard();
    loadTransactions();
  }

  // ────────────────────────────────────────────────────────────────
  //  EVENT DELEGATION (clicks)
  // ────────────────────────────────────────────────────────────────
  function setupEventDelegation() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      // Pill selectors
      if (t.matches('.type-pill, .source-pill')) {
        const group = t.closest('.type-pills, .source-pills');
        if (!group) return;
        group.querySelectorAll('.active').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        // budget rule selector special-case
        if (group.id === 'budgetRulePills') {
          $('customBudgetWrap').hidden = t.dataset.val !== 'Custom';
        }
        return;
      }

      // Tab buttons (transaction modal)
      if (t.matches('.tab-btn[data-tab]')) {
        const tab = t.dataset.tab;
        const modal = t.closest('.modal');
        if (!modal) return;
        modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        modal.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        t.classList.add('active');
        const target = modal.querySelector('#tab-' + tab);
        if (target) target.classList.add('active');
        return;
      }

      // Tab buttons (wealth modal)
      if (t.matches('.tab-btn[data-wealth-tab]')) {
        const tab = t.dataset.wealthTab;
        const modal = t.closest('.modal');
        modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        modal.querySelectorAll('.tab-btn[data-wealth-tab]').forEach(b => b.classList.remove('active'));
        t.classList.add('active');
        const target = modal.querySelector('#tab-' + tab);
        if (target) target.classList.add('active');
        return;
      }

      // Modal close
      if (t.matches('[data-close]')) {
        closeModal(t.dataset.close);
        return;
      }
      if (t.classList && t.classList.contains('modal-overlay')) {
        // click on backdrop
        t.classList.remove('open');
        return;
      }
    });

    // Header buttons
    $('btnAdd').addEventListener('click', () => { openModal('modalOverlay'); switchTxTab('income'); });
    $('btnWealth').addEventListener('click', () => openModal('wealthModalOverlay'));
    $('btnSettings').addEventListener('click', openSettings);
    $('btnPdf').addEventListener('click', downloadPDF);
    $('btnGemini').addEventListener('click', askGemini);
    $('btnBudgetRule').addEventListener('click', openSettings);

    // Submit handlers
    $('btnSubmitIncome').addEventListener('click', submitIncome);
    $('btnSubmitExpense').addEventListener('click', submitExpense);
    $('btnSubmitSaving').addEventListener('click', submitSaving);
    $('btnSubmitAsset').addEventListener('click', submitAsset);
    $('btnSubmitDebt').addEventListener('click', submitDebt);
    $('btnSubmitGoal').addEventListener('click', submitGoal);
    $('btnSubmitDeposit').addEventListener('click', submitGoalDeposit);
    $('btnSubmitSettings').addEventListener('click', submitSettings);

    // Goals
    $('btnAddGoal').addEventListener('click', () => openGoalModal(null));
    $('btnAddGoalEmpty').addEventListener('click', () => openGoalModal(null));

    // Edit transaction modal actions
    $('btnDeleteTx').addEventListener('click', confirmDeleteEditedTx);
    $('btnSaveEditTx').addEventListener('click', saveEditedTx);

    // Subcategory loader
    $('expCat').addEventListener('change', loadSubcat);

    // Custom budget total live calc
    ['customNeeds', 'customWants', 'customInvest'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', updateCustomBudgetTotal);
    });

    // ESC key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  function setupModalDismissal() {
    document.querySelectorAll('.modal-overlay').forEach(ov => {
      ov.addEventListener('click', (e) => {
        if (e.target === ov) ov.classList.remove('open');
      });
    });
  }

  function setupCurrencyMasks() {
    document.querySelectorAll('.currency-mask').forEach(el => applyCurrencyMask(el));
  }

  function switchTxTab(tab) {
    const modal = $('modalOverlay');
    modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    modal.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    const target = modal.querySelector('#tab-' + tab);
    const btn = modal.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (target) target.classList.add('active');
    if (btn) btn.classList.add('active');
  }

  function getActivePill(groupId) {
    const el = document.querySelector('#' + groupId + ' .active');
    return el ? el.dataset.val : '';
  }

  function loadSubcat() {
    const cat = $('expCat').value;
    const sub = $('expSubcat');
    sub.innerHTML = '';
    sub.add(new Option('— Pilih Subkategori —', ''));
    getSubcatsFor(cat).forEach(s => sub.add(new Option(s, s)));
  }

  // ────────────────────────────────────────────────────────────────
  //  FAB
  // ────────────────────────────────────────────────────────────────
  function setupFab() {
    const fab = $('fab');
    const menu = $('fabMenu');
    fab.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('open');
      menu.hidden = !isOpen;
      fab.classList.toggle('open', isOpen);
    });
    menu.querySelectorAll('.fab-item').forEach(it => {
      it.addEventListener('click', () => {
        const action = it.dataset.action;
        menu.classList.remove('open');
        menu.hidden = true;
        fab.classList.remove('open');
        openModal('modalOverlay');
        switchTxTab(action);
      });
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !fab.contains(e.target)) {
        menu.classList.remove('open');
        menu.hidden = true;
        fab.classList.remove('open');
      }
    });
  }

  // ────────────────────────────────────────────────────────────────
  //  SEARCH
  // ────────────────────────────────────────────────────────────────
  function setupSearch() {
    const inp = $('txSearch');
    if (!inp) return;
    inp.addEventListener('input', debounce(() => renderTransactions(state.transactions), 200));
  }

  // ────────────────────────────────────────────────────────────────
  //  ONBOARDING
  // ────────────────────────────────────────────────────────────────
  function setupOnboarding() {
    let step = 1;
    const next = $('btnOnbNext');
    const skip = $('btnOnbSkip');

    function show(n) {
      document.querySelectorAll('.onb-step').forEach(s => s.classList.remove('active'));
      const cur = document.querySelector('.onb-step[data-step="' + n + '"]');
      if (cur) cur.classList.add('active');
      next.textContent = n === 3 ? '🚀 Mulai!' : 'Lanjut →';
    }

    next.addEventListener('click', () => {
      if (step === 3) {
        store.setOnboarded();
        closeModal('onboardingOverlay');
        return;
      }
      step++;
      show(step);
    });
    skip.addEventListener('click', () => {
      store.setOnboarded();
      closeModal('onboardingOverlay');
    });
    show(step);
  }

  // ────────────────────────────────────────────────────────────────
  //  DATA LOADERS
  // ────────────────────────────────────────────────────────────────
  async function loadDashboard() {
    state.isLoading = true;
    if (!state.dashboard) showLoading(true);
    const res = await api.getDashboardData(state.currentMonth, state.currentYear);
    showLoading(false);
    state.isLoading = false;
    if (!res.success) {
      showToast('Gagal memuat data: ' + (res.error || 'unknown'), 'error');
      return;
    }
    store.setDashboard(res);
    store.setCachedDashboard(state.currentMonth, state.currentYear, res);
    renderAll(res);
  }

  async function loadGoals() {
    // optimistic from cache
    const cached = store.getCachedGoals();
    if (cached && cached.length) {
      store.setGoals(cached);
      renderGoals(cached);
    }
    const res = await api.listGoals();
    if (res.success) {
      store.setGoals(res.goals || []);
      renderGoals(res.goals || []);
    }
  }

  async function loadTransactions() {
    const cached = store.getCachedTransactions(state.currentMonth, state.currentYear);
    if (cached && cached.items) {
      store.setTransactions(cached.items);
      renderTransactions(cached.items);
    }
    const res = await api.listRecentTransactions(state.currentMonth, state.currentYear, 100);
    if (res.success) {
      store.setTransactions(res.transactions || []);
      store.setCachedTransactions(state.currentMonth, state.currentYear, res.transactions || []);
      renderTransactions(res.transactions || []);
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  RENDER ALL
  // ────────────────────────────────────────────────────────────────
  function renderAll(d) {
    renderSummary(d.summary);
    renderWallets(d.walletBalances || {});
    renderDailyChart(d.daily);
    renderInsights(d.insights);
    renderTop21(d.top21);
    renderPieChart(d.top10);
    renderMoM(d.catComp);
    renderBudgeting(d.budgeting);
    renderNetWorth(d.netWorth, d.ratios);
    renderForecast(d.forecast, d.sixMonths, d.burn);
    renderSubscriptions(d.subscriptions || [], d.upcomingBills || []);
    renderSixMonths(d.sixMonths);
    updateBudgetRuleLabels(d.budgeting);
    updateWalletPills(d.walletBalances || {});
  }

  // ── Summary ──
  function renderSummary(s) {
    if (!s) return;
    const setCmp = (id, val, prev, inverted) => {
      const el = $(id);
      const p = prev > 0 ? (val - prev) / prev * 100 : (val > 0 ? 100 : 0);
      const isUp = p > 0;
      const isGood = inverted ? !isUp : isUp;
      el.className = 'sc-compare ' + (Math.abs(p) < 0.5 ? 'flat' : isGood ? 'up' : 'down');
      el.textContent = (Math.abs(p) < 0.5 ? '— ' : isUp ? '▲ ' : '▼ ') + Math.abs(p).toFixed(1) + '%';
    };

    $('valIncome').textContent = fmtRp(s.totalInc);
    $('valExpense').textContent = fmtRp(s.totalExp);
    const balEl = $('valBalance');
    balEl.textContent = fmtRp(s.balance);
    balEl.classList.toggle('negative', s.balance < 0);
    $('valSaving').textContent = fmtRp(s.totalSav);
    $('valSavingsRate').textContent = (s.savingsRate || 0).toFixed(1) + '%';
    $('valTx').textContent = s.totalTx;

    setCmp('cmpIncome',  s.totalInc, s.pTotalInc,  false);
    setCmp('cmpExpense', s.totalExp, s.pTotalExp,  true);
    setCmp('cmpBalance', s.balance,  s.pBalance,   false);
    setCmp('cmpSavingsRate', s.savingsRate || 0, s.pSavingsRate || 0, false);
    setCmp('cmpTx',      s.totalTx,  s.pTotalTx,   false);

    $('prevIncome').textContent  = 'vs bulan lalu: ' + fmtRp(s.pTotalInc);
    $('prevExpense').textContent = 'vs bulan lalu: ' + fmtRp(s.pTotalExp);
    $('prevBalance').textContent = 'vs bulan lalu: ' + fmtRp(s.pBalance);
  }

  // ── Wallets widget ──
  function renderWallets(wallets) {
    const grid = $('walletGrid');
    if (!grid) return;
    const entries = Object.entries(wallets).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      grid.innerHTML = '<div class="empty-state">Belum ada transaksi tercatat</div>';
      return;
    }
    grid.innerHTML = entries.map(([name, bal]) => {
      const cls = bal > 0 ? 'positive' : bal < 0 ? 'negative' : 'zero';
      return `
        <div class="wallet-item ${cls}">
          <div class="wallet-item-name">${walletIcon(name)} ${escapeHtml(name)}</div>
          <div class="wallet-item-bal">${fmtRp(bal)}</div>
        </div>
      `;
    }).join('');
  }

  function walletIcon(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('cash')) return '💵';
    if (n.includes('e-wallet') || n.includes('ewallet')) return '📱';
    if (n.includes('investasi') || n.includes('saham') || n.includes('reksa')) return '📈';
    return '🏦';
  }

  function updateWalletPills(wallets) {
    document.querySelectorAll('.source-pill').forEach(pill => {
      const src = pill.dataset.val;
      let base = pill.dataset.label;
      if (!base) {
        // first time, capture original label (text without nominal)
        base = pill.innerHTML;
        pill.dataset.label = base;
      }
      const bal = wallets[src] || 0;
      const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : 'zero';
      pill.innerHTML = base + '<span class="wallet-nominal ' + cls + '">' + fmtRpShort(bal) + '</span>';
    });
  }

  // ── Daily Chart ──
  function renderDailyChart(daily) {
    if (!daily || !daily.length) return;
    const r = charts.renderDaily('dailyChart', daily);
    if (r && r.peakVal > 0) {
      $('peakDay').textContent = 'Tgl ' + (r.peakIdx + 1) + ' — ' + fmtRp(r.peakVal);
    } else {
      $('peakDay').textContent = '—';
    }
  }

  // ── AI Insights ──
  function renderInsights(insights) {
    const el = $('insightList');
    if (!insights || !insights.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💡</div>Tambahkan transaksi untuk analisis</div>';
      return;
    }
    el.innerHTML = insights.map(i => `
      <div class="insight-item ${escapeHtml(i.type || 'info')}">
        <div class="insight-title">${escapeHtml(i.icon || '💡')} ${escapeHtml(i.title || '')}</div>
        <div class="insight-text">${escapeHtml(i.text || '')}</div>
      </div>
    `).join('');
  }

  // ── Top 21 ──
  function renderTop21(top21) {
    const el = $('top21List');
    if (!top21 || !top21.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div>Belum ada pengeluaran</div>';
      return;
    }
    const max = top21[0].amount || 1;
    el.innerHTML = top21.map(item => {
      const pct = (item.amount / max * 100);
      const rankCls = item.rank === 1 ? 'gold' : item.rank === 2 ? 'silver' : item.rank === 3 ? 'bronze' : '';
      const noteHtml = item.note ? `<span class="top21-note">(${escapeHtml(item.note)})</span>` : '';
      return `
        <div class="top21-item">
          <div class="top21-rank ${rankCls}">${item.rank}</div>
          <div class="top21-name" title="${escapeHtml(item.name)} ${escapeHtml(item.note || '')}">
            ${escapeHtml(item.name)}${noteHtml}
          </div>
          <div class="top21-bar-wrap"><div class="top21-bar" style="width:${pct}%"></div></div>
          <div class="top21-amt">${fmtRp(item.amount)}</div>
        </div>
      `;
    }).join('');
  }

  // ── Pie Chart ──
  function renderPieChart(top10) {
    const legend = $('pieLegend');
    const totalEl = $('pieTotal');
    if (!top10 || !top10.length) {
      legend.innerHTML = '<div class="empty-state">Belum ada data</div>';
      totalEl.textContent = '—';
      charts.destroy('pieChart');
      return;
    }
    const total = charts.renderPie('pieChart', top10);
    totalEl.textContent = fmtRpShort(total);
    legend.innerHTML = top10.map((item, i) => `
      <div class="pie-legend-item">
        <div class="pie-dot" style="background:${charts.PIE_COLORS[i]}"></div>
        <div class="pie-legend-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="pie-legend-pct">${(item.amount / total * 100).toFixed(1)}%</div>
        <div class="pie-legend-amt">${fmtRpShort(item.amount)}</div>
      </div>
    `).join('');
  }

  // ── MoM ──
  function renderMoM(catComp) {
    const tbody = $('momTableBody');
    if (!catComp || !catComp.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">Belum ada data</td></tr>';
      return;
    }
    tbody.innerHTML = catComp.map(row => {
      const up = row.pct > 0;
      const arrow = Math.abs(row.pct) < 0.5 ? '—' : up ? '▲' : '▼';
      const cls = Math.abs(row.pct) < 0.5 ? 'flat' : up ? 'up' : 'down';
      return `
        <tr>
          <td><div class="mom-cat">${escapeHtml(row.category)}</div></td>
          <td><div class="mom-val">${fmtRp(row.current)}</div></td>
          <td><div class="mom-val muted">${fmtRp(row.previous)}</div></td>
          <td class="ta-right"><span class="mom-pct ${cls}">${arrow} ${Math.abs(row.pct).toFixed(1)}%</span></td>
        </tr>
      `;
    }).join('');
  }

  // ── Budgeting ──
  function renderBudgeting(b) {
    if (!b) return;
    const income = b.income || 0;
    const targets = b.targets || { needs: income * 0.5, wants: income * 0.3, invest: income * 0.2 };

    const drawCard = (canvasId, actual, budget, pctId, isExpense) => {
      const color = charts.renderGauge(canvasId, actual, budget, isExpense);
      const realPct = income > 0 ? (actual / income * 100).toFixed(1) : '0.0';
      const pctEl = $(pctId);
      pctEl.textContent = realPct + '%';
      pctEl.style.color = color || '';
    };

    drawCard('needsDonut', b.needs, targets.needs, 'needsPct', true);
    drawCard('wantsDonut', b.wants, targets.wants, 'wantsPct', true);
    drawCard('investDonut', b.invest, targets.invest, 'investPct', false);

    const setStats = (actualId, budgetId, diffId, diffLblId, actual, budget, isExpense) => {
      $(actualId).textContent = fmtRp(actual);
      $(budgetId).textContent = fmtRp(budget);
      const diff = budget - actual;
      const diffEl = $(diffId);
      diffEl.textContent = fmtRp(Math.abs(diff));
      if (isExpense) {
        diffEl.className = 'bstat-val ' + (diff >= 0 ? 'good' : 'bad');
        $(diffLblId).textContent = diff >= 0 ? '✅ Sisa Anggaran' : '🔴 Over Budget';
      } else {
        diffEl.className = 'bstat-val ' + (diff >= 0 ? 'info' : 'good');
        $(diffLblId).textContent = diff >= 0 ? 'Kurang dari Target' : '⭐ Melampaui Target';
      }
    };

    setStats('needsActual', 'needsBudget', 'needsDiff', 'needsDiffLbl', b.needs, targets.needs, true);
    setStats('wantsActual', 'wantsBudget', 'wantsDiff', 'wantsDiffLbl', b.wants, targets.wants, true);
    setStats('investActual', 'investBudget', 'investDiff', 'investDiffLbl', b.invest, targets.invest, false);
  }

  function updateBudgetRuleLabels(b) {
    if (!b) return;
    const rule = b.rule || '50/30/20';
    $('budgetRuleLbl').textContent = rule;
    const t = b.targets || {};
    const total = (t.needs || 0) + (t.wants || 0) + (t.invest || 0);
    if (total > 0) {
      const np = (t.needs / total * 100).toFixed(0);
      const wp = (t.wants / total * 100).toFixed(0);
      const ip = (t.invest / total * 100).toFixed(0);
      $('needsBadge').textContent = 'Target ' + np + '%';
      $('wantsBadge').textContent = 'Target ' + wp + '%';
      $('investBadge').textContent = 'Target ' + ip + '%';
    }
  }

  // ── Net Worth & Ratios ──
  function renderNetWorth(nw, rt) {
    if (!nw) return;
    $('nwAssets').textContent = fmtRp(nw.totalAssets);
    $('nwLiquid').textContent = fmtRp(nw.liquidAssets || 0);
    $('nwDebts').textContent = fmtRp(nw.totalDebts);
    const nwEl = $('nwNet');
    nwEl.textContent = (nw.netWorth < 0 ? '-' : '') + fmtRp(Math.abs(nw.netWorth));
    nwEl.style.color = nw.netWorth < 0 ? 'var(--red)' : 'var(--accent)';

    // sparkline
    if (nw.netWorthHistory && nw.netWorthHistory.length) {
      charts.renderSparkline('nwSparkline', nw.netWorthHistory, '#00e5b4');
    }

    // Ratios
    setRatio('ratioSavings', 'ratioSavingsStatus', rt.savingsRate, '%', [
      { test: v => v >= 20, label: 'Sehat', cls: 'status-safe' },
      { test: v => v >= 10, label: 'Cukup', cls: 'status-warn' },
      { test: () => true, label: 'Rendah', cls: 'status-danger' }
    ]);
    setRatio('dsrVal', 'dsrStatus', rt.dsr, '%', [
      { test: v => v <= 30, label: 'Aman', cls: 'status-safe' },
      { test: v => v <= 40, label: 'Waspada', cls: 'status-warn' },
      { test: () => true, label: 'Bahaya', cls: 'status-danger' }
    ]);
    setRatio('efVal', 'efStatus', rt.emergencyFundRatio, '×', [
      { test: v => v >= 6, label: 'Sangat Kuat', cls: 'status-safe' },
      { test: v => v >= 3, label: 'Cukup', cls: 'status-warn' },
      { test: () => true, label: 'Rentan', cls: 'status-danger' }
    ]);
    setRatio('solvencyVal', 'solvencyStatus', rt.solvencyRatio * 100, '%', [
      { test: v => v >= 50, label: 'Sehat', cls: 'status-safe' },
      { test: v => v >= 25, label: 'Waspada', cls: 'status-warn' },
      { test: () => true, label: 'Leverage Tinggi', cls: 'status-danger' }
    ]);
    setRatio('investRatioVal', 'investRatioStatus', rt.investmentAssetRatio * 100, '%', [
      { test: v => v >= 30, label: 'Diversifikasi Baik', cls: 'status-safe' },
      { test: v => v >= 10, label: 'Mulai Membangun', cls: 'status-warn' },
      { test: () => true, label: 'Belum Diversifikasi', cls: 'status-danger' }
    ]);
    setRatio('liquidVal', 'liquidStatus', rt.liquidityRatio, '×', [
      { test: v => v >= 3, label: 'Likuid', cls: 'status-safe' },
      { test: v => v >= 1, label: 'Cukup', cls: 'status-warn' },
      { test: () => true, label: 'Kurang Likuid', cls: 'status-danger' }
    ]);

    renderWealthList('asset', nw.assetDetails, 'assetTableList');
    renderWealthList('debt', nw.debtDetails, 'debtTableList');

    // Allocation
    const allocTotal = charts.renderAllocation('allocChart', nw.assetAllocation || []);
    $('allocTotal').textContent = allocTotal != null ? fmtRpShort(allocTotal) : '—';
    const legend = $('allocLegend');
    if (nw.assetAllocation && nw.assetAllocation.length) {
      legend.innerHTML = nw.assetAllocation.map(a => {
        const pct = allocTotal ? (a.value / allocTotal * 100).toFixed(1) : 0;
        return `<div class="pie-legend-item">
          <div class="pie-dot" style="background:${a.color}"></div>
          <div class="pie-legend-name">${escapeHtml(a.label)}</div>
          <div class="pie-legend-pct">${pct}%</div>
          <div class="pie-legend-amt">${fmtRpShort(a.value)}</div>
        </div>`;
      }).join('');
    } else {
      legend.innerHTML = '<div class="empty-state">Belum ada aset</div>';
    }
  }

  function setRatio(valId, statusId, val, suffix, rules) {
    const v = val || 0;
    $(valId).textContent = (suffix === '×' ? v.toFixed(1) : v.toFixed(1)) + suffix;
    const r = rules.find(rl => rl.test(v));
    const st = $(statusId);
    st.textContent = r.label;
    st.className = 'ratio-status ' + r.cls;
  }

  function renderWealthList(type, list, containerId) {
    const c = $(containerId);
    if (!list || !list.length) {
      c.innerHTML = '<div class="empty-state">Belum ada data</div>';
      return;
    }
    c.innerHTML = list.map(item => `
      <div class="wealth-row">
        <div>
          <div class="wealth-row-name">${escapeHtml(item.name)}</div>
          <div class="wealth-row-inst">${escapeHtml(item.inst)} · ${escapeHtml(item.type)}</div>
        </div>
        <div style="text-align:right;">
          <div class="wealth-row-val">${fmtRp(item.value)}</div>
          <div class="wealth-row-actions">
            <button class="icon-btn" data-wealth-del="${type}|${item.rowIndex}" aria-label="Hapus">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
    // attach handlers
    c.querySelectorAll('[data-wealth-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [t, ri] = btn.dataset.wealthDel.split('|');
        if (!confirm('Hapus data ini secara permanen?')) return;
        showToast('Menghapus…', 'info');
        const res = await api.deleteWealthItem(t, parseInt(ri, 10));
        if (res.success) {
          showToast(res.msg || 'Terhapus', 'success');
          store.invalidateAllCache();
          loadDashboard();
        } else {
          showToast('Gagal: ' + (res.error || 'unknown'), 'error');
        }
      });
    });
  }

  // ── Forecast ──
  function renderForecast(forecast, sixMonths, burn) {
    if (!forecast || !forecast.months) return;
    charts.renderForecast('forecastChart', sixMonths, forecast.months);
    $('forecastMeta').innerHTML = `
      <div class="fc-stat">
        <div class="fc-stat-lbl">Rata-rata Pemasukan</div>
        <div class="fc-stat-val" style="color:var(--green)">${fmtRpShort(forecast.avgIncome)}</div>
      </div>
      <div class="fc-stat">
        <div class="fc-stat-lbl">Rata-rata Pengeluaran</div>
        <div class="fc-stat-val" style="color:var(--red)">${fmtRpShort(forecast.avgExpense)}</div>
      </div>
      <div class="fc-stat">
        <div class="fc-stat-lbl">Rata-rata Tabungan</div>
        <div class="fc-stat-val" style="color:var(--indigo)">${fmtRpShort(forecast.avgSaving)}</div>
      </div>
    `;

    // Runway
    const days = burn && burn.runwayDays != null ? burn.runwayDays : null;
    const runwayEl = $('runwayDays');
    const subEl = $('runwaySub');
    const banner = $('runwayBanner');
    runwayEl.classList.remove('warn', 'danger');
    banner.className = 'runway-banner';

    if (days == null) {
      runwayEl.textContent = '∞';
      subEl.textContent = 'income > pengeluaran';
      banner.classList.add('safe');
      banner.textContent = '✅ Cashflow surplus — kekayaan tumbuh terus.';
    } else if (days < 30) {
      runwayEl.textContent = days;
      runwayEl.classList.add('danger');
      subEl.textContent = 'hari (kritis)';
      banner.classList.add('danger');
      banner.textContent = `⚠️ Aset likuid hanya cukup ${days} hari jika income stop. Bangun dana darurat segera!`;
    } else if (days < 90) {
      runwayEl.textContent = days;
      runwayEl.classList.add('warn');
      subEl.textContent = 'hari';
      banner.classList.add('warn');
      banner.textContent = `Cukup untuk ${days} hari. Target: minimal 90 hari (3 bulan).`;
    } else {
      runwayEl.textContent = days >= 365 ? Math.floor(days / 30) + ' bln+' : days;
      subEl.textContent = days >= 365 ? 'aset likuid solid' : 'hari';
      banner.classList.add('safe');
      banner.textContent = `✅ Ketahanan dana kuat (${Math.floor(days / 30)} bulan).`;
    }

    if (burn) {
      $('burnRate').textContent = fmtRpShort(burn.dailyExpense);
      $('incomeRate').textContent = fmtRpShort(burn.dailyIncome);
    }
  }

  // ── Subscriptions & Upcoming ──
  function renderSubscriptions(subs, upcoming) {
    const upEl = $('upcomingList');
    if (!upcoming.length) {
      upEl.innerHTML = '<div class="empty-state">✅ Tidak ada tagihan dekat</div>';
    } else {
      upEl.innerHTML = upcoming.map(b => {
        const urg = b.daysLeft <= 1;
        return `
          <div class="upcoming-row ${urg ? 'urgent' : ''}">
            <div>
              <div class="upcoming-row-name">${escapeHtml(b.name)}</div>
              <div class="upcoming-row-meta">Jatuh tempo: ${escapeHtml(b.nextDateLabel || b.date || '')}</div>
            </div>
            <div>
              <div class="upcoming-row-amt">${fmtRpShort(b.amount || b.lastAmount)}</div>
              <div class="sub-row-amt-sub">${b.daysLeft <= 0 ? 'HARI INI!' : b.daysLeft + ' hari lagi'}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    const subEl = $('subList');
    if (!subs.length) {
      subEl.innerHTML = '<div class="empty-state">Belum ada langganan rutin</div>';
      return;
    }
    subEl.innerHTML = subs.slice(0, 12).map(s => `
      <div class="sub-row">
        <div>
          <div class="sub-row-name">${escapeHtml(s.name)}</div>
          <div class="sub-row-meta">${s.monthCount}× berturut · ${escapeHtml(s.category || '')}</div>
        </div>
        <div>
          <div class="sub-row-amt">${fmtRpShort(s.avgAmount)}</div>
          <div class="sub-row-amt-sub">${s.paidThisMonth ? '✓ dibayar' : 'akan datang'}</div>
        </div>
      </div>
    `).join('');
  }

  // ── 6 months ──
  function renderSixMonths(sixMonths) {
    const tb = $('sixMonthsBody');
    if (!sixMonths || !sixMonths.length) {
      tb.innerHTML = '<tr><td colspan="8" class="empty-cell">Belum ada data</td></tr>';
      return;
    }
    const maxInc = Math.max.apply(null, sixMonths.map(r => r.income).concat([1]));
    const maxExp = Math.max.apply(null, sixMonths.map(r => r.expenses).concat([1]));
    tb.innerHTML = sixMonths.map((row, i) => {
      const isLast = i === sixMonths.length - 1;
      const balCls = row.balance < 0 ? 'ht-balance neg' : 'ht-balance';
      return `
        <tr class="${isLast ? 'ht-current' : ''}" data-month="${row.month}" data-year="${row.year}">
          <td><span class="ht-month">${isLast ? '⭐ ' : ''}${escapeHtml(row.label)}</span></td>
          <td><span class="ht-income">${fmtRp(row.income)}</span></td>
          <td><span class="ht-expense">${fmtRp(row.expenses)}</span></td>
          <td><span class="ht-saving">${fmtRp(row.savings)}</span></td>
          <td><span class="${balCls}">${fmtRp(row.balance)}</span></td>
          <td><span class="ht-sr">${(row.savingsRate || 0).toFixed(1)}%</span></td>
          <td><span class="ht-tx">${row.tx}</span></td>
          <td>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div class="ht-bar-wrap"><div class="ht-bar-fill" style="width:${row.income/maxInc*100}%;background:var(--green);"></div></div>
              <div class="ht-bar-wrap"><div class="ht-bar-fill" style="width:${row.expenses/maxExp*100}%;background:var(--red);"></div></div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    // click to drill down
    tb.querySelectorAll('tr[data-month]').forEach(tr => {
      tr.addEventListener('click', () => {
        const m = parseInt(tr.dataset.month, 10);
        const y = parseInt(tr.dataset.year, 10);
        store.setMonthYear(m, y);
        $('monthSel').value = String(m);
        $('yearSel').value = String(y);
        refresh();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ────────────────────────────────────────────────────────────────
  //  TRANSACTIONS LIST
  // ────────────────────────────────────────────────────────────────
  function renderTransactions(items) {
    const tb = $('txTableBody');
    const q = ($('txSearch') && $('txSearch').value || '').toLowerCase();
    let filtered = items || [];
    if (q) {
      filtered = filtered.filter(t => {
        return (
          (t.notes || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q) ||
          (t.subcategory || '').toLowerCase().includes(q) ||
          (t.type || '').toLowerCase().includes(q) ||
          (t.source || '').toLowerCase().includes(q)
        );
      });
    }
    if (!filtered.length) {
      tb.innerHTML = '<tr><td colspan="6" class="empty-cell">' + (q ? 'Tidak ada hasil' : 'Belum ada transaksi bulan ini') + '</td></tr>';
      return;
    }
    tb.innerHTML = filtered.map(t => {
      const desc = t.kind === 'expense'
        ? escapeHtml(t.subcategory || t.category) + (t.notes ? ' <span class="muted">· ' + escapeHtml(t.notes) + '</span>' : '')
        : escapeHtml(t.type || '') + (t.notes ? ' <span class="muted">· ' + escapeHtml(t.notes) + '</span>' : '');
      const sign = t.kind === 'income' ? '+' : t.kind === 'expense' ? '-' : '→';
      return `
        <tr data-edit="${t.kind}|${t.rowIndex}">
          <td>${fmtDateShort(t.date)}</td>
          <td><span class="tx-kind ${t.kind}">${t.kind === 'income' ? 'Pemasukan' : t.kind === 'expense' ? 'Pengeluaran' : 'Tabungan'}</span></td>
          <td>${desc}</td>
          <td>${escapeHtml(t.source || '')}</td>
          <td class="ta-right"><span class="tx-amt ${t.kind}">${sign} ${fmtRp(t.amount)}</span></td>
          <td class="ta-right"><button class="icon-btn" aria-label="Edit">✏️</button></td>
        </tr>
      `;
    }).join('');
    tb.querySelectorAll('tr[data-edit]').forEach(tr => {
      tr.addEventListener('click', () => {
        const [kind, ri] = tr.dataset.edit.split('|');
        openEditTxModal(kind, parseInt(ri, 10));
      });
    });
  }

  function openEditTxModal(kind, rowIndex) {
    const tx = state.transactions.find(t => t.kind === kind && t.rowIndex === rowIndex);
    if (!tx) return;
    $('editKind').value = kind;
    $('editRowIndex').value = rowIndex;
    $('editTxModalTitle').textContent = '✏️ Edit ' + (kind === 'income' ? 'Pemasukan' : kind === 'expense' ? 'Pengeluaran' : 'Tabungan');
    const wrap = $('editFields');
    wrap.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="edDate">Tanggal</label>
          <input type="date" class="form-input" id="edDate" value="${escapeHtml(tx.date || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="edAmount">Jumlah</label>
          <div class="amount-input-wrap">
            <span class="amount-prefix">Rp</span>
            <input type="text" inputmode="numeric" class="form-input currency-mask" id="edAmount" value="${(tx.amount || 0).toLocaleString('id-ID')}" />
          </div>
        </div>
      </div>
      ${kind === 'expense' ? `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="edCat">Kategori</label>
            <input type="text" class="form-input" id="edCat" value="${escapeHtml(tx.category || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="edSubcat">Subkategori</label>
            <input type="text" class="form-input" id="edSubcat" value="${escapeHtml(tx.subcategory || '')}" />
          </div>
        </div>
      ` : `
        <div class="form-row single mb-14">
          <div class="form-group">
            <label class="form-label" for="edType">Jenis</label>
            <input type="text" class="form-input" id="edType" value="${escapeHtml(tx.type || '')}" />
          </div>
        </div>
      `}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="edNotes">Catatan</label>
          <input type="text" class="form-input" id="edNotes" value="${escapeHtml(tx.notes || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="edSource">Sumber</label>
          <input type="text" class="form-input" id="edSource" value="${escapeHtml(tx.source || '')}" />
        </div>
      </div>
    `;
    setupCurrencyMasks();
    openModal('editTxModalOverlay');
  }

  async function saveEditedTx() {
    const kind = $('editKind').value;
    const rowIndex = parseInt($('editRowIndex').value, 10);
    const fields = {
      date: $('edDate').value,
      amount: parseRp($('edAmount').value),
      notes: $('edNotes').value,
      source: $('edSource').value
    };
    if (kind === 'expense') {
      fields.category = $('edCat').value;
      fields.subcategory = $('edSubcat').value;
    } else {
      fields.type = $('edType').value;
    }
    showToast('Menyimpan…', 'info');
    const res = await api.editTransaction(kind, rowIndex, fields);
    if (res.success) {
      showToast(res.msg || 'Tersimpan', 'success');
      closeModal('editTxModalOverlay');
      store.invalidateAllCache();
      loadDashboard();
      loadTransactions();
    } else {
      showToast('Gagal: ' + (res.error || 'unknown'), 'error');
    }
  }

  async function confirmDeleteEditedTx() {
    if (!confirm('Hapus transaksi ini secara permanen?')) return;
    const kind = $('editKind').value;
    const rowIndex = parseInt($('editRowIndex').value, 10);
    const res = await api.deleteTransaction(kind, rowIndex);
    if (res.success) {
      showToast(res.msg || 'Terhapus', 'success');
      closeModal('editTxModalOverlay');
      store.invalidateAllCache();
      loadDashboard();
      loadTransactions();
    } else {
      showToast('Gagal: ' + (res.error || 'unknown'), 'error');
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  GOALS
  // ────────────────────────────────────────────────────────────────
  function renderGoals(goals) {
    const grid = $('goalsGrid');
    if (!goals || !goals.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎯</div>
          Belum ada tujuan keuangan
          <div class="empty-cta">
            <button class="btn btn-primary btn-sm" id="btnAddGoalEmpty2">+ Buat Tujuan Pertama</button>
          </div>
        </div>
      `;
      const btn = document.getElementById('btnAddGoalEmpty2');
      if (btn) btn.addEventListener('click', () => openGoalModal(null));
      return;
    }
    grid.innerHTML = goals.map(g => {
      const pct = g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0;
      const remaining = Math.max(0, g.target - g.saved);
      const dleft = g.deadline ? daysFromToday(g.deadline) : null;
      const monthsLeft = dleft != null ? Math.max(0, Math.round(dleft / 30)) : null;
      const monthlyNeed = monthsLeft && monthsLeft > 0 ? remaining / monthsLeft : remaining;
      const done = pct >= 100;
      return `
        <div class="goal-card" data-goal="${g.rowIndex}">
          <div class="goal-head">
            <div>
              <div class="goal-name">${escapeHtml(g.name)}</div>
              ${g.deadline ? `<div class="muted micro-label">Deadline: ${fmtDateLong(g.deadline)}${dleft != null ? ' · ' + (dleft >= 0 ? dleft + ' hari lagi' : Math.abs(dleft) + ' hari lewat') : ''}</div>` : ''}
            </div>
            <span class="goal-cat-badge">${escapeHtml(g.category || 'Umum')}</span>
          </div>
          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="goal-numbers">
            <span class="saved">${fmtRpShort(g.saved)}</span>
            <span class="goal-pct ${done ? 'done' : ''}">${pct.toFixed(0)}%</span>
            <span class="target">/ ${fmtRpShort(g.target)}</span>
          </div>
          <div class="goal-meta">
            <div>${monthsLeft != null && !done ? '~' + fmtRpShort(monthlyNeed) + '/bulan' : (done ? '🏆 Tercapai!' : 'Tanpa deadline')}</div>
            <div class="goal-actions">
              ${done ? '' : `<button class="goal-deposit-btn" data-goal-deposit="${g.rowIndex}" aria-label="Tambah Setoran">+ Setor</button>`}
              <button class="icon-btn" data-goal-edit="${g.rowIndex}" aria-label="Edit">✏️</button>
              <button class="icon-btn" data-goal-del="${g.rowIndex}" aria-label="Hapus">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    grid.querySelectorAll('[data-goal-edit]').forEach(b => {
      b.addEventListener('click', e => { e.stopPropagation(); openGoalModal(parseInt(b.dataset.goalEdit, 10)); });
    });
    grid.querySelectorAll('[data-goal-deposit]').forEach(b => {
      b.addEventListener('click', e => { e.stopPropagation(); openGoalDepositModal(parseInt(b.dataset.goalDeposit, 10)); });
    });
    grid.querySelectorAll('[data-goal-del]').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Hapus tujuan ini?')) return;
        const res = await api.deleteGoal(parseInt(b.dataset.goalDel, 10));
        if (res.success) { showToast(res.msg, 'success'); loadGoals(); }
        else showToast('Gagal: ' + res.error, 'error');
      });
    });
  }

  function openGoalModal(rowIndex) {
    $('goalRowIndex').value = rowIndex || '';
    if (rowIndex) {
      const g = state.goals.find(x => x.rowIndex === rowIndex);
      if (g) {
        $('goalName').value = g.name || '';
        $('goalTarget').value = (g.target || 0).toLocaleString('id-ID');
        $('goalSaved').value = (g.saved || 0).toLocaleString('id-ID');
        $('goalDeadline').value = g.deadline || '';
        $('goalCategory').value = g.category || 'Lainnya';
        $('goalNotes').value = g.notes || '';
        $('goalModalTitle').textContent = '✏️ Edit Tujuan';
      }
    } else {
      $('goalName').value = '';
      $('goalTarget').value = '';
      $('goalSaved').value = '';
      $('goalDeadline').value = '';
      $('goalCategory').value = 'Dana Darurat';
      $('goalNotes').value = '';
      $('goalModalTitle').textContent = '🎯 Tujuan Baru';
    }
    openModal('goalModalOverlay');
  }

  async function submitGoal() {
    const data = {
      name: $('goalName').value.trim(),
      target: parseRp($('goalTarget').value),
      saved: parseRp($('goalSaved').value),
      deadline: $('goalDeadline').value,
      category: $('goalCategory').value,
      notes: $('goalNotes').value.trim()
    };
    if (!data.name || data.target <= 0) {
      showToast('Lengkapi nama & target!', 'error');
      return;
    }
    const rowIndex = $('goalRowIndex').value;
    const res = rowIndex
      ? await api.updateGoal(Object.assign({ rowIndex: parseInt(rowIndex, 10) }, data))
      : await api.addGoal(data);
    if (res.success) {
      showToast(res.msg, 'success');
      closeModal('goalModalOverlay');
      loadGoals();
    } else {
      showToast('Gagal: ' + res.error, 'error');
    }
  }

  // ── Goal Deposit (tambah setoran ke goal) ──
  function openGoalDepositModal(rowIndex) {
    const g = state.goals.find(x => x.rowIndex === rowIndex);
    if (!g) {
      showToast('Tujuan tidak ditemukan', 'error');
      return;
    }
    $('depositGoalRow').value = String(rowIndex);
    $('depositGoalName').textContent = g.name || 'Tujuan';
    const pct = g.target > 0 ? (g.saved / g.target * 100).toFixed(1) : '0';
    const remaining = Math.max(0, g.target - g.saved);
    $('depositGoalProgress').innerHTML =
      `Saat ini: <b>${fmtRp(g.saved)}</b> / ${fmtRp(g.target)} (${pct}%) · Sisa: <b>${fmtRp(remaining)}</b>`;
    $('depositAmount').value = '';
    setupCurrencyMasks();
    openModal('goalDepositModalOverlay');
    setTimeout(() => $('depositAmount').focus(), 200);
  }

  async function submitGoalDeposit() {
    const rowIndex = parseInt($('depositGoalRow').value, 10);
    const amount = parseRp($('depositAmount').value);
    if (!rowIndex || amount <= 0) {
      showToast('Masukkan nominal setoran!', 'error');
      return;
    }
    await submitWithGuard(async () => {
      const res = await api.addGoalDeposit(rowIndex, amount);
      if (res.success) {
        showToast(res.msg || 'Setoran tersimpan', 'success');
        closeModal('goalDepositModalOverlay');
        loadGoals();
      } else {
        showToast('Gagal: ' + (res.error || 'unknown'), 'error');
      }
    }, 'btnSubmitDeposit', 'Menyimpan…');
  }

  // ────────────────────────────────────────────────────────────────
  //  SETTINGS
  // ────────────────────────────────────────────────────────────────
  async function openSettings() {
    const settings = state.settings;
    document.querySelectorAll('#budgetRulePills .type-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.val === settings.budgetRule);
    });
    $('customNeeds').value = settings.customBudget.needs;
    $('customWants').value = settings.customBudget.wants;
    $('customInvest').value = settings.customBudget.invest;
    $('customBudgetWrap').hidden = settings.budgetRule !== 'Custom';
    updateCustomBudgetTotal();
    openModal('settingsModalOverlay');

    // pull latest from server (non-blocking)
    const res = await api.getSettings();
    if (res.success) {
      Object.assign(state.settings, res.settings);
      store.saveSettings(res.settings);
    }
  }

  function updateCustomBudgetTotal() {
    const n = parseInt($('customNeeds').value, 10) || 0;
    const w = parseInt($('customWants').value, 10) || 0;
    const i = parseInt($('customInvest').value, 10) || 0;
    const total = n + w + i;
    const el = $('customBudgetSum');
    el.textContent = 'Total: ' + total + '%';
    el.style.color = total === 100 ? 'var(--green)' : 'var(--amber)';
  }

  async function submitSettings() {
    const rule = getActivePill('budgetRulePills') || '50/30/20';
    const data = { budgetRule: rule };
    if (rule === 'Custom') {
      const c = {
        needs: parseInt($('customNeeds').value, 10) || 0,
        wants: parseInt($('customWants').value, 10) || 0,
        invest: parseInt($('customInvest').value, 10) || 0
      };
      if (c.needs + c.wants + c.invest !== 100) {
        showToast('Total custom budget harus 100%', 'error');
        return;
      }
      data.customBudget = c;
    }
    const res = await api.saveSettings(data);
    if (res.success) {
      store.saveSettings(data);
      showToast(res.msg, 'success');
      closeModal('settingsModalOverlay');
      store.invalidateAllCache();
      loadDashboard();
    } else {
      showToast('Gagal: ' + res.error, 'error');
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  SUBMIT TRANSACTIONS
  // ────────────────────────────────────────────────────────────────
  async function submitWithGuard(fn, btnId, text) {
    const btn = $(btnId);
    if (btn) { btn.disabled = true; btn._oldText = btn.innerHTML; btn.innerHTML = '⏳ ' + (text || 'Memproses…'); }
    try { return await fn(); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = btn._oldText; } }
  }

  async function submitIncome() {
    const data = {
      type: getActivePill('incomePills') || 'Gaji / Salary',
      date: $('incomeDate').value,
      amount: parseRp($('incomeAmount').value),
      notes: $('incomeNotes').value,
      source: getActivePill('incomeSourcePills') || 'Cash'
    };
    if (!data.date || data.amount <= 0) return showToast('Lengkapi tanggal & jumlah!', 'error');
    await submitWithGuard(async () => {
      const res = await api.addIncome(data);
      handleSubmitResult(res);
    }, 'btnSubmitIncome');
  }

  async function submitExpense() {
    const cat = $('expCat').value;
    const data = {
      category: cat,
      subcategory: $('expSubcat').value,
      date: $('expDate').value,
      amount: parseRp($('expAmount').value),
      notes: $('expNotes').value,
      source: getActivePill('expSourcePills') || 'Cash'
    };
    if (!cat || !data.date || data.amount <= 0) return showToast('Lengkapi kategori, tanggal & jumlah!', 'error');
    const bal = state.wallets[data.source] || 0;
    if (data.amount > bal) {
      if (!confirm(`⚠️ Saldo ${data.source} hanya ${fmtRp(bal)} (kurang ${fmtRp(data.amount - bal)}). Tetap simpan?`)) return;
    }
    await submitWithGuard(async () => {
      const res = await api.addExpense(data);
      handleSubmitResult(res);
    }, 'btnSubmitExpense');
  }

  async function submitSaving() {
    const data = {
      type: getActivePill('savingPills') || 'Tabungan Rutin',
      date: $('savDate').value,
      amount: parseRp($('savAmount').value),
      notes: $('savNotes').value,
      source: getActivePill('savSourcePills') || 'BRI'
    };
    if (!data.date || data.amount <= 0) return showToast('Lengkapi tanggal & jumlah!', 'error');
    const bal = state.wallets[data.source] || 0;
    if (data.amount > bal) {
      if (!confirm(`⚠️ Saldo ${data.source} hanya ${fmtRp(bal)}. Tetap simpan?`)) return;
    }
    await submitWithGuard(async () => {
      const res = await api.addSaving(data);
      handleSubmitResult(res);
    }, 'btnSubmitSaving');
  }

  async function submitAsset() {
    const data = {
      type: $('assetType').value,
      name: $('assetName').value.trim(),
      value: parseRp($('assetValue').value),
      inst: $('assetInst').value.trim()
    };
    if (!data.name || data.value <= 0) return showToast('Lengkapi nama & nilai aset!', 'error');
    await submitWithGuard(async () => {
      const res = await api.addAsset(data);
      handleSubmitResult(res, 'wealthModalOverlay');
    }, 'btnSubmitAsset');
  }

  async function submitDebt() {
    const data = {
      type: $('debtType').value,
      name: $('debtName').value.trim(),
      value: parseRp($('debtValue').value),
      inst: $('debtInst').value.trim()
    };
    if (!data.name || data.value <= 0) return showToast('Lengkapi nama & nilai hutang!', 'error');
    await submitWithGuard(async () => {
      const res = await api.addDebt(data);
      handleSubmitResult(res, 'wealthModalOverlay');
    }, 'btnSubmitDebt');
  }

  function handleSubmitResult(res, modalId) {
    if (res.success) {
      showToast(res.msg || 'Berhasil!', 'success');
      clearForms();
      closeModal(modalId || 'modalOverlay');
      store.invalidateAllCache();
      loadDashboard();
      loadTransactions();
    } else {
      showToast('Gagal: ' + (res.error || 'unknown'), 'error');
    }
  }

  function clearForms() {
    ['incomeAmount', 'incomeNotes', 'expAmount', 'expNotes', 'savAmount', 'savNotes',
     'assetName', 'assetValue', 'assetInst', 'debtName', 'debtValue', 'debtInst'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    setDefaultDates();
  }

  // ────────────────────────────────────────────────────────────────
  //  PDF DOWNLOAD
  // ────────────────────────────────────────────────────────────────
  async function downloadPDF() {
    showToast('Menyiapkan laporan PDF…', 'info');
    const res = await api.generatePDFReport(state.currentMonth, state.currentYear);
    if (!res.success) {
      showToast('Gagal: ' + (res.error || 'unknown'), 'error');
      return;
    }
    // base64 → Blob → download
    try {
      const byteChars = atob(res.base64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('PDF berhasil diunduh!', 'success');
    } catch (e) {
      showToast('Gagal mengunduh: ' + e.message, 'error');
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  GEMINI
  // ────────────────────────────────────────────────────────────────
  async function askGemini() {
    const d = state.dashboard;
    if (!d) return showToast('Data belum siap', 'error');
    const btn = $('btnGemini');
    const out = $('geminiOutput');
    btn.disabled = true;
    btn.innerHTML = '⌛ Sedang berpikir…';
    out.hidden = false;
    out.innerHTML = '<div class="muted">Menganalisis data finansial Anda secara mendalam…</div>';

    const summary = buildGeminiPayload(d);
    const res = await api.getGeminiDeepAnalysis(summary);
    btn.disabled = false;
    btn.innerHTML = '🧠 Analisis Ulang';
    if (res.success) {
      out.innerHTML = mdToHtml(res.text);
    } else {
      out.innerHTML = '<div style="color:var(--red)">' + escapeHtml(res.error || 'Tidak ada respons') + '</div>';
    }
  }

  /**
   * Bangun payload kaya untuk Gemini prompt.
   * Sumber data: state.dashboard, state.goals, state.currentMonth/Year.
   */
  function buildGeminiPayload(d) {
    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const m = state.currentMonth, y = state.currentYear;
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;

    // ── Bulan data tersedia (untuk validasi disclaimer) ──
    const monthsOfData = (d.sixMonths || []).filter(s => (s.income > 0 || s.expenses > 0)).length || 1;

    // ── Budget rule label & target % ──
    const ruleLabel = (d.budgeting && d.budgeting.rule) || '50/30/20';
    const ruleParts = parseRuleLabel(ruleLabel, state.settings.customBudget);

    // ── Persentase aktual ──
    const inc = d.budgeting && d.budgeting.income > 0 ? d.budgeting.income : 0;
    const pNeeds = inc > 0 ? (d.budgeting.needs / inc * 100).toFixed(1) : '0.0';
    const pWants = inc > 0 ? (d.budgeting.wants / inc * 100).toFixed(1) : '0.0';
    const pInvest = inc > 0 ? (d.budgeting.invest / inc * 100).toFixed(1) : '0.0';

    // ── Net Worth trend (banding bulan ini vs sebelum) ──
    const nwHist = (d.netWorth && d.netWorth.netWorthHistory) || [];
    let nwTrend = 'tren belum tersedia';
    if (nwHist.length >= 2) {
      const cur = nwHist[nwHist.length - 1].value;
      const prev = nwHist[nwHist.length - 2].value;
      if (prev !== 0) {
        const diffPct = ((cur - prev) / Math.abs(prev) * 100);
        const arrow = diffPct > 0.5 ? 'naik' : diffPct < -0.5 ? 'turun' : 'stabil';
        nwTrend = arrow === 'stabil'
          ? 'stabil dibanding bulan lalu'
          : `${arrow} ${Math.abs(diffPct).toFixed(1)}% dibanding bulan lalu`;
      }
    }

    // ── Top 3 expense kategori ──
    const totalExp = d.summary && d.summary.totalExp > 0 ? d.summary.totalExp : 1;
    const topExpenses = ((d.top10 || []).slice(0, 3)).map(t => ({
      name: t.name,
      amount: fmtRp(t.amount),
      pct: (t.amount / totalExp * 100).toFixed(1)
    }));

    // ── Kategori naik tajam (MoM) ──
    let biggestMoMRise = 'tidak ada kenaikan signifikan';
    const candidates = (d.catComp || []).filter(c =>
      c.previous > 0 && c.pct > 25 && c.current >= 100000
    ).sort((a, b) => b.pct - a.pct);
    if (candidates.length) {
      const top = candidates[0];
      biggestMoMRise = `${top.category} naik ${top.pct.toFixed(0)}% (dari ${fmtRp(top.previous)} → ${fmtRp(top.current)})`;
    }

    // ── Subscriptions total ──
    const subs = d.subscriptions || [];
    const subsTotalNum = subs.reduce((s, x) => s + (x.avgAmount || 0), 0);

    // ── Dompet bermasalah (saldo negatif) ──
    const wallets = d.walletBalances || {};
    const negList = Object.entries(wallets)
      .filter(([_, bal]) => bal < 0)
      .map(([name, bal]) => `${name} (${fmtRp(bal)})`);
    const negativeWallets = negList.length ? negList.join(', ') : 'tidak ada';

    // ── Goals list dengan ETA monthly ──
    const goalsList = ((state.goals || []).slice(0, 5)).map(g => {
      const pct = g.target > 0 ? (g.saved / g.target * 100).toFixed(0) : '0';
      const remaining = Math.max(0, g.target - g.saved);
      const dleft = g.deadline ? daysFromToday(g.deadline) : null;
      const monthsLeft = dleft != null ? Math.max(0, Math.round(dleft / 30)) : null;
      const monthlyNeed = monthsLeft && monthsLeft > 0 ? remaining / monthsLeft : remaining;
      const eta = (monthsLeft != null && monthsLeft > 0)
        ? `, deadline ${dleft} hari (${monthsLeft} bln) — butuh ~${fmtRp(monthlyNeed)}/bulan`
        : (g.deadline ? `, deadline ${dleft} hari` : ', tanpa deadline');
      return `  - ${g.name} (${g.category || 'Umum'}): ${fmtRp(g.saved)} / ${fmtRp(g.target)} (${pct}%${eta})`;
    }).join('\n');

    return {
      // Konteks waktu
      monthName: monthNames[m - 1],
      year: String(y),
      nextMonthName: monthNames[nextM - 1],
      monthsOfData: monthsOfData,

      // Cashflow
      totalInc: fmtRp(d.summary.totalInc),
      totalExp: fmtRp(d.summary.totalExp),
      totalSav: fmtRp(d.summary.totalSav),
      balance: fmtRp(d.summary.balance),
      savingsRate: (d.summary.savingsRate || 0).toFixed(1),

      // Budget
      ruleLabel: ruleLabel,
      ruleNeeds: ruleParts.needs,
      ruleWants: ruleParts.wants,
      ruleInvest: ruleParts.invest,
      pNeeds: pNeeds,
      pWants: pWants,
      pInvest: pInvest,

      // Health
      runwayDays: (d.burn && d.burn.runwayDays != null) ? String(d.burn.runwayDays) : 'tidak terbatas (surplus)',
      dsr: (d.ratios.dsr || 0).toFixed(1),
      emergencyFund: (d.ratios.emergencyFundRatio || 0).toFixed(1),
      liquidityRatio: (d.ratios.liquidityRatio || 0).toFixed(1),
      solvencyRatio: ((d.ratios.solvencyRatio || 0) * 100).toFixed(1),
      investmentAssetRatio: ((d.ratios.investmentAssetRatio || 0) * 100).toFixed(1),
      netWorth: fmtRp((d.netWorth && d.netWorth.netWorth) || 0),
      nwTrend: nwTrend,

      // Patterns & leakage
      topExpenses: topExpenses,
      biggestMoMRise: biggestMoMRise,
      subsTotal: fmtRp(subsTotalNum),
      subsCount: String(subs.length),
      negativeWallets: negativeWallets,

      // Goals
      goalsList: goalsList || ''
    };
  }

  /** Parse rule label "50/30/20" / "70/20/10" / "Custom" → object {needs, wants, invest}. */
  function parseRuleLabel(label, custom) {
    if (label === 'Custom' && custom) {
      return { needs: String(custom.needs), wants: String(custom.wants), invest: String(custom.invest) };
    }
    const parts = (label || '50/30/20').split('/');
    return { needs: parts[0] || '50', wants: parts[1] || '30', invest: parts[2] || '20' };
  }

})();
