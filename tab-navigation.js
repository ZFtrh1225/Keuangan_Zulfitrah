/**
 * tab-navigation.js — Progressive Disclosure via Bottom Tab Bar.
 *
 * CATATAN INTEGRASI: markup `.bottom-nav` + `.main-tab` (#tab-dashboard,
 * #tab-analytics, #tab-planning) SUDAH ADA di index.html & styles.css,
 * tapi belum ada JS yang menghubungkan klik nav-item ↔ tampil/sembunyi
 * section. File ini mengisi kekosongan itu, sekaligus menambah tab ke-4
 * "Profile" (settings & shortcuts) sesuai rencana IA 4-tab.
 *
 * Kenapa modul terpisah, bukan ditambah ke app.js: supaya app.js yang
 * sudah 2800+ baris tidak makin gemuk, dan logic switching ini reusable/
 * gampang di-test terpisah.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const SS_KEY = 'mtpro_active_tab';

  // Chart yang perlu di-resize/redraw saat tab-nya baru terlihat, supaya
  // Chart.js tidak salah hitung dimensi kanvas yang sebelumnya display:none.
  const CHARTS_BY_TAB = {
    'tab-dashboard': [],
    'tab-analytics': ['dailyChart', 'pieChart', 'forecastChart'],
    'tab-planning': ['needsDonut', 'wantsDonut', 'investDonut', 'nwSparkline', 'allocChart'],
    'tab-profile': []
  };

  function getPanels() {
    return Array.from(document.querySelectorAll('.main-tab'));
  }
  function getNavItems() {
    return Array.from(document.querySelectorAll('.bottom-nav .nav-item'));
  }

  function activateTab(tabId, opts) {
    opts = opts || {};
    const panels = getPanels();
    const navItems = getNavItems();
    if (!panels.length) return;

    panels.forEach(p => {
      const isTarget = p.id === tabId;
      p.hidden = !isTarget;
      p.classList.toggle('active', isTarget);
    });
    navItems.forEach(n => {
      const isTarget = n.dataset.tabTarget === tabId;
      n.classList.toggle('active', isTarget);
      n.setAttribute('aria-selected', String(isTarget));
    });

    try { sessionStorage.setItem(SS_KEY, tabId); } catch (e) { /* noop */ }

    // Redraw chart di tab yang baru aktif (canvas yang sebelumnya hidden
    // sering ke-render dengan dimensi 0×0 oleh Chart.js kalau tidak dipicu ulang)
    if (!opts.skipChartRefresh) {
      requestAnimationFrame(() => {
        (CHARTS_BY_TAB[tabId] || []).forEach(canvasId => {
          const chart = MT.charts && MT.charts._instances && MT.charts._instances[canvasId];
          if (chart && typeof chart.resize === 'function') chart.resize();
        });
        window.dispatchEvent(new CustomEvent('mt:tab-shown', { detail: { tabId } }));
      });
    }

    // Set fokus ke heading pertama panel untuk aksesibilitas keyboard/screen reader
    const panel = document.getElementById(tabId);
    if (panel) {
      const heading = panel.querySelector('.section-title, h2, h1');
      if (heading) heading.setAttribute('tabindex', '-1');
    }
  }

  function setupProfileTab() {
    // Tab ke-4 "Profile" dirender sebagai ringkasan + shortcut ke modal-modal
    // yang sudah ada (Settings, Wallets, Auth) — tidak memindahkan konten
    // modal supaya tidak berisiko merusak fungsi yang sudah jalan.
    const main = document.querySelector('main') || document.body;
    if (document.getElementById('tab-profile')) return; // sudah ada, jangan duplikat

    const panel = document.createElement('div');
    panel.id = 'tab-profile';
    panel.className = 'main-tab';
    panel.hidden = true;
    panel.innerHTML = `
      <section class="fadeUp">
        <div class="section-title">👤 Profile & Pengaturan</div>
        <div class="profile-grid">
          <button class="smart-tool-card" id="btnProfileSettings" type="button">
            <div class="smart-tool-icon">⚙️</div>
            <div class="smart-tool-name">Pengaturan</div>
            <div class="smart-tool-desc">Aturan budget, target dana darurat, plafon kategori</div>
          </button>
          <button class="smart-tool-card" id="btnProfileWallets" type="button">
            <div class="smart-tool-icon">👛</div>
            <div class="smart-tool-name">Dompet</div>
            <div class="smart-tool-desc">Kelola dompet & saldo awal</div>
          </button>
          <button class="smart-tool-card" id="btnProfileAuth" type="button">
            <div class="smart-tool-icon">🔐</div>
            <div class="smart-tool-name">Keamanan</div>
            <div class="smart-tool-desc">Token akses & rotasi secret</div>
          </button>
          <button class="smart-tool-card" id="btnProfilePdf" type="button">
            <div class="smart-tool-icon">📄</div>
            <div class="smart-tool-name">Cetak Laporan</div>
            <div class="smart-tool-desc">Export PDF laporan bulanan</div>
          </button>
          <button class="smart-tool-card" id="btnProfileTheme" type="button">
            <div class="smart-tool-icon">🌓</div>
            <div class="smart-tool-name">Tema</div>
            <div class="smart-tool-desc">Ganti tampilan Light/Dark</div>
          </button>
        </div>
      </section>
    `;
    main.appendChild(panel);

    // Delegasikan ke tombol header yang sudah ada fungsinya di app.js —
    // simulasikan klik supaya tidak duplikasi logic buka-modal.
    const delegate = (newId, existingId) => {
      const btn = document.getElementById(newId);
      const target = document.getElementById(existingId);
      if (btn && target) btn.addEventListener('click', () => target.click());
    };
    delegate('btnProfileSettings', 'btnSettings');
    delegate('btnProfileWallets', 'btnWallets');
    delegate('btnProfileAuth', 'btnAuth');
    delegate('btnProfilePdf', 'btnPdf');
    delegate('btnProfileTheme', 'btnTheme');

    // Tambah nav-item ke-4 di bottom-nav
    const nav = document.querySelector('.bottom-nav');
    if (nav && !nav.querySelector('[data-tab-target="tab-profile"]')) {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'nav-item';
      a.setAttribute('data-tab-target', 'tab-profile');
      a.innerHTML = `<div class="nav-icon">👤</div><div class="nav-label">Profile</div>`;
      nav.appendChild(a);
    }
  }

  function init() {
    setupProfileTab();

    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    const panels = getPanels();

    // Defensive check — kalau markup berubah (refactor CSS/HTML di kemudian
    // hari), gagal DIAM-DIAM itu yang paling menyesatkan untuk di-debug.
    // Console warning ini akan langsung kelihatan di DevTools kalau tab
    // bar tidak berfungsi, alih-alih user cuma lihat "tidak ada reaksi".
    if (!navItems.length) {
      console.warn('[tab-navigation] Tidak ada .bottom-nav .nav-item ditemukan — cek apakah class berubah.');
    }
    if (!panels.length) {
      console.warn('[tab-navigation] Tidak ada .main-tab ditemukan — cek apakah struktur #tab-dashboard/#tab-analytics/#tab-planning berubah.');
      return;
    }

    navItems.forEach(item => {
      item.setAttribute('role', 'tab');
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.dataset.tabTarget;
        if (!target) {
          console.warn('[tab-navigation] nav-item tanpa data-tab-target:', item);
          return;
        }
        if (!document.getElementById(target)) {
          console.warn('[tab-navigation] Target tab tidak ditemukan di DOM:', target);
          return;
        }
        activateTab(target);
      });
    });

    // Restore tab terakhir (kalau ada), fallback ke dashboard
    let restored = null;
    try { restored = sessionStorage.getItem(SS_KEY); } catch (e) { /* noop */ }
    const validIds = panels.map(p => p.id);
    activateTab(validIds.includes(restored) ? restored : (validIds[0] || 'tab-dashboard'), { skipChartRefresh: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  MT.tabs = { activateTab };
})();
