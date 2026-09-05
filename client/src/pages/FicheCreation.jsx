import { useEffect, useState } from 'react';
import { api } from '../api';
import EmployePicker from '../components/EmployePicker';
import { useAuth } from '../AuthContext';
import {
  IconPlus, IconEdit, IconEye, IconUser, IconHome, IconBriefcase, IconShieldCheck,
  IconCalendarDays, IconMapPin, IconIdentification, IconGlobe, IconHeart, IconDroplet,
  IconPhone, IconSmartphone, IconEnvelope, IconTags, IconAward, IconCube, IconBuildingOffice,
  IconAcademicCap, IconStar, IconUpload, IconUsers, IconCreditCard, IconBanknotes, IconUserCheck,
  IconTrash, IconSettings,
} from '../components/icons';

// Redimensionne une icône vectorielle (20px de base) dans une boîte de taille donnée, colorée.
function FitIcon({ children, size = 20, color }) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, color, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ display: 'inline-flex', transform: `scale(${size / 20})`, transformOrigin: 'center' }}>{children}</span>
    </span>
  );
}

const TABS = [
  { id: 'nouvelle', label: 'Nouvelle Fiche Employé', icon: IconPlus, color: '#10b981' },
  { id: 'modifier', label: 'Modifier Profil Employé', icon: IconEdit, color: '#d97706' },
  { id: 'consulter', label: 'Consulter Profil Employé', icon: IconEye, color: '#2563eb' },
];

// Map icônes nom → composant (noms utilisés dans la config du modèle localStorage)
const ICONS = {
  user: IconUser, home: IconHome, briefcase: IconBriefcase, shield: IconShieldCheck,
  calendar: IconCalendarDays, pin: IconMapPin, id: IconIdentification, globe: IconGlobe,
  heart: IconHeart, droplet: IconDroplet, phone: IconPhone, phone2: IconSmartphone,
  mail: IconEnvelope, tags: IconTags, award: IconAward, cube: IconCube,
  building: IconBuildingOffice, school: IconAcademicCap, star: IconStar,
  card: IconCreditCard, bank: IconBanknotes, check: IconUserCheck, users: IconUsers,
};
const PALETTE = [
  { color: '#6366f1', soft: '#eef2ff' },
  { color: '#d97706', soft: '#fef3c7' },
  { color: '#059669', soft: '#d1fae5' },
  { color: '#0891b2', soft: '#cffafe' },
  { color: '#db2777', soft: '#fce7f3' },
  { color: '#7c3aed', soft: '#ede9fe' },
  { color: '#dc2626', soft: '#fee2e2' },
];

const SEXES = ['Homme', 'Femme'];
const SITUATIONS = ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)'];
const GRUPES_SANGUINS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SERVICES_MILITAIRES = ['Accompli', 'Non Accompli', 'Dispensé'];
const NIVEAUX_ETUDES = ['Primaire', 'Secondaire', 'Universitaire', 'Formation Professionnelle'];
const TYPES_CONTRAT = ['CDI (Titulaire)', 'CDD', 'CIVP (SIVP)', "Contrat d'apprentissage"];
const TYPES_COMPTE = ['COMPTE COURANT', 'COMPTE ÉPARGNE', 'D17'];
const BANQUES = [
  'BIAT – Banque Internationale Arabe de Tunisie',
  'BNA – Banque Nationale Agricole',
  'STB – Société Tunisienne de Banque',
  'BH Bank – Banque de l\'Habitat',
  'Attijari Bank',
  'Amen Bank',
  'UIB – Union Internationale de Banques',
  'BT – Banque de Tunisie',
  'ATB – Arab Tunisian Bank',
  'UBCI – Union Bancaire pour le Commerce et l\'Industrie',
  'Banque Zitouna',
  'Al Baraka Bank',
  'Wifack International Bank',
  'QNB – Qatar National Bank',
  'BTK – Banque Tuniso-Koweïtienne',
  'BTE – Banque de Tunisie et des Émirats',
  'TSB – Tunisian Saudi Bank',
  'BTL – Banque Tuniso-Libyenne',
  'La Poste Tunisienne',
];
const NATIONALITES_PRESETS = ['Tunisienne', 'Algérienne', 'Marocaine', 'Libyenne', 'Française'];
const AUTRE_LABEL = 'Autre (... définir)';

const FORM_VIDE = {
  matricule: '', nom: '', prenom: '', categorie_id: '',
  intitule_poste: '',
  rubrique: '', grade: '', classe: '', echelon: '',
  date_naissance: '', lieu_naissance: '', sexe: '', nationalite: '', groupe_sanguin: '',
  cin: '', date_emission_cin: '', service_militaire: '', cnss: '',
  date_embauche: '', adresse: '', telephone: '',
  situation_familiale: '', nombre_enfants: 0,
  conjoint_nom: '', conjoint_date_naissance: '', enfants_details: '[]',
  niveau_etudes: '', diplome: '', date_emission_diplome: '',
  cnam: '', type_contrat: '', banque: '', titulaire_compte: '', type_compte: '', rib: '',
  salaire_base: '', indemnite_presence: '', indemnite_transport: '', indemnite_fonction: '',
  rue: '', code_postal: '', localite: '', gouvernorat: '',
  gsm: '', adresse_electronique: '', actif: 1,
};

const KEY_SECTIONS = 'fiche_creation_sections_v1';
const KEY_CUSTOM = 'fiche_creation_custom_v1';
const customStore = {
  load: () => { try { return JSON.parse(localStorage.getItem(KEY_CUSTOM) || '{}'); } catch { return {}; } },
  save: (obj) => { try { localStorage.setItem(KEY_CUSTOM, JSON.stringify(obj)); } catch {} },
};

