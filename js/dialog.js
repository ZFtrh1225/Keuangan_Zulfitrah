/**
 * dialog.js — Custom modal pengganti native window.confirm/alert/prompt.
 *
 * Kenapa: native confirm() block UI, tidak konsisten dengan tema dark, dan
 * tidak bisa berisi rich content (icon, multiline, label tombol custom).
 *
 * API:
 *   await MT.dialog.confirm('Yakin hapus?', { title, danger:true })  // → bool
 *   await MT.dialog.alert('Berhasil!', { type:'success' })           // → true
 *   await MT.dialog.prompt('Nama:', { defaultValue, type:'text' })   // → string|null
 *
 * Returns Promise yang resolve setelah user klik tombol atau ESC.
 */
(function () {
  'use strict';

  const MT = (window.MT = window.MT || {});

  let host = null;        // root element host dialog (singleton)
  let lastFocused = null; // element yang fokus sebelum dialog dibuka — restore saat tutup

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'mtDialogHost';
    host.className = 'mt-dialog-host';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    return host;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Tampilkan dialog. Single dialog at a time — kalau ada yang aktif, tutup dulu.
   *
   * opts:
   *   kind:   'confirm' | 'alert' | 'prompt'
   *   title:  string (heading)
   *   message: string atau HTML (di-escape kalau plain string + newline → <br>)
   *   html:   boolean — kalau true, message dianggap sudah aman (jangan escape)
   *   type:   'info' | 'success' | 'danger' | 'warn' (style + icon)
   *   okLabel:    string default 'OK' / 'Ya'
   *   cancelLabel: string default 'Batal'
   *   danger:     boolean — tombol OK pakai gaya merah
   *   defaultValue: string (untuk prompt)
   *   inputType:    'text' | 'number' | 'email' (untuk prompt)
   *   placeholder:  string (untuk prompt)
   */
  function show(opts) {
    return new Promise((resolve) => {
      const o = opts || {};
      ensureHost();
      lastFocused = document.activeElement;

      const kind = o.kind || 'confirm';
      const type = o.type || (o.danger ? 'danger' : (kind === 'alert' ? 'info' : 'info'));
      const icon = o.icon || (
        type === 'danger' ? '⚠️' :
        type === 'success' ? '✅' :
        type === 'warn' ? '⚡' :
        kind === 'prompt' ? '✏️' : '❓'
      );

      const okLabel = o.okLabel || (kind === 'alert' ? 'OK' : (kind === 'confirm' ? 'Ya, Lanjutkan' : 'Simpan'));
      const cancelLabel = o.cancelLabel || 'Batal';

      let messageHtml;
      if (o.html) {
        messageHtml = o.message || '';
      } else {
        messageHtml = escapeHtml(o.message || '').replace(/\n/g, '<br>');
      }

      const inputHtml = kind === 'prompt'
        ? `<input type="${escapeHtml(o.inputType || 'text')}" class="mt-dialog-input"
            id="mtDialogInput" value="${escapeHtml(o.defaultValue == null ? '' : o.defaultValue)}"
            placeholder="${escapeHtml(o.placeholder || '')}" />`
        : '';

      const cancelBtn = kind === 'alert'
        ? ''
        : `<button type="button" class="mt-dialog-btn mt-dialog-btn-cancel" data-act="cancel">${escapeHtml(cancelLabel)}</button>`;

      const okClass = (o.danger || type === 'danger')
        ? 'mt-dialog-btn mt-dialog-btn-danger'
        : 'mt-dialog-btn mt-dialog-btn-primary';

      host.innerHTML = `
        <div class="mt-dialog-backdrop" data-act="backdrop"></div>
        <div class="mt-dialog ${escapeHtml('type-' + type)}" role="alertdialog" aria-modal="true"
             aria-labelledby="mtDialogTitle" aria-describedby="mtDialogMsg">
          <div class="mt-dialog-icon" aria-hidden="true">${escapeHtml(icon)}</div>
          <div class="mt-dialog-body">
            ${o.title ? `<div class="mt-dialog-title" id="mtDialogTitle">${escapeHtml(o.title)}</div>` : ''}
            <div class="mt-dialog-msg" id="mtDialogMsg">${messageHtml}</div>
            ${inputHtml}
          </div>
          <div class="mt-dialog-actions">
            ${cancelBtn}
            <button type="button" class="${okClass}" data-act="ok">${escapeHtml(okLabel)}</button>
          </div>
        </div>
      `;
      host.classList.add('open');
      host.setAttribute('aria-hidden', 'false');

      const inputEl = host.querySelector('#mtDialogInput');
      const okBtn = host.querySelector('[data-act="ok"]');
      const cancelEl = host.querySelector('[data-act="cancel"]');

      // Focus management
      setTimeout(() => {
        if (inputEl) { inputEl.focus(); inputEl.select(); }
        else if (okBtn) okBtn.focus();
      }, 30);

      function cleanup(result) {
        host.classList.remove('open');
        host.setAttribute('aria-hidden', 'true');
        host.innerHTML = '';
        document.removeEventListener('keydown', onKey);
        host.removeEventListener('click', onClick);
        if (lastFocused && typeof lastFocused.focus === 'function') {
          try { lastFocused.focus(); } catch (e) { /* noop */ }
        }
        resolve(result);
      }

      function onClick(e) {
        const act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'ok') {
          if (kind === 'prompt') {
            const v = inputEl ? inputEl.value : '';
            cleanup(v); // bisa string kosong; caller cek truthy
          } else if (kind === 'alert') {
            cleanup(true);
          } else {
            cleanup(true);
          }
        } else if (act === 'cancel' || act === 'backdrop') {
          cleanup(kind === 'prompt' ? null : false);
        }
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(kind === 'prompt' ? null : (kind === 'alert' ? true : false));
        } else if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'TEXTAREA') {
          // submit dengan Enter
          e.preventDefault();
          if (okBtn) okBtn.click();
        }
      }

      host.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
    });
  }

  function confirmFn(message, opts) {
    return show(Object.assign({ kind: 'confirm', message }, opts || {}));
  }
  function alertFn(message, opts) {
    return show(Object.assign({ kind: 'alert', message }, opts || {}));
  }
  function promptFn(message, opts) {
    return show(Object.assign({ kind: 'prompt', message }, opts || {}));
  }

  MT.dialog = {
    show, confirm: confirmFn, alert: alertFn, prompt: promptFn
  };
})();
