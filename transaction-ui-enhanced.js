/**
 * ENHANCED TRANSACTION LIST UI
 * Card-based layout untuk mobile-first experience.
 */

function renderTransactionCard(tx) {
  const isIncome = tx.kind === 'income';
  const isSaving = tx.kind === 'saving';
  const isExpense = tx.kind === 'expense';
  
  let typeEmoji = '💸';
  let typeColor = 'negative';
  if (isIncome) {
    typeEmoji = '💵';
    typeColor = 'positive';
  } else if (isSaving) {
    typeEmoji = '💰';
    typeColor = 'saving';
  }
  
  const amountText = isIncome || isSaving 
    ? `+${formatRupiah(tx.amount)}` 
    : `-${formatRupiah(tx.amount)}`;
  
  const categoryBadge = tx.category 
    ? `<span class="category-tag">${tx.category}</span>` 
    : '';
  
  const html = `
    <div class="tx-card" data-kind="${tx.kind}" data-row-index="${tx.rowIndex}">
      <div class="tx-date-badge">${formatDateShort(tx.date)}</div>
      
      <div class="tx-content">
        <div class="tx-merchant">
          <span class="merchant-icon">${typeEmoji}</span>
          <div class="merchant-info">
            <span class="merchant-name">${tx.notes || tx.type || tx.subcategory || 'Transaksi'}</span>
            ${categoryBadge}
          </div>
        </div>
        <div class="tx-wallet">Dari: ${tx.source}</div>
      </div>
      
      <div class="tx-amount ${typeColor}">${amountText}</div>
      
      <div class="tx-actions">
        <button class="icon-btn edit-tx" title="Edit" data-row="${tx.rowIndex}" data-kind="${tx.kind}">✏️</button>
        <button class="icon-btn delete-tx" title="Delete" data-row="${tx.rowIndex}" data-kind="${tx.kind}">🗑️</button>
      </div>
    </div>
  `;
  
  return html;
}

/**
 * Format date menjadi "28 Jun"
 */
function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/**
 * Format Rupiah
 */
function formatRupiah(n) {
  return 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
}

/**
 * Render transaction list dari array
 */
function renderTransactionList(transactions) {
  if (!transactions || transactions.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">📜</div>Belum ada transaksi</div>';
  }
  
  return transactions
    .map(tx => renderTransactionCard(tx))
    .join('');
}

/**
 * Setup event listeners untuk transaction cards
 */
function setupTransactionCardListeners() {
  // Edit
  document.querySelectorAll('.edit-tx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rowIndex = e.target.dataset.row;
      const kind = e.target.dataset.kind;
      openTransactionEditModal(kind, rowIndex);
    });
  });
  
  // Delete
  document.querySelectorAll('.delete-tx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (confirm('Hapus transaksi ini?')) {
        const rowIndex = e.target.dataset.row;
        const kind = e.target.dataset.kind;
        deleteTransaction(kind, rowIndex);
      }
    });
  });
}

// Export untuk use di app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderTransactionCard,
    renderTransactionList,
    formatDateShort,
    formatRupiah,
    setupTransactionCardListeners
  };
}
