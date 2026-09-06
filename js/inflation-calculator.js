/**
 * inflation-calculator.js — Inflation-aware helpers untuk FIRE Projection
 * & Goal Tracker.
 *
 * KENAPA INI PENTING:
 * Kalkulator FIRE/Goal yang mengabaikan inflasi memberi FALSE SENSE OF
 * SECURITY. Target "Rp1 Miliar" hari ini nilainya jauh berbeda 10-20 tahun
 * ke depan. Modul ini menyediakan util bersama (real return via Fisher
 * equation, proyeksi target ter-inflasi) yang dipakai baik di FIRE modal
 * maupun Goal modal — satu sumber logika, tidak duplikat.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});

  /**
   * Real rate of return (Fisher equation) — return investasi setelah
   * dikurangi efek inflasi. Dipakai untuk proyeksi compound dalam "daya
   * beli hari ini", bukan nominal masa depan yang menyesatkan.
   * @param {number} nominalReturnPct e.g. 7 (untuk 7%)
   * @param {number} inflationPct e.g. 5 (untuk 5%)
   * @returns {number} real return dalam persen, e.g. 1.9
   */
  function realReturn(nominalReturnPct, inflationPct) {
    const n = nominalReturnPct / 100;
    const i = inflationPct / 100;
    return ((1 + n) / (1 + i) - 1) * 100;
  }

  /**
   * Proyeksikan nominal target masa depan akibat inflasi (compound tahunan).
   * Dipakai untuk goal yang harga barangnya naik (DP rumah, kuliah) — BUKAN
   * untuk goal nominal tetap seperti dana darurat.
   * @param {number} amount nilai hari ini
   * @param {number} inflationPct e.g. 6
   * @param {number} years bisa desimal, e.g. 2.5
   */
  function inflateAmount(amount, inflationPct, years) {
    return amount * Math.pow(1 + inflationPct / 100, years);
  }

  /**
   * Render badge kecil "disesuaikan inflasi" untuk ditempel di UI goal/FIRE card.
   */
  function inflationBadgeHtml(inflationPct) {
    return `<span class="inflation-badge" title="Proyeksi memperhitungkan inflasi tahunan">
      📉 Real (inflasi ${inflationPct}%/thn)
    </span>`;
  }

  /**
   * Bangun teks perbandingan "naif vs realistis" untuk edukasi user —
   * inilah bagian yang mengatasi false sense of security.
   */
  function comparisonNote(naiveYears, realYears) {
    if (naiveYears == null || realYears == null) return '';
    const diff = (realYears - naiveYears).toFixed(1);
    if (Math.abs(diff) < 0.1) return 'Penyesuaian inflasi tidak mengubah proyeksi secara signifikan di sini.';
    return `⚠️ Tanpa penyesuaian inflasi, kalkulator akan bilang FIRE dalam ${naiveYears.toFixed(1)} tahun — ` +
      `padahal realistisnya (memperhitungkan inflasi) butuh ${realYears.toFixed(1)} tahun ` +
      `(selisih ${diff} tahun). Ini contoh nyata "false sense of security" dari kalkulator yang mengabaikan inflasi.`;
  }

  /**
   * Hitung target efektif (ter-inflasi) untuk sebuah goal, dipakai renderGoals()
   * di app.js. Goal nominal tetap (dana darurat) tidak disentuh — hanya goal
   * yang ditandai `inflationSensitive` (harga barang/jasa masa depan).
   * @param {{target:number, deadline:string, inflationSensitive:boolean, inflationRate:number}} goal
   */
  function effectiveGoalTarget(goal) {
    if (!goal.inflationSensitive) {
      return { effectiveTarget: goal.target, note: null };
    }
    const deadline = new Date(goal.deadline);
    const monthsLeft = isNaN(deadline)
      ? 12
      : Math.max(1, (deadline - new Date()) / (1000 * 60 * 60 * 24 * 30));
    const rate = goal.inflationRate != null ? goal.inflationRate : 6;
    const effectiveTarget = inflateAmount(goal.target, rate, monthsLeft / 12);
    return {
      effectiveTarget: Math.round(effectiveTarget),
      note: `📉 Target awal Rp${goal.target.toLocaleString('id-ID')} → disesuaikan inflasi ${rate}%/thn jadi Rp${Math.round(effectiveTarget).toLocaleString('id-ID')} dalam ${Math.round(monthsLeft)} bulan.`
    };
  }

  MT.inflation = {
    realReturn,
    inflateAmount,
    inflationBadgeHtml,
    comparisonNote,
    effectiveGoalTarget
  };
})();
