export const APP_NAME = 'XMator-RH';
export const APP_LOGO = typeof window !== 'undefined' ? `${window.location.origin}/icons/icon-192.png` : '/icons/icon-192.png';

// Ouvre la fenêtre d'impression via une URL BLOB puis déclenche impression auto.
export const printHtml = (html, { autoPrint = true } = {}) => {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const w = window.open(url, '_blank', 'width=1050,height=820');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (!w) { alert('Popup bloqué — autorisez les popups pour ce site.'); return null; }
  if (autoPrint) {
    w.addEventListener('load', () => { setTimeout(() => w.print(), 400); });
  }
  return w;
};

// En-tête "Logo + XMator-RH + Fiche Signalétique" uniquement sur la PREMIERE page
export const printBrandHeader = (docTitle) => `
  <div class="print-brand">
    <img class="print-brand-logo" src="${APP_LOGO}" alt="${APP_NAME} logo" />
    <span class="print-brand-name">${APP_NAME}</span>
    <span class="print-brand-sep"></span>
    <span class="print-brand-title">${docTitle}</span>
  </div>`;

export const printBrandHeaderStyle = () => `
.print-brand{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff}
.print-brand-logo{width:28px;height:28px;object-fit:contain}
.print-brand-name{font-weight:800;color:#0f172a;letter-spacing:.02em;white-space:nowrap}
.print-brand-title{color:#475569;font-size:13px;font-weight:600;margin-left:auto;text-align:right}
.print-brand-sep{display:none}`;

// Pied de page supprimé à la demande : logo retiré du pied (reste uniquement en en-tête)
export const printBrandFooter = () => ``;

export const printBrandFooterStyle = () => `
.print-brand-footer{display:none!important}`;

export const printHead = (docTitle) => `
<meta charset="utf-8" />
<title>${APP_NAME} — ${docTitle}</title>
<link rel="icon" type="image/png" href="${APP_LOGO}" />
<link rel="apple-touch-icon" href="${APP_LOGO}" />`;
