/**
 * GOALS GAMIFICATION ENGINE
 * Milestone badges, progress visualization, urgency indicators.
 */

class GoalGamification {
  constructor() {
    this.milestones = [25, 50, 75, 100];
    this.badges = {
      25: { emoji: '🥚', label: 'Mulai Kuat', color: '#60a5fa' },
      50: { emoji: '🥉', label: 'Halfway There', color: '#f59e0b' },
      75: { emoji: '🥈', label: 'Tinggal Sedikit', color: '#f97316' },
      100: { emoji: '🏆', label: 'Target Tercapai!', color: '#22c55e' }
    };
  }
  
  /**
   * Enhance goal data dengan gamification elements
   */
  enrichGoal(goal) {
    // Hitung sisa hari duluan (dipakai untuk proyeksi inflasi target)
    const deadline = new Date(goal.deadline);
    const today = new Date();
    const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    const monthsLeft = Math.max(1, daysLeft / 30);

    // ── INFLASI ──
    // Goal yang targetnya adalah harga barang/jasa masa depan (DP rumah,
    // biaya kuliah) ikut naik seiring waktu — bukan cuma nominal tabungan
    // yang dikejar tetap. Goal nominal tetap (dana darurat) tidak disentuh
    // karena basisnya sudah otomatis ikut inflasi lewat pengeluaran terkini.
    const inflationRate = (goal.inflationRate != null ? goal.inflationRate : 6) / 100;
    const originalTarget = goal.target;
    const effectiveTarget = goal.inflationSensitive
      ? goal.target * Math.pow(1 + inflationRate, monthsLeft / 12)
      : goal.target;

    const percentage = effectiveTarget > 0 ? (goal.saved / effectiveTarget) * 100 : 0;
    const monthlyRequired = Math.ceil((effectiveTarget - goal.saved) / monthsLeft);
    
    // Determine active milestones
    const activeMilestones = this.milestones
      .filter(m => m <= 100)
      .map(m => ({
        percentage: m,
        badge: this.badges[m],
        achieved: percentage >= m,
        isNext: !this.milestones.filter(x => x < m).some(x => percentage < x)
      }));
    
    // Urgency level
    let urgency = 'low';
    let urgencyIcon = '🟢';
    if (daysLeft <= 7) {
      urgency = 'critical';
      urgencyIcon = '🔴';
    } else if (daysLeft <= 30) {
      urgency = 'high';
      urgencyIcon = '🟠';
    } else if (daysLeft <= 90) {
      urgency = 'medium';
      urgencyIcon = '🟡';
    }
    
    // On-track status
    let isOnTrack = true;
    let statusMessage = '✅ On track';
    if (goal.deadline && monthlyRequired > 0) {
      // Simple heuristic: on-track jika sudah capai % proportional dengan waktu terpakai
      const timePassedRatio = 1 - (daysLeft / this.daysBetween(new Date(goal.deadline), this.addMonths(new Date(goal.deadline), -12)));
      const expectedProgress = Math.max(0, Math.min(100, timePassedRatio * 100));
      
      if (percentage < expectedProgress - 10) {
        isOnTrack = false;
        statusMessage = '⚠️ Behind schedule';
      } else if (percentage > expectedProgress + 10) {
        statusMessage = '🚀 Ahead of schedule!';
      }
    }
    
    return {
      ...goal,
      percentage: Math.round(percentage),
      daysLeft: daysLeft,
      monthsLeft: Math.round(monthsLeft),
      monthlyRequired: monthlyRequired,
      monthlyRequiredFormatted: this.fmtRp(monthlyRequired),
      activeMilestones: activeMilestones,
      nextMilestone: activeMilestones.find(m => !m.achieved),
      urgency: urgency,
      urgencyIcon: urgencyIcon,
      isOnTrack: isOnTrack,
      statusMessage: statusMessage,
      shouldPulse: urgency === 'critical' || urgency === 'high',
      // Inflasi — dipakai UI untuk tampilkan "Target awal Rp30jt → Rp38jt (inflasi 6%)"
      originalTarget: originalTarget,
      effectiveTarget: Math.round(effectiveTarget),
      inflationAdjustedNote: goal.inflationSensitive
        ? `Target awal ${this.fmtRp(originalTarget)} → disesuaikan inflasi ${(inflationRate*100).toFixed(0)}%/thn jadi ${this.fmtRp(effectiveTarget)} dalam ${Math.round(monthsLeft)} bulan.`
        : null
    };
  }
  
  /**
   * Calculate days between two dates
   */
  daysBetween(d1, d2) {
    return Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
  }
  
  /**
   * Add months to date
   */
  addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }
  
  /**
   * Batch enrich multiple goals
   */
  enrichGoals(goals) {
    return goals.map(g => this.enrichGoal(g));
  }
  
  /**
   * Format Rupiah
   */
  fmtRp(n) {
    return 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoalGamification;
}
