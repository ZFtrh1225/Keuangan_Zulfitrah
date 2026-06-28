/**
 * BUDGET EARLY WARNING SYSTEM
 * Real-time alerts ketika pengeluaran mendekati/melampaui plafon kategori.
 * 
 * Triggers:
 * - 70% dari plafon: WARN (kuning)
 * - 90% dari plafon: DANGER (merah terang)
 * - 100%+ dari plafon: OVER (merah gelap + actionable)
 */

class BudgetAlertSystem {
  constructor() {
    this.alerts = [];
  }
  
  /**
   * Generate alerts dari category budget data
   * Input: categoryBudgets array dari getDashboardData
   * Output: sorted alerts by urgency
   */
  generateAlerts(categoryBudgets) {
    this.alerts = [];
    
    if (!categoryBudgets || !Array.isArray(categoryBudgets)) {
      return this.alerts;
    }
    
    categoryBudgets.forEach(cat => {
      const budget = cat.budget || 0;
      const spent = cat.spent || 0;
      const remaining = Math.max(0, budget - spent);
      const percentage = budget > 0 ? (spent / budget) * 100 : 0;
      
      let alert = null;
      
      if (budget > 0) {
        if (percentage >= 100) {
          alert = {
            type: 'over',
            severity: 'critical',
            icon: '🚫',
            title: `Plafon "${cat.name}" Terlampaui`,
            message: `Sudah menghabiskan ${Math.round(percentage)}% dari plafon (${this.fmtRp(spent)}/${this.fmtRp(budget)}).`,
            actionText: 'Hentikan pengeluaran di kategori ini segera atau naikkan plafon.',
            categoryName: cat.name,
            percentage: percentage,
            spent: spent,
            budget: budget,
            remaining: remaining
          };
        } else if (percentage >= 90) {
          alert = {
            type: 'danger',
            severity: 'high',
            icon: '⚠️',
            title: `Hampir Habis: "${cat.name}"`,
            message: `Sudah menggunakan ${Math.round(percentage)}% plafon (${this.fmtRp(spent)}/${this.fmtRp(budget)}).`,
            actionText: `Sisa ${this.fmtRp(remaining)} — hati-hati pengeluaran berikutnya.`,
            categoryName: cat.name,
            percentage: percentage,
            spent: spent,
            budget: budget,
            remaining: remaining
          };
        } else if (percentage >= 70) {
          alert = {
            type: 'warn',
            severity: 'medium',
            icon: '⏱️',
            title: `Monitor Ketat: "${cat.name}"`,
            message: `Sudah mencapai ${Math.round(percentage)}% plafon (${this.fmtRp(spent)}/${this.fmtRp(budget)}).`,
            actionText: `Pantau agar tidak melampaui. Sisa ${this.fmtRp(remaining)}.`,
            categoryName: cat.name,
            percentage: percentage,
            spent: spent,
            budget: budget,
            remaining: remaining
          };
        }
      }
      
      if (alert) {
        this.alerts.push(alert);
      }
    });
    
    // Sort by severity (critical → high → medium)
    const severityOrder = { 'critical': 0, 'high': 1, 'medium': 2 };
    this.alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    return this.alerts;
  }
  
  /**
   * Get alert count by severity
   */
  getAlertSummary() {
    return {
      total: this.alerts.length,
      critical: this.alerts.filter(a => a.severity === 'critical').length,
      high: this.alerts.filter(a => a.severity === 'high').length,
      medium: this.alerts.filter(a => a.severity === 'medium').length,
      hasUrgent: this.alerts.some(a => a.severity === 'critical' || a.severity === 'high')
    };
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
  module.exports = BudgetAlertSystem;
}
