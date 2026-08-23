export function fmtDate(iso) {
  if (!iso) return '—';
  const parts = iso.split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function debutMois() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function fmtJours(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s.replace('.', ',');
}

export const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