function fieldicon(id) {
  return ({
    matricule: IconIdentification, nom: IconUser, prenom: IconUser,
    date_naissance: IconCalendarDays, lieu_naissance: IconMapPin, sexe: IconUser,
    nationalite: IconGlobe, groupe_sanguin: IconDroplet, cin: IconIdentification,
    date_emission_cin: IconCalendarDays, situation_familiale: IconHeart,
    nombre_enfants: IconUsers, conjoint_nom: IconHeart, conjoint_date_naissance: IconCalendarDays,
    adresse: IconHome, rue: IconMapPin, code_postal: IconTags, localite: IconMapPin,
    gouvernorat: IconMapPin, telephone: IconPhone, gsm: IconSmartphone,
    adresse_electronique: IconEnvelope, categorie_id: IconBuildingOffice,
    rubrique: IconCube, grade: IconAward, classe: IconAcademicCap, echelon: IconStar,
    date_embauche: IconCalendarDays, cnss: IconIdentification, service_militaire: IconShieldCheck,
    niveau_etudes: IconAcademicCap, diplome: IconAward, date_emission_diplome: IconCalendarDays,
    cnam: IconShieldCheck, type_contrat: IconBriefcase, banque: IconBuildingOffice, titulaire_compte: IconUserCheck, type_compte: IconCreditCard, rib: IconCreditCard,
    salaire_base: IconBanknotes, indemnite_presence: IconUserCheck, indemnite_transport: IconMapPin, indemnite_fonction: IconBriefcase,
  })[id] || IconUser;
}

function iconNameFor(id) {
  return ({
    matricule: 'id', nom: 'user', prenom: 'user',
    date_naissance: 'calendar', lieu_naissance: 'pin', sexe: 'user',
    nationalite: 'globe', groupe_sanguin: 'droplet', cin: 'id',
    date_emission_cin: 'calendar', situation_familiale: 'heart',
    nombre_enfants: 'users', conjoint_nom: 'heart', conjoint_date_naissance: 'calendar',
    adresse: 'home', rue: 'pin', code_postal: 'tags', localite: 'pin',
    gouvernorat: 'pin', telephone: 'phone', gsm: 'phone2',
    adresse_electronique: 'mail', categorie_id: 'building',
    rubrique: 'cube', grade: 'award', classe: 'school', echelon: 'star',
    date_embauche: 'calendar', cnss: 'id', service_militaire: 'shield',
    niveau_etudes: 'school', diplome: 'award', date_emission_diplome: 'calendar',
    cnam: 'shield', type_contrat: 'briefcase', banque: 'building', titulaire_compte: 'check', type_compte: 'card', rib: 'card',
    salaire_base: 'bank', indemnite_presence: 'check', indemnite_transport: 'pin', indemnite_fonction: 'briefcase',
  })[id] || 'user';
}

function FieldFrame({ children, accent, soft }) {
  return (
    <div className="rounded-xl border transition hover:shadow-sm" style={{ borderColor: `${accent}33`, background: `${soft}66` }}>
      {children}
    </div>
  );
}

