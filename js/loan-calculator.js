/**
 * loan-calculator.js — Kalkulator Simulasi Pinjaman (Cost of Borrowing).
 *
 * PRINSIP: murni kalkulator sekali pakai. TIDAK memanggil backend, TIDAK
 * menyimpan apapun ke Sheet — semua perhitungan terjadi di browser.
 *
 * KENAPA INI PENTING (advisor note): pinjol/leasing biasanya iklankan
 * "bunga flat" (misal 1,5%/bulan) yang menyesatkan karena tidak
 * memperhitungkan biaya admin & skema reducing-balance sesungguhnya.
 * Modul ini menghitung BUNGA EFEKTIF TAHUNAN via IRR (metode bisection)
 * dari arus kas riil: dana yang benar-benar diterima vs total yang
 * harus dibayar — angka yang jauh lebih jujur untuk menilai mahal/wajar.
 *
 * LAYER 2 (opsional): kalau data dashboard bulan ini sudah ter-load di
 * memori (MT.state.dashboard, tidak fetch baru), modul ini juga
 * menambahkan analisis keterjangkauan (cicilan vs income) — tanpa
 * menyimpan atau mengirim data apapun ke server.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});
  const fmtRp = (MT.fmt && MT.fmt.fmtRp) || (n => 'Rp ' + Math.round(n).toLocaleString('id-ID'));
  const escapeHtml = (MT.fmt && MT.fmt.escapeHtml) || (s => s);

  /**
   * Cari monthly effective rate (r) via bisection, dari persamaan anuitas:
   *   PV = M × [1 - (1+r)^-n] / r
   * PV = dana yang benar-benar diterima peminjam (net of admin fee kalau
   * dipotong dari pencairan), M = cicilan/bulan, n = tenor.
   * Bisection dipilih (bukan Newton-Raphson) karena fungsinya monoton
   * turun terhadap r di rentang wajar — lebih tahan gagal-konvergen.
   */
  function solveEffectiveMonthlyRate(pv, monthlyPayment, n) {
    if (pv <= 0 || monthlyPayment <= 0 || n <= 0) return null;
    // Kalau total dibayar <= dana diterima, secara matematis bunga <= 0
    // (kasus tidak wajar / promo cashback) — tidak valid untuk dianalisis normal.
    if (monthlyPayment * n <= pv) return 0;

    function annuityPV(r) {
      if (Math.abs(r) < 1e-9) return monthlyPayment * n; // limit r→0
      return monthlyPayment * (1 - Math.pow(1 + r, -n)) / r;
    }

    let lo = 0, hi = 5; // 0% s.d. 500%/bulan — batas atas aman untuk pinjol paling predatory sekalipun
    // annuityPV(r) turun monoton seiring r naik. Target: annuityPV(r) == pv.
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      const val = annuityPV(mid);
      if (val > pv) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  const BANDS = [
    { max: 0.15, key: 'ok',       icon: '🟢', label: 'Sangat Murah',  note: 'Setara bunga bank terbaik / KTA prima.' },
    { max: 0.24, key: 'good',     icon: '🟢', label: 'Wajar',         note: 'Mirip kartu kredit atau KTA bank umum.' },
    { max: 0.40, key: 'warning',  icon: '🟡', label: 'Mulai Mahal',   note: 'Pertimbangkan alternatif: koperasi, kartu kredit, atau pinjam ke keluarga.' },
    { max: 1.00, key: 'high',     icon: '🟠', label: 'Mahal',         note: 'Umum di pinjol konsumtif. Pakai hanya untuk kebutuhan mendesak & tenor sesingkat mungkin.' },
    { max: Infinity, key: 'critical', icon: '🔴', label: 'Sangat Mahal / Berisiko', note: 'Mendekati/di atas kewajaran pasar. Sangat disarankan cari alternatif atau nego ulang sebelum ambil.' }
  ];

  function getBand(effectiveAnnualRate) {
    return BANDS.find(b => effectiveAnnualRate <= b.max) || BANDS[BANDS.length - 1];
  }

  /**
   * Hitung semua metrik dari input form. Return object siap-render.
   */
  function analyze(input) {
    const { principal, tenor, monthlyPayment, adminFee, adminDeducted } = input;

    const netReceived = adminDeducted ? (principal - adminFee) : principal;
    const totalPaid = monthlyPayment * tenor + (adminDeducted ? 0 : adminFee);
    const totalCost = totalPaid - netReceived; // "all-in cost" — biaya sesungguhnya dari pinjaman ini

    // Bunga FLAT (cara umum diiklankan — menyesatkan karena basisnya pokok utuh, bukan saldo berjalan)
    const flatMonthlyRatePct = ((monthlyPayment * tenor - principal) / principal / tenor) * 100;
    const flatAnnualRatePct = flatMonthlyRatePct * 12;

    // Bunga EFEKTIF (IRR reducing-balance, memperhitungkan dampak admin fee)
    const effMonthlyRate = solveEffectiveMonthlyRate(netReceived, monthlyPayment, tenor);
    const effAnnualRate = effMonthlyRate != null ? (Math.pow(1 + effMonthlyRate, 12) - 1) : null;

    const band = effAnnualRate != null ? getBand(effAnnualRate) : null;
    // Guard: kalau total yang dibayar <= dana yang diterima, ini bukan
    // skema pinjaman wajar (bunga negatif/nol) — kemungkinan besar salah
    // input, bukan benar-benar "pinjaman sangat murah".
    const isImplausible = totalCost <= 0;

    return {
      netReceived, totalPaid, totalCost,
      flatMonthlyRatePct, flatAnnualRatePct,
      effMonthlyRate, effAnnualRate, band, isImplausible
    };
  }

  /**
   * Layer 2 opsional: baca income bulan ini dari state yang SUDAH ter-load
   * (tidak fetch baru, tidak simpan apapun) untuk analisis keterjangkauan.
   */
  function getAffordabilityNote(monthlyPayment) {
    const dash = MT.state && MT.state.dashboard;
    if (!dash || !dash.summary || !dash.summary.totalInc) return null;

    const income = dash.summary.totalInc;
    const ratioPct = (monthlyPayment / income) * 100;

    // OJK 2026: total kewajiban pinjol dibatasi maksimal 30% dari penghasilan.
    // Dipakai sebagai rule-of-thumb, bukan hard rule aplikasi ini — angka
    // resmi bisa berubah, selalu cek regulasi OJK terbaru.
    let verdict, severity;
    if (ratioPct > 30) {
      verdict = `Cicilan ini sendiri sudah ${ratioPct.toFixed(1)}% dari income bulan ini — di atas batas wajar 30% yang jadi acuan OJK untuk total kewajiban pinjol. Pertimbangkan nominal lebih kecil atau tenor lebih panjang.`;
      severity = 'critical';
    } else if (ratioPct > 20) {
      verdict = `Cicilan ini ${ratioPct.toFixed(1)}% dari income bulan ini — masih di bawah batas 30%, tapi cukup besar. Pastikan tidak ada cicilan lain yang bikin totalnya menumpuk.`;
      severity = 'warning';
    } else {
      verdict = `Cicilan ini cuma ${ratioPct.toFixed(1)}% dari income bulan ini — porsinya kecil, secara arus kas relatif aman (asalkan tidak ada cicilan lain yang menumpuk).`;
      severity = 'ok';
    }
    return { ratioPct, income, verdict, severity };
  }

  function render(result, affordability) {
    const b = result.band;
    const container = document.getElementById('loanCalcResult');
    if (!container) return;
    container.hidden = false;

    if (!b) {
      container.innerHTML = `<div class="muted">Input tidak valid — total cicilan harus lebih besar dari nominal pinjaman.</div>`;
      return;
    }
    if (result.isImplausible) {
      container.innerHTML = `
        <div class="loan-verdict" style="border-left:4px solid var(--amber);">
          <div class="loan-verdict-head">⚠️ Cek Kembali Angkanya</div>
          <div class="loan-verdict-note">
            Total yang harus dibayar (${fmtRp(result.totalPaid)}) sama atau lebih kecil dari dana
            yang diterima (${fmtRp(result.netReceived)}). Ini tidak realistis untuk pinjaman
            sungguhan (artinya bunga 0% atau negatif) — kemungkinan besar ada angka yang salah
            input (cicilan × tenor terlalu kecil, atau nominal pinjaman kebesaran). Coba cek ulang
            simulasi cicilan dari pemberi pinjaman.
          </div>
        </div>
      `;
      return;
    }

    const sevColor = { ok: 'var(--green)', good: 'var(--green)', warning: 'var(--amber)', high: 'var(--orange, #f97316)', critical: 'var(--red)' }[b.key] || 'var(--t3)';
    const afColor = affordability ? { ok: 'var(--green)', warning: 'var(--amber)', critical: 'var(--red)' }[affordability.severity] : null;

    container.innerHTML = `
      <div class="loan-verdict" style="border-left:4px solid ${sevColor};">
        <div class="loan-verdict-head">${b.icon} <b>${escapeHtml(b.label)}</b></div>
        <div class="loan-verdict-rate">Bunga efektif: <b>${(result.effAnnualRate * 100).toFixed(1)}%/tahun</b> (≈ ${(result.effMonthlyRate * 100).toFixed(2)}%/bulan)</div>
        <div class="loan-verdict-note">${escapeHtml(b.note)}</div>
      </div>

      <div class="loan-compare-note">
        📌 Pemberi pinjaman biasanya iklankan <b>bunga flat ${result.flatMonthlyRatePct.toFixed(2)}%/bulan</b>
        (≈ ${result.flatAnnualRatePct.toFixed(1)}%/tahun) — tapi karena skema reducing-balance
        ${result.netReceived < 0 ? '' : 'dan biaya admin'}, <b>bunga efektif sesungguhnya ${(result.effAnnualRate * 100).toFixed(1)}%/tahun</b>.
        Selisih ${(result.effAnnualRate * 100 - result.flatAnnualRatePct).toFixed(1)} poin ini yang sering tidak disadari peminjam.
      </div>

      <div class="loan-breakdown">
        <div class="loan-row"><span>Dana yang benar-benar diterima</span><b>${fmtRp(result.netReceived)}</b></div>
        <div class="loan-row"><span>Total yang harus dibayar</span><b>${fmtRp(result.totalPaid)}</b></div>
        <div class="loan-row total"><span>Total biaya pinjaman (all-in cost)</span><b style="color:${sevColor}">${fmtRp(result.totalCost)}</b></div>
      </div>

      ${affordability ? `
        <div class="loan-afford-note" style="border-left:4px solid ${afColor};">
          <div class="loan-afford-head">💳 Dampak ke Arus Kas Bulanan Anda</div>
          <div>${escapeHtml(affordability.verdict)}</div>
          <div class="muted micro-label" style="margin-top:6px;">Dihitung dari income bulan berjalan yang sudah tercatat di aplikasi (${fmtRp(affordability.income)}) — bukan data baru, tidak disimpan.</div>
        </div>
      ` : `
        <div class="muted micro-label" style="margin-top:12px;">
          💡 Buka tab Home dulu (biar data income bulan ini ter-load) untuk analisis dampak ke arus kas Anda secara otomatis di sini.
        </div>
      `}

      <div class="loan-disclaimer">
        ℹ️ Kalkulator ini murni simulasi berdasarkan input Anda, bukan rekomendasi produk finansial.
        Pastikan pemberi pinjaman terdaftar resmi di OJK (cek di ojk.go.id atau call center 157)
        sebelum mengambil pinjaman apapun.
      </div>
    `;
  }

  function readCurrency(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return (MT.fmt && MT.fmt.parseRp) ? MT.fmt.parseRp(el.value) : (parseInt(el.value.replace(/\D/g, ''), 10) || 0);
  }

  function runCalculation() {
    const principal = readCurrency('loanPrincipal');
    const tenor = parseInt((document.getElementById('loanTenor') || {}).value, 10) || 0;
    const monthlyPayment = readCurrency('loanMonthly');
    const adminFee = readCurrency('loanAdminFee');
    const adminDeductedEl = document.getElementById('loanAdminDeducted');
    const adminDeducted = adminDeductedEl ? adminDeductedEl.checked : true;

    if (principal <= 0 || tenor <= 0 || monthlyPayment <= 0) {
      if (MT.dialog) MT.dialog.alert('Lengkapi nominal pinjaman, tenor, dan cicilan per bulan dulu ya.', { type: 'warn' });
      return;
    }

    const result = analyze({ principal, tenor, monthlyPayment, adminFee, adminDeducted });
    const affordability = getAffordabilityNote(monthlyPayment);
    render(result, affordability);
  }

  function init() {
    const btn = document.getElementById('btnRunLoanCalc');
    if (btn) btn.addEventListener('click', runCalculation);

    // Reset hasil setiap kali modal dibuka ulang, supaya tidak menampilkan
    // hasil kalkulasi sesi sebelumnya yang membingungkan.
    const openBtn = document.getElementById('btnLoanCalc');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const result = document.getElementById('loanCalcResult');
        if (result) { result.hidden = true; result.innerHTML = ''; }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  MT.loanCalculator = { analyze, getAffordabilityNote };
})();
