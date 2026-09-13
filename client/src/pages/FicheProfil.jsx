import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtDate } from '../utils';
import { printHtml, printHead, printBrandHeader, printBrandHeaderStyle } from '../utils/printBranding';
import EmployePicker from '../components/EmployePicker';
import {
  IconUser, IconHome, IconBriefcase, IconShieldCheck, IconCalendarDays, IconMapPin,
  IconIdentification, IconGlobe, IconHeart, IconDroplet, IconPhone, IconSmartphone,
  IconEnvelope, IconTags, IconAward, IconCube, IconBuildingOffice, IconAcademicCap,
  IconStar, IconUsers, IconEye, IconCreditCard, IconBanknotes, IconUserCheck, IconPrinter,
} from '../components/icons';

function fmtMontant(v) {
  if (!v && v !== 0) return '—';
  const n = Number(v);
  return isNaN(n) ? String(v) : `${n.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
}

function FitIcon({ children, size = 20, color }) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, color, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ display: 'inline-flex', transform: `scale(${size / 20})`, transformOrigin: 'center' }}>{children}</span>
    </span>
  );
}

function Ligne({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-lg border px-3 py-2 transition hover:shadow-sm" style={{ borderColor: `${color}22`, background: 'var(--bg-card)' }}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
        <FitIcon size={12} color={color}><Icon /></FitIcon>{label}
      </p>
      <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value || '—'}</p>
    </div>
  );
}

function Section({ icon: Icon, title, color, soft, children }) {
  return (
    <div className="card p-5 fade-in" style={{ borderTop: `4px solid ${color}` }}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="icon-badge text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)`, width: 36, height: 36 }}>
          <FitIcon size={18} color="#fff"><Icon /></FitIcon>
        </span>
        <h3 className="text-sm font-extrabold uppercase tracking-wide" style={{ color }}>{title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

const SEC = {
  perso: { icon: IconUser, title: 'Informations Personnelles', color: '#6366f1', soft: '#eef2ff' },
  adresse: { icon: IconHome, title: 'Adresse & Contact', color: '#d97706', soft: '#fef3c7' },
  pro: { icon: IconBriefcase, title: 'Informations Professionnelles', color: '#0891b2', soft: '#cffafe' },
  sociale: { icon: IconShieldCheck, title: 'Informations Sociales', color: '#059669', soft: '#d1fae5' },
};

export default function FicheProfil() {
  const [id, setId] = useState('');
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) { setEmp(null); return; }
    setLoading(true);
    setErr('');
    api.employe(id).then(setEmp).catch((e) => { setErr(e.message); setEmp(null); }).finally(() => setLoading(false));
  }, [id]);

  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const imprimer = () => {
    if (!emp) return;
    const e = emp;
    const nom = esc(`${e.nom} ${e.prenom}`).trim();
    const dateDoc = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const heureDoc = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const badges = [];
    if (e.actif) badges.push({ label: 'Employé actif', color: '#059669' });
    else badges.push({ label: 'Inactif', color: '#dc2626' });
    if (e.sexe) badges.push({ label: e.sexe, color: e.sexe === 'Femme' ? '#db2777' : '#2563eb' });
    if (e.situation_familiale) {
      const c = { 'Célibataire': '#64748b', 'Marié(e)': '#059669', 'Divorcé(e)': '#d97706', 'Veuf(ve)': '#7c3aed' }[e.situation_familiale] || '#64748b';
      badges.push({ label: e.situation_familiale, color: c });
    }
    if (e.nationalite) badges.push({ label: e.nationalite, color: '#6366f1' });
    const badgeHtml = badges.map((b) => `<span class="f-badge" style="color:${b.color};border-color:${b.color}55">${esc(b.label)}</span>`).join('');

    const photoHtml = e.photo_url
      ? `<img class="f-photo" src="${esc(e.photo_url)}" alt="Photo" />`
      : `<span class="f-photo f-photo-init">${esc(String(e.prenom || e.nom || '?').slice(0, 1).toUpperCase())}</span>`;
    const chip = (label) => `<span class="f-chip">${esc(label)}</span>`;
    const grilleHtml = [
      e.rubrique ? chip(`Rubrique ${e.rubrique}`) : '',
      e.grade ? chip(`Grade ${e.grade}`) : '',
      e.classe ? chip(`Classe ${e.classe}`) : '',
      e.echelon ? chip(`Échelon ${e.echelon}`) : '',
    ].filter(Boolean).join('');

    const ligne = (label, value) => {
      const v = value === '' || value == null ? '—' : String(value);
      return `<div class="f-row"><span class="f-label">${esc(label)}</span><span class="f-value">${esc(v)}</span></div>`;
    };
    const sectionHtml = (title, color, rows) => `
        <section class="f-section">
          <div class="f-section-head" style="background:${color}"><span class="f-section-dot"></span>${esc(title)}</div>
          <div class="f-section-body">${(Array.isArray(rows) ? rows : [rows]).join('')}</div>
        </section>`;

    const ribAffiche = e.rib ? e.rib.replace(/(.{4})/g, '$1 ').trim() : '';

    const identite = `
      <div class="f-identity">
        <div class="f-identity-main">
          ${photoHtml}
          <div class="f-id-infos">
            <div class="f-name">${esc(e.nom)} ${esc(e.prenom)}</div>
            <div class="f-post">${esc(e.intitule_poste || '')}</div>
            <span class="f-mat">Mat. ${esc(e.matricule)}</span>
            <div class="f-badges">${badgeHtml}</div>
            ${grilleHtml ? `<div class="f-grille">${grilleHtml}</div>` : '<div class="f-zone">Rubrique / Grade / Classe / Échelon non renseignés</div>'}
          </div>
        </div>
        <div class="f-strip">
          <div><div class="k">Date de naissance</div><div class="v">${esc(fmtDate(e.date_naissance))}</div></div>
          <div><div class="k">Date d'embauche</div><div class="v">${esc(fmtDate(e.date_embauche))}</div></div>
          <div><div class="k">Années de service</div><div class="v">${e.annees_service != null ? esc(`${e.annees_service} an(s)`) : '—'}</div></div>
          <div><div class="k">Matricule</div><div class="v">Mat. ${esc(e.matricule)}</div></div>
        </div>
      </div>`;

    const feuille1 = `
      <div class="f-title-wrap">
        <h2 class="f-title">Fiche Signalétique</h2>
        <div class="f-title-ref"><b>${esc(nom)}</b>Document établi le ${dateDoc} à ${heureDoc}</div>
      </div>
      ${identite}
      ${sectionHtml('Informations Personnelles', 'var(--c-perso)', [
        ligne('Matricule', e.matricule),
        ligne('Nom', e.nom),
        ligne('Prénom', e.prenom),
        ligne('Date de naissance', fmtDate(e.date_naissance)),
        ligne('Lieu de naissance', e.lieu_naissance),
        ligne('Sexe', e.sexe),
        ligne('Nationalité', e.nationalite),
        ligne('Groupe sanguin', e.groupe_sanguin),
        ligne('Service militaire', e.service_militaire),
        ligne('CIN', e.cin),
        ligne("Date d'émission CIN", fmtDate(e.date_emission_cin)),
        ligne('Situation familiale', e.situation_familiale),
        ligne('Chef de famille', e.chef_famille),
        ligne('Enfants à charge', e.enfants_a_charge),
        ligne("Nombre d'enfants", e.nombre_enfants),
        ligne('Conjoint', e.conjoint_nom),
        ligne('Date naissance conjoint', fmtDate(e.conjoint_date_naissance)),
      ])}
      ${sectionHtml('Adresse & Contact', 'var(--c-adresse)', [
        ligne('Adresse', e.adresse),
        ligne('Rue', e.rue),
        ligne('Code postal', e.code_postal),
        ligne('Localité', e.localite),
        ligne('Gouvernorat', e.gouvernorat),
        ligne('Téléphone', e.telephone),
        ligne('GSM', e.gsm),
        ligne('E-mail', e.adresse_electronique),
      ])}
      ${sectionHtml('Informations Sociales', 'var(--c-sociale)', [
        ligne('N° CNAM', e.cnam),
        ligne('N° CNSS', e.cnss),
        ligne('Type de contrat', e.type_contrat),
      ])}`;

    const feuille2 = `
      ${sectionHtml('Informations Professionnelles', 'var(--c-pro)', [
        ligne("Intitulé du poste", e.intitule_poste),
        ligne("Niveau d'études", e.niveau_etudes),
        ligne('Diplôme', e.diplome),
        ligne("Date d'émission du diplôme", fmtDate(e.date_emission_diplome)),
        ligne('Catégorie professionnelle', e.categorie),
        ligne('Rubrique', e.rubrique),
        ligne('Grade', e.grade),
        ligne('Classe', e.classe),
        ligne('Échelon', e.echelon),
        ligne("Date d'embauche", fmtDate(e.date_embauche)),
        ligne('Salaire de base', fmtMontant(e.salaire_base)),
      ])}
      ${sectionHtml('Coordonnées Bancaires / RIB', 'var(--c-rib)', [
        ligne('Nom de la banque', e.banque),
        ligne('Titulaire du compte', e.titulaire_compte),
        ligne('Type de compte', e.type_compte),
        ligne('Numéro RIB (20 chiffres)', ribAffiche),
      ])}`;

    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8" />
${printHead(`Fiche Signalétique — ${nom}`)}
<base href="${window.location.origin}/" />
<style>
:root{
  --c-perso:#6366f1;--c-adresse:#d97706;--c-sociale:#059669;--c-pro:#0891b2;--c-rib:#7c3aed;
}
body{margin:0;color:#1e293b;font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:10.5pt;line-height:1.45;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
@media screen{body{background:#e2e8f0;padding:24px}
 .f-page{max-width:210mm;margin:0 auto}}
@page{size:A4 portrait;margin:13mm 12mm 15mm 12mm;@bottom-left{content:'XMator-RH — Fiche Signalétique';font-size:7.5pt;color:#64748b}@bottom-right{content:counter(page) ' / ' counter(pages);font-size:7.5pt;color:#64748b}}
.f-page{background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.35);padding:2mm}
${printBrandHeaderStyle()}
.f-title-wrap{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;border-bottom:2.5px solid #0f172a;padding:4px 2px 9px;margin-bottom:10px}
.f-title{margin:0;font-size:17pt;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#0f172a}
.f-title-ref{text-align:right;font-size:8pt;color:#475569}
.f-title-ref b{display:block;font-size:10.5pt;color:#0f172a}
.f-identity{border:1px solid #dbe3ee;border-radius:12px;overflow:hidden;background:linear-gradient(120deg,#1e3a8a,#2563eb 55%,#3b82f6);color:#fff}
.f-identity-main{display:flex;gap:16px;align-items:center;padding:16px}
.f-photo{width:86px;height:86px;border-radius:50%;object-fit:cover;flex:none;border:3px solid rgba(255,255,255,.85);box-shadow:0 4px 14px rgba(0,0,0,.3);background:rgba(255,255,255,.2)}
.f-photo-init{display:flex;align-items:center;justify-content:center;font-size:34pt;font-weight:800;color:#fff}
.f-id-infos{flex:1;min-width:0}
.f-name{font-size:15pt;font-weight:800;line-height:1.2}
.f-post{font-size:9.5pt;color:#dbeafe;margin-top:2px}
.f-mat{display:inline-block;margin-top:6px;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.2);font-family:'Courier New',monospace;font-weight:700;font-size:9pt}
.f-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.f-badge{padding:2px 9px;border-radius:999px;font-size:8pt;font-weight:700;background:#fff;border:1px solid;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.f-grille{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.f-chip{padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.18);font-size:8pt;font-weight:600}
.f-zone{font-size:8.5pt;font-style:italic;color:#dbeafe;margin-top:9px}
.f-strip{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(255,255,255,.25);background:rgba(15,23,42,.18)}
.f-strip>div{padding:8px 12px;border-right:1px solid rgba(255,255,255,.18)}
.f-strip>div:last-child{border-right:0}
.f-strip .k{font-size:6.8pt;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#bfdbfe}
.f-strip .v{font-size:9.5pt;font-weight:700;margin-top:2px}
.f-section{break-inside:avoid;margin-top:14px;border:1px solid #dbe3ee;border-radius:10px;overflow:hidden}
.f-section-head{display:flex;align-items:center;gap:8px;padding:7px 14px;color:#fff;font-weight:800;font-size:10pt;letter-spacing:.05em;text-transform:uppercase}
.f-section-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.9)}
.f-section-body{display:grid;grid-template-columns:1fr 1fr;background:#fff}
.f-row{display:flex;min-width:0;padding:5px 12px;border-bottom:1px solid #eef2f7;border-left:1px solid #eef2f7}
.f-row:nth-child(even){border-left:0}
.f-label{flex:none;width:38%;font-size:8pt;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:#64748b;padding-right:8px}
.f-value{flex:1;font-size:9.5pt;font-weight:600;color:#0f172a;overflow-wrap:anywhere;text-align:right}
.f-page-break{break-before:page}
.f-footer{margin-top:20px;padding-top:9px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;gap:8px;font-size:7.5pt;color:#64748b}
@media print{.f-page{box-shadow:none}}
</style>
</head><body>
${printBrandHeader('Fiche Signalétique')}
<div class="f-page">
${feuille1}
<div class="f-page-break">
${feuille2}
</div>
<div class="f-footer">
<span>XMator-RH — Fiche signalétique ${esc(nom)} · Mat. ${esc(e.matricule)}</span>
<span>Document généré le ${dateDoc} à ${heureDoc}</span>
</div>
</div>
</body></html>`;
    printHtml(html);
  };

  const badges = [];
  if (emp) {
    if (emp.actif) badges.push({ label: 'Employé actif', color: '#059669' });
    else badges.push({ label: 'Inactif', color: '#dc2626' });
    if (emp.sexe === 'Homme') badges.push({ icon: IconUser, label: 'Homme', color: '#2563eb' });
    else if (emp.sexe === 'Femme') badges.push({ icon: IconUser, label: 'Femme', color: '#db2777' });
    if (emp.situation_familiale) {
      const c = { 'Célibataire': '#64748b', 'Marié(e)': '#059669', 'Divorcé(e)': '#d97706', 'Veuf(ve)': '#7c3aed' }[emp.situation_familiale] || '#64748b';
      badges.push({ icon: IconHeart, label: emp.situation_familiale, color: c });
    }
    if (emp.nationalite) badges.push({ icon: IconGlobe, label: emp.nationalite, color: '#6366f1' });
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="card flex-1 p-4" style={{ borderTop: '4px solid var(--primary-600)' }}>
          <label className="label flex items-center gap-1.5"><FitIcon size={14} color="var(--primary-500)"><IconEye /></FitIcon> Consulter Profil Employé</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1"><EmployePicker value={id} onChange={setId} placeholder="Rechercher un employé (matricule, nom, prénom)" /></div>
            <button type="button" className="btn-primary shrink-0" disabled={!emp} onClick={imprimer} style={emp ? undefined : { opacity: 0.5 }}>
              <FitIcon size={15} color="#fff"><IconPrinter /></FitIcon> Imprimer en PDF
            </button>
            {id && <Link to={`/employes/${id}`} className="btn-secondary shrink-0">Voir congés & historique →</Link>}
          </div>
        </div>
      </div>

      {err && <p className="no-print rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">✕ {err}</p>}
      {loading && <p className="no-print py-8 text-center text-sm text-slate-500">Chargement de la fiche…</p>}
      {!loading && !err && !emp && (
        <p className="no-print py-8 text-center text-sm text-slate-500">Sélectionnez un employé pour afficher sa fiche de renseignements complète.</p>
      )}

      {!loading && emp && (
        <div className="fiche-print">
          <div className="card overflow-hidden p-0 shadow-md" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)' }}>
            <div className="flex flex-wrap items-center gap-5 p-6">
              {emp.photo_url
                ? <img src={emp.photo_url} alt="Photo" className="h-24 w-24 rounded-2xl object-cover shadow-lg ring-4 ring-white/30" />
                : <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/20 text-4xl font-extrabold text-white shadow-lg ring-4 ring-white/30">
                    {String(emp.prenom || emp.nom || '?').slice(0, 1).toUpperCase()}
                  </div>}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100">Fiche Signalétique</p>
                <h2 className="truncate text-2xl font-black text-white">{emp.nom} {emp.prenom}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-blue-100">
                  <span className="rounded-lg bg-white/20 px-2 py-0.5 font-mono text-xs font-bold text-white">Mat. {emp.matricule}</span>
                  {emp.intitule_poste && <span>{emp.intitule_poste}</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(emp.rubrique || emp.grade || emp.classe || emp.echelon) ? (
                    <>
                      {emp.rubrique && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white"><FitIcon size={11} color="#fff"><IconCube /></FitIcon>Rubrique {emp.rubrique}</span>}
                      {emp.grade && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white"><FitIcon size={11} color="#fff"><IconAward /></FitIcon>Grade {emp.grade}</span>}
                      {emp.classe && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white"><FitIcon size={11} color="#fff"><IconAcademicCap /></FitIcon>Classe {emp.classe}</span>}
                      {emp.echelon && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white"><FitIcon size={11} color="#fff"><IconStar /></FitIcon>Échelon {emp.echelon}</span>}
                    </>
                  ) : (
                    <span className="text-xs italic text-blue-100/80">Rubrique / Grade / Classe / Échelon non renseignés</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {badges.map((b2) => (
                  <span key={b2.label} className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-bold shadow" style={{ color: b2.color }}>
                    {b2.icon && <FitIcon size={13} color={b2.color}><b2.icon /></FitIcon>}
                    {b2.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-white/20 bg-white/10 text-white sm:grid-cols-4">
              {[
                ['Date de naissance', fmtDate(emp.date_naissance), IconCalendarDays],
                ["Date d'embauche", fmtDate(emp.date_embauche), IconCalendarDays],
                ['Années de service', emp.annees_service != null ? `${emp.annees_service} an(s)` : '—', IconStar],
                ['Matricule', emp.matricule, IconIdentification],
              ].map(([l, v, Ic]) => (
                <div key={l} className="bg-[#2563eb]/60 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">{l}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-sm font-bold"><FitIcon size={13} color="#fff"><Ic /></FitIcon>{v}</p>
                </div>
              ))}
            </div>
          </div>

          <Section {...SEC.perso}>
            <Ligne icon={IconIdentification} label="Matricule" value={emp.matricule} color={SEC.perso.color} />
            <Ligne icon={IconUser} label="Nom" value={emp.nom} color={SEC.perso.color} />
            <Ligne icon={IconUser} label="Prénom" value={emp.prenom} color={SEC.perso.color} />
            <Ligne icon={IconCalendarDays} label="Date de naissance" value={fmtDate(emp.date_naissance)} color={SEC.perso.color} />
            <Ligne icon={IconMapPin} label="Lieu de naissance" value={emp.lieu_naissance} color={SEC.perso.color} />
            <Ligne icon={IconUser} label="Sexe" value={emp.sexe} color={SEC.perso.color} />
            <Ligne icon={IconGlobe} label="Nationalité" value={emp.nationalite} color={SEC.perso.color} />
            <Ligne icon={IconDroplet} label="Groupe sanguin" value={emp.groupe_sanguin} color={SEC.perso.color} />
            <Ligne icon={IconShieldCheck} label="Service militaire" value={emp.service_militaire} color={SEC.perso.color} />
            <Ligne icon={IconIdentification} label="CIN" value={emp.cin} color={SEC.perso.color} />
            <Ligne icon={IconCalendarDays} label="Date d'émission CIN" value={fmtDate(emp.date_emission_cin)} color={SEC.perso.color} />
            <Ligne icon={IconHeart} label="Situation familiale" value={emp.situation_familiale} color={SEC.perso.color} />
            <Ligne icon={IconUsers} label="Nombre d'enfants" value={emp.nombre_enfants} color={SEC.perso.color} />
            <Ligne icon={IconHeart} label="Conjoint" value={emp.conjoint_nom} color={SEC.perso.color} />
            <Ligne icon={IconCalendarDays} label="Date naissance conjoint" value={fmtDate(emp.conjoint_date_naissance)} color={SEC.perso.color} />
          </Section>

          <Section {...SEC.adresse}>
            <Ligne icon={IconHome} label="Adresse" value={emp.adresse} color={SEC.adresse.color} />
            <Ligne icon={IconMapPin} label="Rue" value={emp.rue} color={SEC.adresse.color} />
            <Ligne icon={IconTags} label="Code postal" value={emp.code_postal} color={SEC.adresse.color} />
            <Ligne icon={IconMapPin} label="Localité" value={emp.localite} color={SEC.adresse.color} />
            <Ligne icon={IconMapPin} label="Gouvernorat" value={emp.gouvernorat} color={SEC.adresse.color} />
            <Ligne icon={IconPhone} label="Téléphone" value={emp.telephone} color={SEC.adresse.color} />
            <Ligne icon={IconSmartphone} label="GSM" value={emp.gsm} color={SEC.adresse.color} />
            <Ligne icon={IconEnvelope} label="E-mail" value={emp.adresse_electronique} color={SEC.adresse.color} />
          </Section>

          <Section {...SEC.sociale}>
            <Ligne icon={IconShieldCheck} label="N° CNAM" value={emp.cnam} color={SEC.sociale.color} />
            <Ligne icon={IconIdentification} label="N° CNSS" value={emp.cnss} color={SEC.sociale.color} />
            <Ligne icon={IconBriefcase} label="Type de contrat" value={emp.type_contrat} color={SEC.sociale.color} />
          </Section>

          <div className="page-break-before-pro">
            <Section {...SEC.pro}>
            <Ligne icon={IconBriefcase} label="Intitulé du poste" value={emp.intitule_poste} color={SEC.pro.color} />
            <Ligne icon={IconAcademicCap} label="Niveau d'études" value={emp.niveau_etudes} color={SEC.pro.color} />
            <Ligne icon={IconAward} label="Diplôme" value={emp.diplome} color={SEC.pro.color} />
            <Ligne icon={IconCalendarDays} label="Date d'émission du diplôme" value={fmtDate(emp.date_emission_diplome)} color={SEC.pro.color} />
            <Ligne icon={IconBuildingOffice} label="Catégorie professionnelle" value={emp.categorie} color={SEC.pro.color} />
            <Ligne icon={IconCube} label="Rubrique" value={emp.rubrique} color={SEC.pro.color} />
            <Ligne icon={IconAward} label="Grade" value={emp.grade} color={SEC.pro.color} />
            <Ligne icon={IconAcademicCap} label="Classe" value={emp.classe} color={SEC.pro.color} />
            <Ligne icon={IconStar} label="Échelon" value={emp.echelon} color={SEC.pro.color} />
            <Ligne icon={IconCalendarDays} label="Date d'embauche" value={fmtDate(emp.date_embauche)} color={SEC.pro.color} />
            <Ligne icon={IconBanknotes} label="Salaire de base" value={fmtMontant(emp.salaire_base)} color={SEC.pro.color} />
            </Section>
          </div>

          <Section icon={IconCreditCard} title="Coordonnées Bancaires / RIB" color="#7c3aed" soft="#ede9fe">
            <Ligne icon={IconBuildingOffice} label="Nom de la banque" value={emp.banque} color="#7c3aed" />
            <Ligne icon={IconUserCheck} label="Titulaire du Compte" value={emp.titulaire_compte} color="#7c3aed" />
            <Ligne icon={IconCreditCard} label="Type de compte" value={emp.type_compte} color="#7c3aed" />
            <Ligne icon={IconCreditCard} label="Numéro RIB (20 chiffres)" value={emp.rib ? emp.rib.replace(/(.{4})/g, '$1 ').trim() : ''} color="#7c3aed" />
          </Section>
        </div>
      )}
    </div>
  );
}
