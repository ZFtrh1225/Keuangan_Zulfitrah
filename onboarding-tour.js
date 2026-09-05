/**
 * onboarding-tour.js — Interactive spotlight guided tour (vanilla, no deps).
 *
 * Kenapa vanilla, bukan Intro.js/Driver.js/Shepherd: proyek ini murni tanpa
 * build step (semua <script defer> langsung), nambah library eksternal
 * cuma nambah beban load untuk fitur yang cuma jalan sekali di awal.
 *
 * Melengkapi (bukan menggantikan) modal onboarding statis yang sudah ada
 * (#onboardingOverlay, 3 langkah teks) — modal itu menjelaskan KONSEP,
 * tour ini menunjukkan LOKASI tombol asli di layar (spotlight cutout).
 *
 * Trigger: dipanggil otomatis setelah modal onboarding lama ditutup
 * (lihat instruksi integrasi di app.js — cari `btnOnbSkip`/`btnOnbNext`
 * langkah terakhir), dengan flag localStorage sendiri supaya tidak
 * bergantung pada implementasi internal modal lama.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const LS_KEY = 'mtpro_tour_seen_v1';

  const STEPS = [
    {
      selector: '#btnAdd, #fab',
      title: 'Tambah Transaksi',
      text: 'Tombol ini untuk mencatat pemasukan, pengeluaran, atau tabungan baru. Bisa juga lewat tombol bulat (+) di pojok kanan bawah.'
    },
    {
      selector: '#summaryGrid',
      title: 'Ringkasan Bulan Ini',
      text: 'Pantau pemasukan, pengeluaran, dan saldo bulan berjalan di sini — termasuk perbandingan dengan bulan lalu.'
    },
    {
      selector: '.bottom-nav [data-tab-target="tab-analytics"]',
      title: 'Analytics',
      text: 'Grafik, AI Insight, dan Spending DNA ada di tab ini — untuk memahami POLA pengeluaranmu, bukan cuma angka.'
    },
    {
      selector: '.bottom-nav [data-tab-target="tab-planning"]',
      title: 'Planning',
      text: 'Atur Budget, Goals, FIRE Projection, dan Debt Payoff di sini — semua alat perencanaan jangka panjang.'
    }
  ];

  let overlayEl = null;
  let currentStep = 0;

  function isSeen() {
    try { return !!localStorage.getItem(LS_KEY); } catch (e) { return true; }
  }
  function markSeen() {
    try { localStorage.setItem(LS_KEY, '1'); } catch (e) { /* noop */ }
  }

  function findTarget(selector) {
    // Selector bisa comma-separated fallback (mis. FAB di desktop vs mobile)
    const candidates = selector.split(',').map(s => s.trim());
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el; // harus visible
    }
    return null;
  }

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'mt-tour-overlay';
    overlayEl.innerHTML = `
      <div class="mt-tour-cutout"></div>
      <div class="mt-tour-card">
        <div class="mt-tour-step-indicator"></div>
        <div class="mt-tour-title"></div>
        <div class="mt-tour-text"></div>
        <div class="mt-tour-actions">
          <button type="button" class="mt-tour-skip">Lewati Tour</button>
          <button type="button" class="mt-tour-next">Lanjut →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);
    overlayEl.querySelector('.mt-tour-skip').addEventListener('click', end);
    overlayEl.querySelector('.mt-tour-next').addEventListener('click', () => {
      currentStep++;
      renderStep();
    });
    return overlayEl;
  }

  function positionCutout(target) {
    const rect = target.getBoundingClientRect();
    const pad = 8;
    const cutout = overlayEl.querySelector('.mt-tour-cutout');
    cutout.style.top = (rect.top - pad + window.scrollY) + 'px';
    cutout.style.left = (rect.left - pad + window.scrollX) + 'px';
    cutout.style.width = (rect.width + pad * 2) + 'px';
    cutout.style.height = (rect.height + pad * 2) + 'px';

    const card = overlayEl.querySelector('.mt-tour-card');
    // Taruh card di bawah target kalau muat, kalau tidak taruh di atas
    const cardTop = rect.bottom + 16 + window.scrollY;
    const fitsBelow = rect.bottom + 180 < window.innerHeight;
    card.style.top = fitsBelow ? cardTop + 'px' : Math.max(16, rect.top - 190 + window.scrollY) + 'px';
    card.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 300)) + 'px';
  }

  function renderStep() {
    const step = STEPS[currentStep];
    if (!step) return end();

    const target = findTarget(step.selector);
    if (!target) {
      // Elemen target tidak ditemukan (mis. layout beda) — skip step ini
      currentStep++;
      return renderStep();
    }

    ensureOverlay();
    overlayEl.classList.add('open');
    overlayEl.querySelector('.mt-tour-step-indicator').textContent =
      `Langkah ${currentStep + 1} dari ${STEPS.length}`;
    overlayEl.querySelector('.mt-tour-title').textContent = step.title;
    overlayEl.querySelector('.mt-tour-text').textContent = step.text;
    overlayEl.querySelector('.mt-tour-next').textContent =
      currentStep === STEPS.length - 1 ? 'Selesai ✓' : 'Lanjut →';

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Beri waktu smooth-scroll selesai sebelum menghitung posisi cutout
    setTimeout(() => positionCutout(target), 260);
  }

  function start() {
    if (isSeen()) return;
    currentStep = 0;
    renderStep();
  }

  function end() {
    markSeen();
    if (overlayEl) overlayEl.classList.remove('open');
  }

  // Restart manual, mis. dari tombol "Bantuan" di Profile tab
  function restart() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* noop */ }
    currentStep = 0;
    renderStep();
  }

  MT.onboardingTour = { start, end, restart };
})();