function champ({ form, setForm, id, label, icon, accent, soft, type = 'text', placeholder, options, required }) {
  const Icon = icon || IconUser;
  return (
    <FieldFrame accent={accent} soft={soft}>
      <div className="p-3">
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          <FitIcon size={14} color={accent}><Icon /></FitIcon>
          {label}
        </label>
        {type === 'select' ? (
          <select className="input" value={form[id] ?? ''} required={required} onChange={(e) => setForm({ ...form, [id]: e.target.value })}>
            <option value="">— Sélectionner —</option>
            {(options || []).map((o) => typeof o === 'object' ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            className="input"
            type={type}
            value={form[id] ?? ''}
            placeholder={placeholder || label}
            onChange={(e) => setForm({ ...form, [id]: e.target.value })}
          />
        )}
      </div>
    </FieldFrame>
  );
}

const CHAMPS = {
  perso: [
    { id: 'matricule', label: 'Matricule *', required: true },
    { id: 'nom', label: 'Nom *', required: true },
    { id: 'prenom', label: 'Prénom *', required: true },
    { id: 'date_naissance', label: 'Date de naissance', type: 'date' },
    { id: 'lieu_naissance', label: 'Lieu de naissance' },
    { id: 'sexe', label: 'Sexe', type: 'select', options: SEXES },
    { id: 'nationalite', label: 'Nationalité' },
    { id: 'groupe_sanguin', label: 'Groupe sanguin', type: 'select', options: GRUPES_SANGUINS },
    { id: 'service_militaire', label: 'Service militaire', type: 'select', options: SERVICES_MILITAIRES },
    { id: 'cin', label: 'CIN' },
    { id: 'date_emission_cin', label: "Date d'émission CIN", type: 'date' },
    { id: 'situation_familiale', label: 'Situation familiale', type: 'select', options: SITUATIONS },
    { id: 'nombre_enfants', label: "Nombre d'enfants", type: 'number' },
    { id: 'conjoint_nom', label: 'Conjoint' },
    { id: 'conjoint_date_naissance', label: 'Date naissance conjoint', type: 'date' },
  ],
  adresse: [
    { id: 'adresse', label: 'Adresse' },
    { id: 'rue', label: 'Rue' },
    { id: 'code_postal', label: 'Code postal' },
    { id: 'localite', label: 'Localité' },
    { id: 'gouvernorat', label: 'Gouvernorat' },
    { id: 'telephone', label: 'Téléphone' },
    { id: 'gsm', label: 'GSM' },
    { id: 'adresse_electronique', label: 'E-mail' },
  ],
  pro: [
    { id: 'intitule_poste', label: 'Intitulé du poste' },
    { id: 'niveau_etudes', label: "Niveau d'études", type: 'select', options: NIVEAUX_ETUDES },
    { id: 'diplome', label: 'Diplôme' },
    { id: 'date_emission_diplome', label: "Date d'émission du diplôme", type: 'date' },
    { id: 'categorie_id', label: 'Catégorie professionnelle *', type: 'select', required: true },
    { id: 'rubrique', label: 'Rubrique', type: 'select' },
    { id: 'grade', label: 'Grade', type: 'select' },
    { id: 'classe', label: 'Classe', type: 'select' },
    { id: 'echelon', label: 'Échelon', type: 'select' },
    { id: 'date_embauche', label: "Date d'embauche", type: 'date' },
    { id: 'salaire_base', label: 'Salaire de base (DT)' },
    { id: 'indemnite_presence', label: 'Indemnité de présence (DT)' },
    { id: 'indemnite_transport', label: 'Indemnité de transport (DT)' },
    { id: 'indemnite_fonction', label: 'Indemnité de fonction (DT)' },
  ],
  sociale: [
    { id: 'cnam', label: 'N° CNAM' },
    { id: 'cnss', label: 'N° CNSS' },
    { id: 'type_contrat', label: 'Type de contrat', type: 'select', options: TYPES_CONTRAT },
  ],
};

const SECTION_BASES = [
  { id: 'perso', title: 'Informations Personnelles', iconName: 'user', color: '#6366f1', soft: '#eef2ff' },
  { id: 'adresse', title: 'Adresse & Contact', iconName: 'home', color: '#d97706', soft: '#fef3c7' },
  { id: 'sociale', title: 'Informations Sociales', iconName: 'shield', color: '#059669', soft: '#d1fae5' },
  { id: 'pro', title: 'Informations Professionnelles', iconName: 'briefcase', color: '#0891b2', soft: '#cffafe' },
];

function defaultSections() {
  return SECTION_BASES.map((s) => ({
    ...s,
    champs: (CHAMPS[s.id] || []).map((c) => ({ ...c, iconName: iconNameFor(c.id) })),
  }));
}

function IconBtn({ icon: Icon, title, onClick, danger, tone, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:shadow-sm"
      style={{
        borderColor: danger ? '#dc262655' : 'var(--border)',
        background: danger ? '#fee2e2' : 'var(--bg-card)',
        color: danger ? '#dc2626' : (tone || 'var(--text-secondary)'),
      }}
    >
      <FitIcon size={13} color={danger ? '#dc2626' : (tone || 'var(--text-secondary)')}><Icon /></FitIcon>
      {children}
    </button>
  );
}

export default function FicheCreation() {
  const { user } = useAuth();
  const estAdmin = user?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState('nouvelle');
  const [activeFiche, setActiveFiche] = useState(0);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(() => ({ ...FORM_VIDE, ...customStore.load() }));
  const [editId, setEditId] = useState('');
  const [viewData, setViewData] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoMsg, setPhotoMsg] = useState('');
  const [grid, setGrid] = useState([]);
  const [grilleMatch, setGrilleMatch] = useState(null);

  // ----- Mode Paramètres (personalisation de la fiche, admin) -----
  const [parametres, setParametres] = useState(false);
  const [sections, setSections] = useState(null);
  const [editSection, setEditSection] = useState(null);
  const [editChamp, setEditChamp] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [addChampSection, setAddChampSection] = useState(0);
  const [dragSi, setDragSi] = useState(null);
  const [overSi, setOverSi] = useState(null);
  const [tmpSection, setTmpSection] = useState({ title: '', iconName: 'user' });
  const [tmpChamp, setTmpChamp] = useState({ label: '', type: 'text', options: '', required: false, iconName: 'user' });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY_SECTIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((s) => s && s.title && Array.isArray(s.champs))) {
          setSections(parsed);
          return;
        }
      }
    } catch {}
    setSections(defaultSections());
  }, []);

  useEffect(() => {
    if (!sections) return;
    try { localStorage.setItem(KEY_SECTIONS, JSON.stringify(sections)); } catch {}
  }, [sections]);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories || r || [])).catch(() => {});
    api.grilleSalaire().then((r) => setGrid(r || [])).catch(() => setGrid([]));
  }, []);
  useEffect(() => {
    if (!grid.length || !form.grade || !form.classe || !form.echelon) { setGrilleMatch(null); return; }
    const m = grid.find((g) => g.grade === form.grade && String(g.classe) === String(form.classe) && String(g.echelon) === String(form.echelon));
    setGrilleMatch(m || null);
    if (m) {
      setForm((f) => {
        if (f.rubrique !== m.rubrique || String(f.salaire_base) !== String(m.valeur)) {
          return { ...f, rubrique: m.rubrique, salaire_base: String(m.valeur) };
        }
        return f;
      });
    }
  }, [form.grade, form.classe, form.echelon, grid]);
  useEffect(() => {
    if (activeTab === 'consulter' && editId) api.employe(editId).then(setViewData).catch(() => setViewData(null));
    if (activeTab === 'modifier' && editId) api.employe(editId).then((d) => setForm({ ...FORM_VIDE, ...d, actif: d.actif })).catch(() => setErr('Employé introuvable.'));
  }, [editId, activeTab]);

  const newForm = () => ({ ...FORM_VIDE, ...customStore.load() });
  const setFieldVal = (id, value) => {
    setForm((f) => {
      const nf = { ...f, [id]: value };
      const store = {};
      for (const [k, v] of Object.entries(nf)) if (k.startsWith('champ_')) store[k] = v;
      customStore.save(store);
      return nf;
    });
  };
  const pruneCustom = (id) => {
    if (!String(id).startsWith('champ_')) return;
    setForm((f) => {
      const { [id]: _del, ...rest } = f;
      const store = {};
      for (const [k, v] of Object.entries(rest)) if (k.startsWith('champ_')) store[k] = v;
      customStore.save(store);
      return rest;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      if (activeTab === 'nouvelle') {
        await api.createEmploye(form);
        setMsg('Fiche créée avec succès');
        setForm(newForm());
      } else if (activeTab === 'modifier') {
        if (!editId) return setErr('Choisissez un employé');
        await api.updateEmploye(editId, form);
        setMsg('Profil modifié');
        setViewData(null);
      }
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const doUploadPhoto = async () => {
    const mat = viewData?.matricule || form.matricule;
    if (!mat || !photoFile) return setPhotoMsg('Choisissez un fichier');
    setPhotoMsg('Upload...');
    try {
      await api.uploadPhoto(mat, photoFile);
      setPhotoMsg('Photo enregistrée (webp)');
      if (viewData) { const d = await api.employe(viewData.id); setViewData(d); }
    } catch (e2) {
      setPhotoMsg(e2.message);
    }
  };

  const sectionActive = sections?.[activeFiche]?.id || 'perso';
  const section = sections?.[activeFiche];
  const sectionIcon = section ? (ICONS[section.iconName] || IconUser) : IconUser;

  const renderFieldBody = (c, accent, soft) => {
    if (c.id === 'nationalite') {
      const val = form.nationalite || '';
      const isAutre = val && !NATIONALITES_PRESETS.includes(val);
      const selectValue = isAutre ? AUTRE_LABEL : val;
      const Icon = fieldicon('nationalite');
      return (
        <FieldFrame accent={accent} soft={soft}>
          <div className="p-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              <FitIcon size={14} color={accent}><Icon /></FitIcon>
              Nationalité
            </label>
            <select
              className="input"
              value={selectValue}
              onChange={(e) => setForm({ ...form, nationalite: e.target.value === AUTRE_LABEL ? (isAutre ? val : '') : e.target.value })}
            >
              <option value="">— Sélectionner —</option>
              {NATIONALITES_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value={AUTRE_LABEL}>{AUTRE_LABEL}</option>
            </select>
            {(isAutre || selectValue === AUTRE_LABEL) && (
              <input
                className="input mt-2"
                placeholder="Précisez la nationalité…"
                value={isAutre ? val : ''}
                onChange={(e) => setForm({ ...form, nationalite: e.target.value })}
              />
            )}
          </div>
        </FieldFrame>
      );
    }
    if (c.id.startsWith('champ_')) {
      const Icon = ICONS[c.iconName] || IconUser;
      return (
        <FieldFrame accent={accent} soft={soft}>
          <div className="p-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              <FitIcon size={14} color={accent}><Icon /></FitIcon>
              {c.label}
            </label>
            {c.type === 'select' ? (
              <select className="input" value={form[c.id] ?? ''} onChange={(e) => setFieldVal(c.id, e.target.value)}>
                <option value="">— Sélectionner —</option>
                {(c.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className="input"
                type={c.type || 'text'}
                value={form[c.id] ?? ''}
                placeholder={c.label}
                onChange={(e) => setFieldVal(c.id, e.target.value)}
              />
            )}
          </div>
        </FieldFrame>
      );
    }
    return champ({
      form, setForm,
      id: c.id, label: c.label,
      icon: ICONS[c.iconName] || fieldicon(c.id),
      accent, soft,
      type: c.type || 'text',
      placeholder: c.label,
      required: c.required,
      options: c.id === 'categorie_id'
        ? categories.map((cat) => ({ value: cat.id, label: cat.libelle }))
        : c.id === 'rubrique'
          ? [...new Set(grid.map((g) => g && g.rubrique).filter(Boolean))].sort()
          : c.id === 'grade'
            ? [...new Set(grid.filter((g) => g && (!form.rubrique || g.rubrique === form.rubrique)).map((g) => g.grade).filter(Boolean))].sort()
            : c.id === 'classe'
              ? [...new Set(grid.filter((g) => g && (!form.rubrique || g.rubrique === form.rubrique) && (!form.grade || g.grade === form.grade)).map((g) => g.classe).filter(Boolean))].sort()
              : c.id === 'echelon'
                ? [...new Set(grid.filter((g) => g && (!form.rubrique || g.rubrique === form.rubrique) && (!form.grade || g.grade === form.grade) && (form.classe === '' || form.classe === undefined || String(g.classe) === String(form.classe))).map((g) => g.echelon).filter(Boolean))].sort()
                : c.options,
    });
  };

  const renderChamp = (c) => renderFieldBody(c, section.color, section.soft);

  const tabPicker = ({ value, tab }) => (
    <button
      onClick={() => { setActiveTab(tab.id); setEditId(''); setViewData(null); setForm(newForm()); setMsg(''); setErr(''); setActiveFiche(0); }}
      className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
      style={value === tab.id
        ? { background: `linear-gradient(135deg, ${tab.color}, ${tab.color}cc)`, color: '#fff', boxShadow: `0 4px 12px ${tab.color}40` }
        : { border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)' }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={value === tab.id ? { background: 'rgba(255,255,255,0.22)' } : { background: `${tab.color}14`, color: tab.color }}
      >
        <FitIcon size={14}><tab.icon /></FitIcon>
      </span>
      {tab.label}
    </button>
  );

  const b = (txt) => (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1" style={{ background: `${txt.color}18`, color: txt.color, borderColor: `${txt.color}55` }}>
      <FitIcon size={13} color={txt.color}><txt.icon /></FitIcon>
      {txt.label}
    </span>
  );

  const sexeInfo = viewData?.sexe === 'Homme' ? { label: 'Homme', icon: IconUser, color: '#2563eb' }
    : viewData?.sexe === 'Femme' ? { label: 'Femme', icon: IconUser, color: '#db2777' } : null;
  const sitInfo = { 'Célibataire': { color: '#64748b' }, 'Marié(e)': { color: '#059669' }, 'Divorcé(e)': { color: '#d97706' }, 'Veuf(ve)': { color: '#7c3aed' } }[viewData?.situation_familiale];
  const sitFull = sitInfo ? { icon: IconHeart, label: viewData.situation_familiale, color: sitInfo.color } : null;

  const INFO_ITEMS = [
    { k: 'Sexe', v: viewData?.sexe, icon: IconUser },
    { k: 'Lieu de naissance', v: viewData?.lieu_naissance, icon: IconMapPin },
    { k: 'Date de naissance', v: viewData?.date_naissance, icon: IconCalendarDays },
    { k: 'Nationalité', v: viewData?.nationalite, icon: IconGlobe },
    { k: 'Groupe sanguin', v: viewData?.groupe_sanguin, icon: IconDroplet },
    { k: 'CIN', v: viewData?.cin, icon: IconIdentification },
    { k: 'Adresse', v: viewData?.adresse || viewData?.rue, icon: IconHome },
    { k: 'Code postal', v: viewData?.code_postal, icon: IconTags },
    { k: 'Localité', v: viewData?.localite || viewData?.gouvernorat, icon: IconMapPin },
    { k: 'Téléphone', v: viewData?.telephone || viewData?.gsm, icon: IconPhone },
    { k: 'E-mail', v: viewData?.adresse_electronique, icon: IconEnvelope },
    { k: 'Situation familiale', v: viewData?.situation_familiale, icon: IconHeart },
  ];

  // ----- Helpers du mode Paramètres -----
  const moveSection = (from, to) => {
    if (from === to) return;
    const arr = [...sections];
    const [it] = arr.splice(from, 1);
    arr.splice(to, 0, it);
    setSections(arr);
  };
  const openSectionEdit = (si) => {
    setTmpSection({ title: sections[si].title, iconName: sections[si].iconName || 'user' });
    setEditSection(si);
  };
  const openChampEdit = (si, ci) => {
    const c = sections[si].champs[ci];
    setTmpChamp({
      label: String(c.label || '').replace(/\s*\*\s*$/, ''),
      type: c.type || 'text',
      options: Array.isArray(c.options) ? c.options.join(', ') : (c.options || ''),
      required: !!c.required,
      iconName: c.iconName || 'user',
    });
    setEditChamp({ si, ci });
  };
  const addChamp = (si, ci) => {
    const def = { id: 'champ_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), label: 'Nouveau champ *', type: 'text', iconName: 'user', required: false };
    const newIndex = ci == null ? sections[si].champs.length : ci + 1;
    const arr = [...sections];
    arr[si] = { ...arr[si], champs: [...arr[si].champs.slice(0, newIndex), def, ...arr[si].champs.slice(newIndex)] };
    setSections(arr);
    openChampEdit(si, newIndex);
  };
  const addSection = () => {
    const idx = sections.length;
    const pal = PALETTE[idx % PALETTE.length];
    const def = { id: 'rubrique_' + Date.now().toString(36), title: 'Nouvelle rubrique', iconName: 'user', color: pal.color, soft: pal.soft, champs: [] };
    setSections((prev) => [...prev, def]);
    openSectionEdit(idx);
  };
  const saveSection = () => {
    if (editSection === null) return;
    setSections((prev) => prev.map((s, i) => i === editSection ? { ...s, title: tmpSection.title.trim() || s.title, iconName: tmpSection.iconName || s.iconName } : s));
    setEditSection(null);
  };
  const saveChamp = () => {
    if (!editChamp) return;
    const { si, ci } = editChamp;
    setSections((prev) => prev.map((s, i) => {
      if (i !== si) return s;
      return {
        ...s,
        champs: s.champs.map((c, j) => {
          if (j !== ci) return c;
          const n = {
            ...c,
            label: (tmpChamp.label.trim() || c.label) + (tmpChamp.required ? ' *' : ''),
            required: tmpChamp.required,
            type: tmpChamp.type,
            iconName: tmpChamp.iconName || 'user',
          };
          if (tmpChamp.type === 'select') n.options = String(tmpChamp.options).split(',').map((o) => o.trim()).filter(Boolean);
          else n.options = undefined;
          return n;
        }),
      };
    }));
    setEditChamp(null);
  };
  const confirmNow = () => {
    if (!confirmDel) return;
    if (confirmDel.type === 'reset') {
      setSections(defaultSections());
      customStore.save({});
      setForm(newForm());
    }
    if (confirmDel.type === 'section') {
      const { si } = confirmDel;
      (sections[si]?.champs || []).forEach((c) => pruneCustom(c.id));
      setSections((prev) => prev.filter((_, i) => i !== si));
      setActiveFiche((v) => Math.max(0, Math.min(v, sections.length - 2)));
    }
    if (confirmDel.type === 'champ') {
      const { si, ci } = confirmDel;
      const c = sections[si]?.champs?.[ci];
      if (c) pruneCustom(c.id);
      setSections((prev) => prev.map((s, i) => i !== si ? s : { ...s, champs: s.champs.filter((_, j) => j !== ci) }));
    }
    setConfirmDel(null);
  };

  if (!sections) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => tabPicker({ value: activeTab, tab: t }))}
        </div>
        {estAdmin && (
          <label
            data-test="params-toggle"
            className="flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition"
            style={parametres
              ? { background: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', color: '#fff', boxShadow: '0 4px 12px rgba(245,158,11,0.35)' }
              : { borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={parametres}
              onChange={(e) => setParametres(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: 'var(--accent-amber)' }}
            />
            <FitIcon size={14} color={parametres ? '#fff' : 'var(--accent-amber)'}><IconSettings /></FitIcon>
            Paramètres
          </label>
        )}
      </div>

      {parametres && (
        <div className="card px-4 py-3 text-xs" style={{ borderTop: '4px solid var(--accent-amber)', background: '#fffbeb' }} data-test="config-mode">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-extrabold text-amber-700"><FitIcon size={15} color="#d97706"><IconSettings /></FitIcon> Mode Paramètres — personnalisation de la fiche signalétique</p>
          <ul className="ml-5 list-disc space-y-0.5 text-slate-600">
            <li><b>Glissez</b> une rubrique (poignée ⠿) pour modifier l'ordre d'affichage.</li>
            <li>Chaque rubrique et chaque champ dispose de <b>3 boutons</b> : ✏️ Modifier (titre/contenu) · 🗑 Supprimer · ＋ Ajouter.</li>
            <li>En <b>pied de page</b> : ajouter une rubrique ou un champ.</li>
          </ul>
        </div>
      )}

      {parametres ? (
        <div className="space-y-4" data-test="config-mode">
          {sections.map((s, si) => {
            const SIcon = ICONS[s.iconName] || IconUser;
            return (
              <div
                key={s.id}
                data-test="section-card"
                draggable
                onDragStart={(e) => setDragSi(si)}
                onDragOver={(e) => { e.preventDefault(); if (overSi !== si) setOverSi(si); }}
                onDrop={(e) => { e.preventDefault(); moveSection(dragSi, si); setDragSi(null); setOverSi(null); }}
                onDragEnd={() => { setDragSi(null); setOverSi(null); }}
                className="card transition"
                style={{
                  borderTop: `4px solid ${s.color}`,
                  opacity: dragSi === si ? 0.55 : 1,
                  outline: overSi === si ? '2px dashed var(--accent-amber)' : 'none',
                }}
              >
                <div className="flex flex-wrap items-center gap-2 rounded-t-lg px-4 py-3" style={{ background: s.soft }}>
                  <span className="cursor-grab select-none text-lg text-slate-400" title="Glisser pour réordonner" data-test="drag-handle">⠿</span>
                  <FitIcon size={18} color={s.color}><SIcon /></FitIcon>
                  <p className="min-w-0 flex-1 text-sm font-extrabold tracking-wide" style={{ color: s.color }} data-test="sec-title">{s.title} <span className="font-normal text-slate-400">({s.champs.length} champ{s.champs.length > 1 ? 's' : ''})</span></p>
                  <div className="flex items-center gap-1.5">
                    <IconBtn icon={IconEdit} title="Modifier la rubrique (titre / icône)" tone={s.color} onClick={() => openSectionEdit(si)} />
                    <IconBtn icon={IconTrash} title="Supprimer la rubrique" danger onClick={() => setConfirmDel({ type: 'section', si })} />
                    <IconBtn icon={IconPlus} title="Ajouter un champ à cette rubrique" tone={s.color} onClick={() => addChamp(si, null)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {s.champs.map((c, ci) => (
                    <div key={c.id} data-test="field-cell">
                      {renderFieldBody(c, s.color, s.soft)}
                      <div className="mt-1.5 flex items-center justify-end gap-1.5" data-test="fld-toolbar">
                        <IconBtn icon={IconEdit} title="Modifier le champ (titre / contenu)" tone={s.color} onClick={() => openChampEdit(si, ci)} />
                        <IconBtn icon={IconTrash} title="Supprimer le champ" danger onClick={() => setConfirmDel({ type: 'champ', si, ci })} />
                        <IconBtn icon={IconPlus} title="Ajouter un champ après" tone={s.color} onClick={() => addChamp(si, ci)} />
                      </div>
                    </div>
                  ))}
                  {s.champs.length === 0 && (
                    <p className="col-span-full rounded-xl border border-dashed px-4 py-3 text-center text-xs text-slate-400">Aucun champ — utilisez « ＋ Ajouter un champ ».</p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="card p-4" style={{ borderTop: '4px solid var(--accent-amber)' }} data-test="config-footer">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700"><FitIcon size={15} color="#d97706"><IconPlus /></FitIcon> Pied de page — Ajouter des rubriques et des champs</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-test="add-rubrique" className="btn-primary" onClick={addSection}>
                <FitIcon size={14} color="#fff"><IconPlus /></FitIcon> Ajouter une rubrique
              </button>
              <select className="input w-auto" value={Math.min(addChampSection, sections.length - 1)} onChange={(e) => setAddChampSection(Number(e.target.value))} data-test="add-champ-target">
                {sections.map((s, i) => <option key={s.id} value={i}>{s.title}</option>)}
              </select>
              <button type="button" data-test="add-champ" className="btn-secondary" onClick={() => addChamp(Math.min(addChampSection, sections.length - 1), null)}>
                <FitIcon size={14}><IconPlus /></FitIcon> Ajouter un champ à cette rubrique
              </button>
              <button type="button" data-test="reset-model" className="btn-secondary" style={{ color: '#dc2626' }} onClick={() => setConfirmDel({ type: 'reset' })}>Réinitialiser le modèle</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {activeTab !== 'nouvelle' && (
            <div className="card" style={{ borderTop: '4px solid var(--primary-600)' }}>
              <label className="label flex items-center gap-1.5"><FitIcon size={14} color="var(--primary-500)"><IconEye /></FitIcon> Employé concerné</label>
              <EmployePicker value={editId} onChange={setEditId} placeholder="Rechercher un employé (matricule, nom, prénom)" />
            </div>
          )}

          {activeTab === 'consulter' ? (
            <div className="card" style={{ borderTop: '4px solid #2563eb' }}>
              {viewData ? (
                <>
                  <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border p-4" style={{ borderColor: '#2563eb33', background: '#dbeafe55' }}>
                    {viewData.photo_url
                      ? <img src={viewData.photo_url} alt="Photo" className="h-20 w-20 rounded-full object-cover ring-4" style={{ '--tw-ring-color': '#60a5fa' }} />
                      : <div className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white shadow-md" style={{ background: 'linear-gradient(135deg, #2563eb, #1e40af)' }}>{String(viewData.prenom || viewData.nom || '?').slice(0, 1).toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-extrabold text-slate-800">{viewData.nom} {viewData.prenom}</p>
                      <p className="text-sm text-slate-500">Mat. <span className="font-mono font-bold text-slate-700">{viewData.matricule}</span> · {viewData.categorie}</p>
                      <p className="text-xs text-slate-400">Rubrique: {viewData.rubrique || '—'} · Grade: {viewData.grade || '—'} · Classe: {viewData.classe || '—'} · Échelon: {viewData.echelon || '—'}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sexeInfo && b(sexeInfo)}
                        {sitFull && b(sitFull)}
                        {viewData.nationalite && b({ icon: IconGlobe, label: viewData.nationalite, color: '#6366f1' })}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {INFO_ITEMS.map(({ k, v, icon: Icon }) => (
                      <div key={k} className="rounded-xl border px-3 py-2.5 transition hover:shadow-sm" style={{ borderColor: '#2563eb22', background: '#f8fafc' }}>
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"><FitIcon size={12} color="#2563eb"><Icon /></FitIcon>{k}</p>
                        <p className="text-sm font-semibold text-slate-700">{v || '—'}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-slate-500">Sélectionnez un employé pour consulter son profil.</p>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="card fade-in" style={{ borderTop: `4px solid ${section.color}` }}>
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: `${section.color}40`, background: section.soft }}>
                <span className="icon-badge text-white" style={{ background: `linear-gradient(135deg, ${section.color}, ${section.color}bb)`, width: 44, height: 44 }}>
                  <FitIcon size={22} color="#fff"><sectionIcon /></FitIcon>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-extrabold tracking-wide" style={{ color: section.color }}>{section.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Étape {activeFiche + 1} sur {sections.length}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {sections.map((s, i) => {
                    const SI = ICONS[s.iconName] || IconUser;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setActiveFiche(i)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border transition"
                        style={i === activeFiche
                          ? { background: s.color, borderColor: s.color, color: '#fff', boxShadow: `0 2px 8px ${s.color}55` }
                          : i < activeFiche
                            ? { borderColor: `${s.color}66`, color: s.color, background: '#fff' }
                            : { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                      >
                        {i < activeFiche
                          ? <FitIcon size={13} color={s.color}><IconStar /></FitIcon>
                          : <FitIcon size={14}><SI /></FitIcon>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.champs.map(renderChamp)}
              </div>

              {sectionActive === 'pro' && form.grade && (
                <div className="mt-5 rounded-xl border px-4 py-3 text-sm" style={{
                  borderColor: grilleMatch ? '#0891b233' : '#f59e0b55',
                  background: grilleMatch ? '#cffafe55' : '#fef3c755',
                }}>
                  {grilleMatch ? (
                    <p className="flex items-center gap-2 font-semibold" style={{ color: '#0e7490' }}>
                      <FitIcon size={16} color="#0891b2"><IconBanknotes /></FitIcon>
                      Grille de salaire : {grilleMatch.rubrique} · {grilleMatch.grade} / {grilleMatch.classe} / {grilleMatch.echelon}
                      <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">Salaire de base : {grilleMatch.valeur} DT</span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 font-semibold text-amber-700">
                      <FitIcon size={16} color="#f59e0b"><IconBanknotes /></FitIcon>
                      Aucune correspondance dans la grille de salaire pour Grade {form.grade} / Classe {form.classe} / Échelon {form.echelon}
                    </p>
                  )}
                </div>
              )}

              {sectionActive === 'sociale' && (
                <div className="mt-5 rounded-xl border p-4" style={{ borderColor: '#05966933', background: '#d1fae555' }}>
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700"><FitIcon size={15} color="#059669"><IconCreditCard /></FitIcon> Coordonnées Bancaires / RIB</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FieldFrame accent="#059669" soft="#d1fae5">
                      <div className="p-3">
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                          <FitIcon size={14} color="#059669"><IconBuildingOffice /></FitIcon>
                          Nom de la banque
                        </label>
                        <select
                          className="input"
                          value={form.banque ?? ''}
                          onChange={(e) => setForm({ ...form, banque: e.target.value })}
                        >
                          <option value="">— Sélectionner une banque —</option>
                          {BANQUES.map((bb) => <option key={bb} value={bb}>{bb}</option>)}
                        </select>
                      </div>
                    </FieldFrame>
                    <FieldFrame accent="#059669" soft="#d1fae5">
                      <div className="p-3">
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                          <FitIcon size={14} color="#059669"><IconUserCheck /></FitIcon>
                          Titulaire du Compte
                        </label>
                        <input
                          className="input"
                          value={form.titulaire_compte ?? ''}
                          placeholder="Ex : TLILI MOHAMED AZIZ"
                          onChange={(e) => setForm({ ...form, titulaire_compte: e.target.value })}
                        />
                      </div>
                    </FieldFrame>
                    <FieldFrame accent="#059669" soft="#d1fae5">
                      <div className="p-3">
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                          <FitIcon size={14} color="#059669"><IconCreditCard /></FitIcon>
                          Type de compte
                        </label>
                        <select
                          className="input"
                          value={form.type_compte ?? ''}
                          onChange={(e) => setForm({ ...form, type_compte: e.target.value })}
                        >
                          <option value="">— Sélectionner —</option>
                          {TYPES_COMPTE.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </FieldFrame>
                    <FieldFrame accent="#059669" soft="#d1fae5">
                      <div className="p-3">
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                          <FitIcon size={14} color="#059669"><IconCreditCard /></FitIcon>
                          Numéro RIB (20 chiffres)
                        </label>
                        <input
                          className="input font-mono"
                          inputMode="numeric"
                          maxLength={20}
                          value={form.rib ?? ''}
                          placeholder="Ex : 00012345678901234567"
                          onChange={(e) => setForm({ ...form, rib: e.target.value.replace(/\D/g, '').slice(0, 20) })}
                        />
                        <p className="mt-1 text-[11px]" style={{ color: form.rib && form.rib.length !== 20 ? '#dc2626' : 'var(--text-muted)' }}>
                          {form.rib
                            ? (form.rib.length === 20 ? '✓ RIB valide (20 chiffres)' : `${form.rib.length}/20 chiffres — 20 chiffres requis`)
                            : '20 chiffres'}
                        </p>
                      </div>
                    </FieldFrame>
                  </div>
                </div>
              )}

              {sectionActive === 'pro' && (
                <div className="mt-5 rounded-xl border p-4" style={{ borderColor: '#0891b233', background: '#cffafe55' }}>
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-cyan-700"><FitIcon size={15} color="#0891b2"><IconUpload /></FitIcon> Photo</p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="label">Fichier (converti en webp automatiquement)</label>
                      <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files[0] || null)} className="block w-full text-sm text-slate-600 file:me-2 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold" />
                      <p className="mt-1 text-xs text-slate-400">{photoFile ? photoFile.name : 'Aucun fichier choisi'}</p>
                    </div>
                    <span className="icon-badge text-white" style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)', width: 44, height: 44 }}><FitIcon size={20} color="#fff"><IconUpload /></FitIcon></span>
                    <button type="button" onClick={doUploadPhoto} className="btn-primary shrink-0">Uploader</button>
                  </div>
                  {photoMsg && <p className="mt-2 text-sm text-emerald-600">{photoMsg}</p>}
                </div>
              )}

              <div className="mt-5 flex gap-2">
                {activeFiche > 0 && <button type="button" className="btn-secondary" onClick={() => setActiveFiche((v) => v - 1)}>← Précédent</button>}
                {activeFiche < sections.length - 1 ? (
                  <button type="button" className="btn-secondary" onClick={() => setActiveFiche((v) => v + 1)}>Suivant →</button>
                ) : (
                  <button type="submit" className="btn-primary">{activeTab === 'nouvelle' ? 'Créer la fiche' : 'Enregistrer les modifications'}</button>
                )}
              </div>
            </form>
          )}
        </>
      )}

      {msg && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">✓ {msg}</p>}
      {err && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">✕ {err}</p>}

      {/* Modales du mode Paramètres */}
      {editSection !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onClick={() => setEditSection(null)}>
          <div className="card modal-shell w-full max-w-md p-4 sm:p-5" style={{ borderTop: '4px solid var(--accent-amber)' }} onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-sm font-extrabold text-slate-800">Rubrique — Modifier (titre / icône)</p>
            <label className="label">Titre de la rubrique</label>
            <input className="input" value={tmpSection.title} onChange={(e) => setTmpSection({ ...tmpSection, title: e.target.value })} />
            <label className="label mt-4">Icône</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(ICONS).map((name) => {
                const Ic = ICONS[name];
                const active = tmpSection.iconName === name;
                return (
                  <button
                    key={name}
                    title={name}
                    type="button"
                    onClick={() => setTmpSection({ ...tmpSection, iconName: name })}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border transition"
                    style={active ? { background: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', color: '#fff' } : { borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
                  >
                    <FitIcon size={15} color={active ? '#fff' : undefined}><Ic /></FitIcon>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditSection(null)}>Annuler</button>
              <button type="button" data-test="save-section" className="btn-primary" style={{ background: 'var(--accent-amber)' }} onClick={saveSection}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {editChamp !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onClick={() => setEditChamp(null)}>
        <div className="card modal-shell w-full max-w-md p-4 sm:p-5" style={{ borderTop: '4px solid var(--accent-amber)' }} onClick={(e) => e.stopPropagation()}>
          <p className="mb-4 text-sm font-extrabold text-slate-800">Champ — Modifier (titre / contenu)</p>
          <label className="label">Titre du champ</label>
          <input className="input" value={tmpChamp.label} onChange={(e) => setTmpChamp({ ...tmpChamp, label: e.target.value })} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type de contenu</label>
              <select className="input" value={tmpChamp.type} onChange={(e) => setTmpChamp({ ...tmpChamp, type: e.target.value })}>
                <option value="text">Texte</option>
                <option value="date">Date</option>
                <option value="number">Nombre</option>
                <option value="select">Liste (select)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={tmpChamp.required} onChange={(e) => setTmpChamp({ ...tmpChamp, required: e.target.checked })} className="h-4 w-4" style={{ accentColor: 'var(--accent-amber)' }} />
                Obligatoire (*)
              </label>
            </div>
          </div>
          {tmpChamp.type === 'select' && (
            <div className="mt-3">
              <label className="label">Options (séparées par des virgules)</label>
              <textarea className="input" rows={3} value={tmpChamp.options} onChange={(e) => setTmpChamp({ ...tmpChamp, options: e.target.value })} />
            </div>
          )}
          <label className="label mt-4">Icône</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(ICONS).map((name) => {
              const Ic = ICONS[name];
              const active = tmpChamp.iconName === name;
              return (
                <button
                  key={name}
                  title={name}
                  type="button"
                  onClick={() => setTmpChamp({ ...tmpChamp, iconName: name })}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border transition"
                  style={active ? { background: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', color: '#fff' } : { borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
                >
                  <FitIcon size={15} color={active ? '#fff' : undefined}><Ic /></FitIcon>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEditChamp(null)}>Annuler</button>
            <button type="button" data-test="save-champ" className="btn-primary" style={{ background: 'var(--accent-amber)' }} onClick={saveChamp}>Enregistrer</button>
          </div>
        </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4" onClick={() => setConfirmDel(null)}>
          <div className="card modal-shell w-full max-w-sm p-4 sm:p-5" style={{ borderTop: '4px solid #dc2626' }} onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 flex items-center gap-2 text-sm font-extrabold text-slate-800"><FitIcon size={16} color="#dc2626"><IconTrash /></FitIcon> Confirmation</p>
            <p className="text-sm text-slate-600">
              {confirmDel.type === 'section' ? `Supprimer la rubrique « ${sections[confirmDel.si]?.title || ''} » et ses champs ?`
                : confirmDel.type === 'champ' ? `Supprimer le champ « ${String(sections[confirmDel.si]?.champs?.[confirmDel.ci]?.label || '').replace(/\s*\*\s*$/, '')} » ?`
                  : 'Réinitialiser le modèle de la fiche (restaurer le modèle par défaut) ?'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDel(null)}>Annuler</button>
              <button type="button" data-test="confirm-delete" className="btn-primary" style={{ background: '#dc2626' }} onClick={confirmNow}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}