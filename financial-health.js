/**
 * FINANCIAL HEALTH SCORE CALCULATOR
 * Menghitung skor keuangan 0-100 berdasarkan 6 metrik utama.
 * 
 * Scoring Breakdown:
 * - Savings Rate (20 poin): target ≥ 20% → 20 poin
 * - Emergency Fund (20 poin): target 3-6 bulan → 20 poin
 * - Debt Ratio/DSR (20 poin): target < 30% → 20 poin
 * - Solvency (15 poin): target > 50% net worth → 15 poin
 * - Cash Position (15 poin): liquidity ratio ≥ 3x → 15 poin
 * - Goal Progress (10 poin): active goals tracked → 10 poin
 * Total: 100 poin
 */

function calculateFinancialHealthScore(data) {
  let score = 0;
  const breakdown = {};
  
  // 1. SAVINGS RATE (20 poin max)
  // Target ideal: ≥ 20%
  const savingsRateScore = Math.min(20, Math.max(0, (data.savingsRate / 20) * 20));
  breakdown.savingsRate = {
    value: data.savingsRate,
    target: 20,
    score: savingsRateScore,
    status: data.savingsRate >= 20 ? 'good' : data.savingsRate >= 10 ? 'warning' : 'danger',
    label: 'Persentase Menabung'
  };
  score += savingsRateScore;
  
  // 2. EMERGENCY FUND (20 poin max)
  // Target ideal: 3-6 bulan pengeluaran
  // Score: 3 bulan = 10 poin, 6 bulan = 20 poin (linear)
  const efScore = Math.min(20, Math.max(0, (data.emergencyFundRatio / 6) * 20));
  breakdown.emergencyFund = {
    value: data.emergencyFundRatio,
    target: 6,
    score: efScore,
    status: data.emergencyFundRatio >= 6 ? 'good' : data.emergencyFundRatio >= 3 ? 'warning' : 'danger',
    label: 'Dana Darurat'
  };
  score += efScore;
  
  // 3. DEBT RATIO / DSR (20 poin max)
  // Target: < 30%, ideal < 20%
  // Score inverse: 0% = 20 poin, 30% = 0 poin
  const dsrScore = Math.min(20, Math.max(0, 20 - (data.dsr / 30) * 20));
  breakdown.debtRatio = {
    value: data.dsr,
    target: 30,
    score: dsrScore,
    status: data.dsr <= 20 ? 'good' : data.dsr <= 30 ? 'warning' : 'danger',
    label: 'Beban Utang (DSR)'
  };
  score += dsrScore;
  
  // 4. SOLVENCY (15 poin max)
  // Target: > 50% (aset bersih / total aset)
  // Score: 50% = 7.5 poin, 100% = 15 poin
  const solvencyRatio = Math.max(0, Math.min(1, data.solvencyRatio));
  const solvencyScore = Math.min(15, (solvencyRatio / 0.5) * 7.5 + 7.5); // min 7.5 at 0%, max 15 at 50%+
  breakdown.solvency = {
    value: solvencyRatio * 100,
    target: 50,
    score: solvencyScore,
    status: solvencyRatio >= 0.5 ? 'good' : solvencyRatio >= 0.3 ? 'warning' : 'danger',
    label: 'Aset Bersih dari Hutang'
  };
  score += solvencyScore;
  
  // 5. LIQUIDITY POSITION (15 poin max)
  // Target: ≥ 3x pengeluaran bulanan
  // Score: 3x = 15 poin, < 1x = 0 poin
  const liquidityScore = Math.min(15, Math.max(0, (data.liquidityRatio / 3) * 15));
  breakdown.liquidity = {
    value: data.liquidityRatio,
    target: 3,
    score: liquidityScore,
    status: data.liquidityRatio >= 3 ? 'good' : data.liquidityRatio >= 1 ? 'warning' : 'danger',
    label: 'Cadangan Uang Cair'
  };
  score += liquidityScore;
  
  // 6. GOAL PROGRESS (10 poin max)
  // Bonus untuk active goals yang terukur & on-track
  let goalScore = 0;
  if (data.activeGoals && data.activeGoals > 0) {
    // Setiap goal on-track (+1.67 poin) hingga maks 3 goals
    const onTrackGoals = Math.min(3, data.activeGoalsOnTrack || 0);
    goalScore = (onTrackGoals / 3) * 10;
  }
  breakdown.goals = {
    value: data.activeGoalsOnTrack || 0,
    target: 3,
    score: goalScore,
    status: goalScore >= 6 ? 'good' : goalScore >= 3 ? 'warning' : 'danger',
    label: 'Tujuan Finansial On-Track'
  };
  score += goalScore;
  
  // Tentukan overall status berdasarkan skor
  let overallStatus = 'danger';
  let statusLabel = '🔴 Perlu Perhatian';
  if (score >= 80) {
    overallStatus = 'excellent';
    statusLabel = '🟢 Sangat Sehat';
  } else if (score >= 60) {
    overallStatus = 'good';
    statusLabel = '🟡 Cukup Sehat';
  } else if (score >= 40) {
    overallStatus = 'warning';
    statusLabel = '🟠 Butuh Perbaikan';
  }
  
  return {
    score: Math.round(score),
    maxScore: 100,
    percentage: Math.round((score / 100) * 100),
    status: overallStatus,
    statusLabel: statusLabel,
    breakdown: breakdown,
    scoreDescription: generateHealthDescription(score, breakdown)
  };
}

/**
 * Generate human-readable description based on score
 */
function generateHealthDescription(score, breakdown) {
  if (score >= 80) {
    return 'Keuangan Anda dalam kondisi sangat sehat. Teruskan strategi menabung & investasi yang sudah berjalan, dan pertimbangkan diversifikasi.';
  } else if (score >= 60) {
    return 'Keuangan cukup sehat namun ada ruang perbaikan. Fokus pada area yang belum optimal (lihat breakdown di bawah).';
  } else if (score >= 40) {
    return 'Ada beberapa area yang perlu segera diperbaiki. Prioritaskan: emergency fund, debt reduction, atau savings rate.';
  } else {
    return '⚠️ Keuangan perlu perhatian serius. Segera ambil aksi konkret pada kategori yang berstatus "danger".';
  }
}

/**
 * Export untuk digunakan di frontend
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateFinancialHealthScore, generateHealthDescription };
}
