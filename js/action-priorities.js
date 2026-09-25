/** Prioritas yang dapat dijelaskan dari data dashboard bulan berjalan. */
(function (root, factory) {
  const actions = factory();
  if (typeof module === 'object' && module.exports) module.exports = actions;
  else (root.MT = root.MT || {}).actionPriorities = actions;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  function day(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
  }
  function diffDays(a, b) { return Math.round((a - b) / 86400000); }
  function amount(n) { return Number.isFinite(Number(n)) && n !== '' && n != null ? Number(n) : null; }

  function prioritize({ dashboard, goals = [], month, year, now = new Date() }) {
    if (!dashboard || !Number.isFinite(now.getTime()) || month !== now.getMonth() + 1 || year !== now.getFullYear()) return [];
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const daysRemaining = new Date(year, month, 0).getDate() - now.getDate() + 1; // termasuk hari ini
    const candidates = [];

    (dashboard.manualBills || []).forEach(b => {
      const due = day(b.dueDate);
      const value = amount(b.amount);
      if (!due || value == null || value <= 0 || !b.name) return;
      const left = diffDays(due, today);
      if (left < 0 || left > 7) return;
      candidates.push({ type: 'bill', score: 1000 - left * 10, title: `Cek tagihan ${b.name}`,
        date: b.dueDate, amount: value, daysLeft: left, wallet: null, predicted: false });
    });
    (dashboard.upcomingBills || []).forEach(b => {
      const due = day(b.nextDate);
      const value = amount(b.avgAmount != null ? b.avgAmount : b.lastAmount);
      if (!due || value == null || value <= 0 || !b.name || b.paidThisMonth) return;
      const left = diffDays(due, today);
      if (left < 0 || left > 7) return;
      candidates.push({ type: 'bill', score: 990 - left * 10, title: `Cek perkiraan tagihan ${b.name}`,
        date: b.nextDate, amount: value, daysLeft: left,
        wallet: typeof b.source === 'string' ? b.source.trim() : null, predicted: true,
        occurrences: amount(b.monthCount) });
    });

    (dashboard.categoryBudgets || []).forEach(b => {
      const limit = amount(b.budget), spent = amount(b.spent);
      if (!b.name || limit == null || limit <= 0 || spent == null || spent < 0) return;
      const ratio = spent / limit;
      if (ratio < 0.9) return;
      candidates.push({ type: 'budget', score: ratio >= 1 ? 850 + Math.min(50, (ratio - 1) * 20) : 700 + ratio * 100,
        title: `Tinjau anggaran ${b.name}`, budget: limit, spent,
        remaining: limit - spent, daysRemaining, ratio });
    });

    (goals || []).forEach(g => {
      const start = day(g.date), due = day(g.deadline);
      const target = amount(g.effectiveTarget != null ? g.effectiveTarget : g.target);
      const saved = amount(g.saved);
      if (!start || !due || !g.name || target == null || target <= 0 || saved == null || saved < 0 || saved >= target) return;
      const total = diffDays(due, start), elapsed = diffDays(today, start), left = diffDays(due, today);
      if (total <= 0 || elapsed <= 0 || left < 0) return; // tenggat lampau tidak punya kebutuhan bulanan yang sah
      const expected = target * Math.min(1, elapsed / total);
      const gap = expected - saved;
      if (gap <= 0) return;
      // Laju 30 hari lebih jujur daripada menghitung sisa satu hari sebagai satu bulan penuh.
      const monthlyNeeded = left > 0 ? Math.ceil((target - saved) * 30 / left) : null;
      candidates.push({ type: 'goal', score: left <= 1 ? 1005 : left <= 7 ? 900 - left * 8 : 500 + Math.min(150, gap / target * 150),
        title: `Kejar tujuan ${g.name}`, target, saved, expected: Math.round(expected),
        gap: Math.ceil(gap), deadline: g.deadline, daysLeft: left, monthlyNeeded,
        inflationAdjusted: Boolean(g.inflationSensitive && g.effectiveTarget != null) });
    });

    // Satu tindakan paling mendesak per sumber supaya tiga slot tidak dipenuhi satu jenis peringatan.
    candidates.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'id'));
    const seen = new Set();
    return candidates.filter(item => !seen.has(item.type) && seen.add(item.type)).slice(0, 3);
  }

  return { prioritize };
});
