/**
 * SMART FORM INPUT SYSTEM
 * Auto-fill & predictions untuk transaksi cepat.
 * 
 * Features:
 * - Auto-fill dari recent transactions
 * - Category prediction from merchant name
 * - Minimal form (3 fields) with optional advanced
 * - Template quick-pick
 */

class SmartFormInput {
  constructor(recentTransactions = [], templates = []) {
    this.recentTransactions = recentTransactions;
    this.templates = templates;
  }
  
  /**
   * Suggest nilai default untuk new transaction berdasarkan history
   * type: 'income' | 'expense' | 'saving'
   */
  getSuggestions(type) {
    const recent = this.recentTransactions.filter(t => t.kind === type);
    
    if (recent.length === 0) {
      return this.getDefaultValues(type);
    }
    
    // Ambil yang paling recent
    const lastTx = recent[0];
    const avgAmount = recent.reduce((sum, t) => sum + t.amount, 0) / recent.length;
    
    return {
      amount: avgAmount,
      amountFormatted: this.fmtRp(avgAmount),
      category: lastTx.category || '',
      subcategory: lastTx.subcategory || '',
      source: lastTx.source || '',
      type: lastTx.type || '',
      lastDate: lastTx.date || new Date().toISOString().split('T')[0],
      frequency: this.guessFrequency(recent)
    };
  }
  
  /**
   * Predict category dari merchant name (naive matching)
   */
  predictCategory(merchantName) {
    const name = (merchantName || '').toLowerCase();
    
    // Simple keyword matching
    const rules = [
      { keywords: ['grocery', 'supermarket', 'pasar', 'warung', 'toko', 'mini market'], category: 'Makanan Pokok & Minuman' },
      { keywords: ['cafe', 'kopi', 'restoran', 'makan', 'food', 'restaurant'], category: 'Makan di Luar & Jajanan' },
      { keywords: ['spbu', 'bensin', 'bbm', 'shell', 'pertamina'], category: 'Transportasi' },
      { keywords: ['netflix', 'spotify', 'disney', 'youtube', 'hbo'], category: 'Hiburan & Streaming' },
      { keywords: ['shopee', 'tokopedia', 'lazada', 'zalora'], category: 'Belanja Online & Fashion' },
      { keywords: ['bank', 'atm', 'transfer'], category: 'Kewajiban & Utang' },
      { keywords: ['rumah sakit', 'dokter', 'apotek', 'klinik'], category: 'Kesehatan & Proteksi' },
    ];
    
    for (const rule of rules) {
      if (rule.keywords.some(k => name.includes(k))) {
        return rule.category;
      }
    }
    
    return null; // No prediction
  }
  
  /**
   * Guess transaction frequency dari history
   * Returns: 'daily' | 'weekly' | 'monthly' | 'random'
   */
  guessFrequency(transactions) {
    if (transactions.length < 2) return 'random';
    
    const dates = transactions.map(t => new Date(t.date).getTime()).sort((a, b) => b - a);
    const gaps = [];
    
    for (let i = 1; i < Math.min(5, dates.length); i++) {
      gaps.push((dates[i - 1] - dates[i]) / (1000 * 60 * 60 * 24)); // dalam hari
    }
    
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    
    if (avgGap < 2) return 'daily';
    if (avgGap < 8) return 'weekly';
    if (avgGap < 35) return 'monthly';
    return 'random';
  }
  
  /**
   * Get default values saat tidak ada history
   */
  getDefaultValues(type) {
    const today = new Date().toISOString().split('T')[0];
    return {
      date: today,
      amount: 0,
      amountFormatted: 'Rp 0',
      category: '',
      subcategory: '',
      source: type === 'saving' ? 'BRI' : 'Cash',
      type: type === 'income' ? 'Gaji' : type === 'saving' ? 'Tabungan Rutin' : '',
      frequency: 'random'
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
  module.exports = SmartFormInput;
}
