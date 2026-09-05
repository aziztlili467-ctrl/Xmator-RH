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
    const node = document.querySelector('.fiche-print');
    if (!node) { alert('Fiche introuvable, sélectionnez un employé.'); return; }
    // Réutilise les stylesheets réels de l'application (Tailwind + index.css) :
    // la fenêtre d'impression applique exactement les mêmes classes que l'écran.
    const links = Array.from(document.styleSheets)
      .map((s) => s.href)
      .filter(Boolean)
      .map((href) => `<link rel="stylesheet" href="${href}" />`)
      .join('\n');
    const nom = esc(`${emp.nom} ${emp.prenom}`).trim();
    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8" />
${printHead(`Fiche Signalétique — ${nom}`)}
<base href="${window.location.origin}/" />
${links}
<style>
@page{size:A4 portrait;margin:0}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
html,body{margin:0;padding:0}
body{background:#f1f5f9;color:#1e293b;font-family:'Inter',system-ui,sans-serif;padding-top:56px}
#printbar{position:fixed;top:0;right:0;left:0;z-index:100;display:flex;justify-content:center;gap:.5rem;padding:.75rem;background:#0f172a;box-shadow:0 .25rem .75rem rgba(0,0,0,.3)}
#printbar button{cursor:pointer;border:0;border-radius:.5rem;padding:.5rem 1.25rem;background:#2563eb;color:#fff;font:700 .875rem/1.2 system-ui,sans-serif}
#printbar button:hover{background:#1d4ed8}
.sheet{max-width:210mm;margin:0 auto;padding:1rem}
${printBrandHeaderStyle()}
.print-footer{display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:1.25rem;padding-top:.75rem;border-top:1px solid #e2e8f0;color:#64748b;font-size:.75rem}
.print-footer-logo{width:1rem;height:1rem;object-fit:contain}
.print-footer-sep{width:1px;height:.875rem;background:#cbd5e1}
.fiche-print{width:100%;overflow-wrap:break-word}
 @media print{
  #printbar{display:none!important}
  body{background:#fff;padding:9mm 8mm 8mm 8mm}
  .sheet{padding:0;max-width:none}
  .fiche-print > * + *{margin-top:.75rem!important}
  .fiche-print .card{page-break-inside:auto;break-inside:auto;box-shadow:none!important;border-radius:.5rem!important}
  /* En-tête : photo | identité sur une rangée ; badges sur leur propre rangée pleine largeur */
  .fiche-print .card.overflow-hidden > .flex{flex-wrap:wrap!important;align-items:center}
  .fiche-print .card.overflow-hidden > .flex > .flex.flex-wrap{flex-basis:100%!important;padding-top:.125rem}
  /* Nom : sur une ligne si possible, sinon retour "intelligent" (jamais un mot par ligne) */
  .fiche-print h2{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;font-size:1.25rem!important;line-height:1.35!important}
  .fiche-print .truncate{white-space:normal!important;overflow-wrap:anywhere}
  /* Badges : rangées automatiques */
  .fiche-print .flex.flex-wrap{gap:.375rem!important}
  /* Rubrique / Grade / Classe / Échelon : une seule rangée horizontale (rendu agréable) */
  .fiche-print .mt-2.flex.flex-wrap.gap-1\.5{flex-wrap:nowrap!important;gap:.3125rem!important;margin-top:.5rem!important}
  .fiche-print .mt-2.flex.flex-wrap.gap-1\.5 > span{white-space:nowrap;padding:.25rem .55rem!important;font-size:.625rem!important;line-height:1.2}
  /* Espacements resserrés (unités relatives) */
  .fiche-print .p-6{padding:1.125rem 1.25rem!important}
  .fiche-print .gap-5{gap:.875rem!important}
  .fiche-print .p-5{padding:.75rem .875rem!important}
  .fiche-print .mb-4{margin-bottom:.5rem!important;page-break-after:auto!important;break-after:auto!important}
  /* Tuiles : 3 colonnes desktop / statistiques : 4 colonnes */
  .fiche-print .card>.grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:.375rem!important}
  .fiche-print .grid.gap-px{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:1px!important}
  .fiche-print .rounded-lg.border{padding:.375rem .625rem!important}
  .fiche-print .icon-badge{width:2rem;height:2rem}
  /* Saut de page demandé : page 1 s'arrête à INFORMATIONS SOCIALES, page 2 commence à INFORMATIONS PROFESSIONNELLES avec son cadre décalé de 7mm */
  .page-break-before-pro{break-before:page;page-break-before:always;margin-top:0!important;padding-top:7mm}
  .page-break-before-pro .card{break-inside:avoid;page-break-inside:avoid}
}
</style>
</head><body>
<div id="printbar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
${printBrandHeader('Fiche Signalétique')}
<div class="sheet">${node.outerHTML}</div>
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
            <Ligne icon={IconUserCheck} label="Indemnité de présence" value={fmtMontant(emp.indemnite_presence)} color={SEC.pro.color} />
            <Ligne icon={IconMapPin} label="Indemnité de transport" value={fmtMontant(emp.indemnite_transport)} color={SEC.pro.color} />
            <Ligne icon={IconBriefcase} label="Indemnité de fonction" value={fmtMontant(emp.indemnite_fonction)} color={SEC.pro.color} />
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
