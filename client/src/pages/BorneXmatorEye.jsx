import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../api';
import { useAuth } from '../AuthContext';
import { ouvrirFluxVideo, arreterFluxVideo, capturerImageWebp, MESSAGES_CAMERA, listerCameras, construireContraintes } from '../utils/camera';
import {
  ajouterPointage,
  obtenirEnAttente,
  marquerSynchronises,
  marquerEchec,
  migrerAncienneFile,
  purgerSynchronises,
} from '../utils/pointerQueueStore';

// Dossier public des modèles IA (mêmes fichiers que l'enrôlement : npm run models)
const MODELS_URL = `${import.meta.env.BASE_URL || '/'}models`;

// Seuils de reconnaissance — tolérance souple pour l'invariance aux lunettes (distance <= 0.50)
const SEUIL_MATCH = 0.50;                 // distance euclidienne maximale (0 = identique)
const SEUIL_CONFIANCE = 0.5;              // confiance >= 50 % => pointage validé
const NB_FRAMES_CONF = 2;                 // frames stables consécutives avant validation
const NB_BLINKS_MIN = 1;                  // clignements requis pour valider le vivant
const SEUIL_SOURIRE = 0.4;                // expression happy >= 40 % = sourire (vivant)
const SEUIL_OEIL_FERME = 0.22;            // ratio d'aspect de l'œil < seuil => œil fermé
const DUREE_SESSION_MS = 60000;           // temps max devant la caméra (60 s)
const DUREE_SUCCES_MS = 1800;             // écran de succès plein écran (1,8 s) puis retour accueil
const NB_BARRES = 12;                     // barres du baromètre de confiance

// Données biométriques : les descripteurs faciaux de référence sont stockés CÔTÉ SERVEUR
// (employés.face_descriptor / face_descriptor_b, exposés uniquement via l'API protégée).
// Le navigateur ne détient qu'un cache hors-ligne (localStorage) et le matcher en mémoire ;
// les deux sont purgés à la déconnexion pour ne laisser aucun descripteur sur l'appareil.
// La queue des pointages hors-ligne, elle, passe en IndexedDB (voir `utils/pointerQueueStore.js`).
const KEY_DESCRIPTEURS = 'xmator_borne_descripteurs';

const pad = (n) => String(n).padStart(2, '0');

// Horodatage local précis 'YYYY-MM-DD HH:mm:ss'
function horodatageLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// Purge totale des données biométriques de l'appareil (déconnexion) : le cache local de
// descripteurs est effacé. Les références en mémoire (matcher, modèles) sont libérées par
// l'appelant ; les descripteurs de référence restent sur le serveur, rechargés après
// reconnexion.
function purgerDonneesBiometriques() {
  try { localStorage.removeItem(KEY_DESCRIPTEURS); } catch {}
}

// Lecture / écriture de l'indice descripteurs (cache hors-ligne partiel des enrôlements)
function lireCacheDescripteurs() {
  try {
    const raw = localStorage.getItem(KEY_DESCRIPTEURS);
    const c = raw ? JSON.parse(raw) : null;
    return c && Array.isArray(c.employes) ? c.employes : [];
  } catch { return []; }
}

// Étiquette d'un LabeledFaceDescriptor : "id|matricule|nom prenom|categorie"
function labelFromEmp(e) {
  return `${e.id}|${e.matricule}|${e.nom} ${e.prenom}|${e.categorie || ''}`;
}
function empFromLabel(label) {
  const [id, matricule, nomPrenom, categorie] = String(label).split('|');
  return { id: Number(id), matricule, nom_prenom: nomPrenom, categorie: categorie || '' };
}

// Segment couleur du baromètre selon le score de confiance (0..1)
function segmentCouleur(score) {
  if (score >= 0.5) return { couleur: '#22ff88', libelle: 'Confiance atteinte' };
  if (score >= 0.25) return { couleur: '#fbbf24', libelle: 'Visage détecté — cadrage…' };
  return { couleur: '#ef4444', libelle: 'Visage non identifié' };
}

// Ratio d'aspect de l'œil (Eye Aspect Ratio) sur le modèle 68 points (face-api) :
// œil gauche 36-41, œil droit 42-47. EAR bas => paupières fermées. Utilisé pour détecter
// un clignement (fermé → ouvert) comme preuve de vie anti-photo.
function earOeil(p, debut) {
  const d = (i, j) => {
    const a = p[debut + i];
    const b = p[debut + j];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const v1 = d(1, 5);
  const v2 = d(2, 4);
  const h = d(0, 3);
  if (h < 1e-6) return 1;
  return (v1 + v2) / (2 * h);
}

// EAR moyen des deux yeux (68 landmarks).
function earMoyen(landmarks) {
  const g = earOeil(landmarks, 36);
  const dr = earOeil(landmarks, 42);
  return (g + dr) / 2;
}

export default function BorneXmatorEye() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const trameRef = useRef(null);
  const faceapiRef = useRef(null);
  const matcherRef = useRef(null);
  const stopRef = useRef(false);
  const timerRef = useRef(null);
  const stableRef = useRef(0);
  const typeRef = useRef('arrivee');
  const detecteRef = useRef(null);
  const camsRef = useRef([]);        // caméras énumérées (enumerateDevices)
  const camIndexRef = useRef(0);     // caméra active dans la liste
  const blinksRef = useRef(0);       // clignements détectés depuis le début de la session
  const paupiereFermeeRef = useRef(false); // machine à états EAR fermé/ouvert
  const sourireRef = useRef(false);  // sourire détecté (expression happy) sur la frame courante

  const [etape, setEtape] = useState('chargement'); // chargement | accueil | camera | succes | erreur
  const [erreur, setErreur] = useState('');
  const [messageModele, setMessageModele] = useState('');
  const [horloge, setHorloge] = useState(horodatageLocal());
  const [enLigne, setEnLigne] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queue, setQueue] = useState([]);
  const [nbEnroles, setNbEnroles] = useState(0);
  const [nbEnregistres, setNbEnregistres] = useState(0);
  const [detecte, setDetecte] = useState(null); // { reconnu, employe, confiance, box }
  const [succes, setSucces] = useState(null);   // { employe, horodatage, type, horsLigne }
  const [typePointage, setTypePointage] = useState('arrivee');
  const [camFace, setCamFace] = useState('user');
  const [bars, setBars] = useState(() => Array(NB_BARRES).fill(0.3));
  const [estPaysage, setEstPaysage] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  );
  const [tailleEcran, setTailleEcran] = useState(
    () => (typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 1280, h: 720 })
  );

  // ---- Horloge temps réel ----
  useEffect(() => {
    const t = setInterval(() => setHorloge(horodatageLocal()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Orientation (portrait / paysage) + taille d'écran (rotation fluide sans couper le flux) ----
  useEffect(() => {
    const maj = () => {
      setEstPaysage(window.innerWidth > window.innerHeight);
      setTailleEcran({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', maj);
    window.addEventListener('orientationchange', maj);
    return () => {
      window.removeEventListener('resize', maj);
      window.removeEventListener('orientationchange', maj);
    };
  }, []);

  // ---- État réseau (synchronisation de la queue hors-ligne, IndexedDB) ----
  const rafraichirQueue = useCallback(async () => {
    try { setQueue(await obtenirEnAttente()); } catch { setQueue([]); }
  }, []);

  const sendPointage = async (employe_id, horodatage) => {
    try {
      await api.pointageBiometrique({ employe_id, horodatage, methode: 'Biometrie Xmator-Eye' });
      return { ok: true };
    } catch (e) {
      if (e && e.status) return { ok: false, erreur: e };
      return { ok: false, reseau: true, erreur: e };
    }
  };

  const echecsRef = useRef(0);
  const retryRef = useRef(null);

  // Arme un nouvel essai de synchronisation avec backoff exponentiel plafonné (3 s → 5 min).
  const armerNouvelEssai = () => {
    if (retryRef.current) return;
    echecsRef.current += 1;
    const delai = Math.min(300000, 3000 * 2 ** Math.min(echecsRef.current, 6));
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      flushQueue();
    }, delai);
  };

  // Tente d'envoyer toute la queue (démarrage, retour en ligne, après un pointage, retries).
  const flushQueue = useCallback(async () => {
    let q = [];
    try { q = await obtenirEnAttente(); } catch { return; }
    if (!q.length) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { armerNouvelEssai(); return; }
    const synchronises = [];
    let panne = false;
    for (const p of q) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { panne = true; break; }
      const r = await sendPointage(p.employe_id, p.horodatage);
      if (r.ok) synchronises.push(p.id);
      else if (r.reseau) { panne = true; break; }
      else { try { await marquerEchec(p.id, (r.erreur && r.erreur.message) || 'Enregistrement refusé par le serveur.'); } catch {} }
    }
    if (synchronises.length) {
      try { await marquerSynchronises(synchronises); } catch {}
      rafraichirQueue();
    }
    if (panne) armerNouvelEssai();
    else echecsRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const surOnline = () => {
      setEnLigne(true);
      echecsRef.current = 0;
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      flushQueue();
    };
    const surOffline = () => setEnLigne(false);
    window.addEventListener('online', surOnline);
    window.addEventListener('offline', surOffline);
    return () => {
      window.removeEventListener('online', surOnline);
      window.removeEventListener('offline', surOffline);
    };
  }, [flushQueue]);

  // ---- Chargement modèles + descripteurs des employés enrôlés ----
  useEffect(() => {
    let annule = false;
    const charger = async () => {
      try {
        setMessageModele('Chargement des modèles IA…');
        const mod = await import('@vladmandic/face-api');
        if (annule) return;
        faceapiRef.current = mod;
        if (mod.tf && typeof mod.tf.ready === 'function') {
          try { await mod.tf.ready(); } catch { try { await mod.tf.setBackend('cpu'); } catch {} }
        }
        await mod.nets.ssdMobilenetv1.loadFromUri(MODELS_URL);
        await mod.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
        await mod.nets.faceRecognitionNet.loadFromUri(MODELS_URL);
        await mod.nets.faceExpressionNet.loadFromUri(MODELS_URL);
        if (annule) return;

        // Descripteurs des employés enrôlés (API) en priorité, sinon cache local (hors-ligne partiel)
        let employes = lireCacheDescripteurs();
        try {
          const r = await api.descripteursFace();
          if (r && Array.isArray(r.employes)) {
            employes = r.employes;
            try { localStorage.setItem(KEY_DESCRIPTEURS, JSON.stringify({ savedAt: Date.now(), employes })); } catch {}
          }
        } catch {
          if (!employes.length) {
            setEtape('erreur');
            setErreur('Impossible de récupérer les signatures faciales (connexion requise au premier lancement).');
            return;
          }
        }

        setNbEnroles(employes.length);
        if (!employes.length) {
          setEtape('accueil');
          setMessageModele('');
          return;
        }
        const actifs = employes.filter((e) => e.actif);
        const labels = actifs.map((e) => {
          // Plutôt `descriptors` (émprises A/B = avec/sans lunettes) ; repli rétrocompatible.
          const multi = Array.isArray(e.descriptors) && e.descriptors.length > 0
            ? e.descriptors
            : (e.descriptor ? [e.descriptor] : []);
          return new mod.LabeledFaceDescriptors(labelFromEmp(e), multi.map((d) => new Float32Array(d)));
        });
        matcherRef.current = new mod.FaceMatcher(labels, SEUIL_MATCH);
        if (annule) return;
        setMessageModele('');
        setEtape('accueil');
      } catch (e) {
        if (annule) return;
        setEtape('erreur');
        setErreur(e && e.message ? e.message : String(e));
      }
    };
    charger();
    return () => { annule = true; };
  }, []);

  // ---- Cycle caméra : détection + reconnaissance (seuil de confiance >= 50 %) ----
  const reussir = async (employe, meta = {}) => {
    if (stopRef.current) return;
    // Verrou : plus aucune boucle de détection ne reprend (`boucle` teste stopRef).
    stopRef.current = true;
    // Capture l'instantané du visage tant que le flux est encore vivant (photo de la transaction).
    const photo = capturerImageWebp(videoRef.current);
    // Éteint immédiatement la webcam (pistes stoppées + timers annulés) => dernière frame figée.
    arreterFluxVideo(videoRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    const horodatage = horodatageLocal();
    setDetecte(null);

    let horsLigne = false;
    if (employe) {
      const r = await sendPointage(employe.id, horodatage);
      if (!r.ok) {
        if (r.reseau) {
          horsLigne = true;
          try {
            await ajouterPointage({
              employe_id: employe.id,
              matricule: employe.matricule,
              nom_prenom: employe.nom_prenom,
              horodatage,
              timestamp: new Date().toISOString(),
              type: typeRef.current,
              photoCaptured: photo,
              livenessVerified: meta.livenessVerified !== false,
              confidenceScore: meta.confiance,
            });
            rafraichirQueue();
            flushQueue(); // arme un retry (hors-ligne) ou envoie aussitôt (panne transitoire)
          } catch {}
        } else {
          setEtape('erreur');
          setErreur((r.erreur && r.erreur.message) || 'Enregistrement refusé par le serveur.');
          return;
        }
      }
    }
    setNbEnregistres((n) => n + 1);
    setSucces({ employe, horodatage, type: typeRef.current, horsLigne });
    setEtape('succes');
  };

  const boucle = async () => {
    if (stopRef.current) return;
    const fapi = faceapiRef.current;
    const video = videoRef.current;
    if (!fapi || !video || video.readyState < 2) {
      if (!stopRef.current) timerRef.current = setTimeout(boucle, 200);
      return;
    }
    try {
      const opts = new fapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
      // Entrée de détection allégée (largeur max 480) : nets internes de 300/112 px,
      // le CPU reste libre → aperçu réellement LIVE aussi sur les bornes modestes.
      const vw = video.videoWidth || 0;
      if (!vw) {
        if (!stopRef.current) timerRef.current = setTimeout(boucle, 150);
        return;
      }
      const tc = trameRef.current || (trameRef.current = document.createElement('canvas'));
      const echelle = Math.min(1, 480 / vw);
      tc.width = Math.max(1, Math.round(vw * echelle));
      tc.height = Math.max(1, Math.round((video.videoHeight || 0) * echelle));
      tc.getContext('2d').drawImage(video, 0, 0, tc.width, tc.height);
      const r = await fapi.detectSingleFace(tc, opts)
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();
      if (stopRef.current) return;
      if (r) {
        // ---- LIVENESS : clignement des yeux (EAR) et/ou sourire (expression happy) ----
        const ear = earMoyen(r.landmarks.positions);
        if (ear < SEUIL_OEIL_FERME) {
          paupiereFermeeRef.current = true;
        } else if (paupiereFermeeRef.current) {
          paupiereFermeeRef.current = false;
          blinksRef.current += 1; // fermé → ouvert = un clignement
        }
        const happy = (r.expressions && r.expressions.happy) || 0;
        sourireRef.current = happy >= SEUIL_SOURIRE;
        const vivant = blinksRef.current >= NB_BLINKS_MIN || sourireRef.current;

        const matcher = matcherRef.current;
        const best = matcher ? matcher.findBestMatch(r.descriptor) : null;
        const confiance = Math.max(0, 1 - (best ? Math.min(best.distance, 1) : 1));
        const reconnu = !!(best && best.label && best.label !== 'inconnu' && best.distance <= SEUIL_MATCH + 1e-9);
        // Remise à l'échelle vidéo (détection faite sur le petit canvas livré par le détecteur).
        const k = vw / tc.width;
        const b0 = r.detection.box;
        majDetecte({
          reconnu,
          employe: reconnu ? empFromLabel(best.label) : null,
          confiance,
          box: { x: b0.x * k, y: b0.y * k, width: b0.width * k, height: b0.height * k },
          vivant,
        });
        if (reconnu && confiance >= SEUIL_CONFIANCE && vivant) {
          stableRef.current += 1;
          if (stableRef.current >= NB_FRAMES_CONF) {
            stableRef.current = 0;
            reussir(empFromLabel(best.label), { confiance, livenessVerified: true });
            return;
          }
        } else {
          stableRef.current = 0;
        }
      } else {
        // Visage perdu : la preuve de vie est réinitialisée (anti-photo papier/écran).
        stableRef.current = 0;
        blinksRef.current = 0;
        paupiereFermeeRef.current = false;
        sourireRef.current = false;
        majDetecte(null);
      }
    } catch {
      if (!stopRef.current) timerRef.current = setTimeout(boucle, 250);
      return;
    }
    if (!stopRef.current) timerRef.current = setTimeout(boucle, 100);
  };

  // Jauge le re-rendu React de l'overlay (~3/s max) : la boucle reste à 100 ms pour la
  // liveness, mais `setDetecte` (nouvel objet à chaque frame) ne sature plus le fil
  // principal ni le CPU des bornes modestes (l'aperçu reste réellement LIVE).
  const detecteRenduRef = useRef({ t: 0, vide: true });
  const majDetecte = (obj) => {
    if (obj === null || detecteRenduRef.current.vide || performance.now() - detecteRenduRef.current.t >= 300) {
      detecteRenduRef.current = { t: performance.now(), vide: obj === null };
      setDetecte(obj);
    }
  };

  // Liveness : continue la boucle tant que le verrou n'est pas posé
  const lancerBoucle = () => {
    if (stopRef.current) return;
    timerRef.current = setTimeout(boucle, 60);
  };

  // Ouverture de la caméra + lancement de la boucle de détection
  const demarrerCamera = async (type) => {
    setErreur('');
    detecteRenduRef.current = { t: 0, vide: true };
    setDetecte(null);
    typeRef.current = type;
    setTypePointage(type);
    setCamFace('user');
    if (!matcherRef.current) {
      setEtape('erreur');
      setErreur('Aucun employé enrôlé (signature faciale). Enrôlez d\'abord les employés dans « Employés ».');
      return;
    }
    setEtape('camera');
    // StrictMode (dev) rejoue cet effet : on réarme l'état en tête de démarrage
    stopRef.current = false;
    stableRef.current = 0;
    blinksRef.current = 0;
    paupiereFermeeRef.current = false;
    sourireRef.current = false;
    try {
      const stream = await ouvrirFluxVideo(construireContraintes('user'));
      // Énumère les caméras (labels disponibles une fois la permission accordée).
      try { camsRef.current = await listerCameras(); } catch { camsRef.current = []; }
      if (camsRef.current.length) camIndexRef.current = 0;
      const video = videoRef.current;
      if (!video) { if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      detecteRef.current = null;
      const duree = Date.now() + DUREE_SESSION_MS;
      const surveiller = () => {
        if (stopRef.current) return;
        if (Date.now() > duree) {
          arreterFluxVideo(videoRef.current);
          if (timerRef.current) clearTimeout(timerRef.current);
          setEtape('erreur');
          setErreur('Temps dépassé : opération annulée.');
          return;
        }
        if (stopRef.current) return;
        timerRef.current = setTimeout(surveiller, 1000);
      };
      surveiller();
      lancerBoucle();
    } catch (e) {
      stopRef.current = true;
      setEtape('erreur');
      setErreur(e && e.code === 'permission'
        ? MESSAGES_CAMERA.permission
        : (e && e.code === 'aucune' ? MESSAGES_CAMERA.aucune : (e && e.message ? e.message : MESSAGES_CAMERA.indisponible)));
    }
  };

// Bascule de caméra SANS réinitialiser la boucle ni l'état (le flux est remplacé en direct) —
// conçue pour fonctionner sur tous les navigateurs mobiles et PC :
//   1) Libère l'ancien flux AVANT de demander la nouvelle (indispensable sur iOS Safari,
//      sinon getUserMedia renvoie la même caméra ou lève NotReadableError) ;
//   2) Essaie le flip facingMode pur (sans résolution), puis avec résolution idéale (certains
//      webviews Android jettent OverconstrainedError quand les deux sont combinés) ;
//   3) En repli, cycle les caméras énumérées via enumerateDevices (PC webcam USB) ;
//   4) Si tout échoue, restaure l'ancienne caméra et affiche un message clair.
const basculerCam = async () => {
    if (stopRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    const cams = Array.isArray(camsRef.current) ? camsRef.current : [];
    const faceFlip = camFace === 'user' ? 'environment' : 'user';
    const faceRegex = /back|rear|arri|post|backup|0$/i;

    // Attache le flux EN DIRECT, sans attendre play() et sans rebuild de pipeline
    // (video.load() ajoutait plusieurs secondes par bascule) : l'élément est autoplay/muted,
    // le flux est live immédiatement et la détection suit dès les premières images.
    const attacherFlux = (stream) => {
      try {
        video.srcObject = stream;
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
        return true;
      } catch {}
      try { if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop()); } catch {}
      return false;
    };

    // Candidats par ordre de fiabilité croissante.
    const faceCandidateBase = { audio: false };
    const candidates = [
      { ...faceCandidateBase, video: { facingMode: faceFlip } },
      { ...faceCandidateBase, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: faceFlip } },
    ];
    for (let k = 1; k <= Math.max(cams.length, 1); k += 1) {
      const cam = cams.length ? cams[(camIndexRef.current + k) % cams.length] : null;
      if (!cam || !cam.deviceId) continue;
      const face = faceRegex.test(cam.label || '') ? 'environment' : 'user';
      candidates.push({ ...faceCandidateBase, video: { facingMode: face, deviceId: { exact: cam.deviceId } } });
      candidates.push({ ...faceCandidateBase, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: face, deviceId: { exact: cam.deviceId } } });
    }

    // Étape 1 : libère l'ancien flux d'abord (paramètre indispensable pour iOS Safari).
    const ancienFlux = video.srcObject;
    if (ancienFlux && typeof ancienFlux.getTracks === 'function') {
      ancienFlux.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    }
    try { video.srcObject = null; } catch {}

    // Étapes 2→3 : essaie les candidats jusqu'au premier flux qui se monte.
    let applique = null;
    for (const contraintesVideo of candidates) {
      let flux;
      try { flux = await ouvrirFluxVideo(contraintesVideo); } catch { continue; }
      if (await attacherFlux(flux)) { applique = contraintesVideo.video.facingMode || faceFlip; break; }
    }

    // Étape 4 : échec total → restaure l'ancienne caméra pour ne pas laisser un écran noir.
    if (!applique) {
      try { await attacherFlux(await ouvrirFluxVideo({ video: { facingMode: camFace }, audio: false })); } catch {}
      setErreur('Impossible de basculer de caméra : autre caméra indisponible, l\'active est conservée.');
      return;
    }

    // Nouvelle caméra → on repart d'un état de détection propre (la surveillance de session continue).
    setErreur('');
    setCamFace(applique === 'environment' ? 'environment' : 'user');
    stableRef.current = 0;
    blinksRef.current = 0;
    paupiereFermeeRef.current = false;
    sourireRef.current = false;
detecteRef.current = null;
    detecteRenduRef.current = { t: 0, vide: true };
    setDetecte(null);
  };

  // Arrêt manuel (bouton « Annuler » pendant le scan)
  const annulerScan = () => {
    stopRef.current = true;
    arreterFluxVideo(videoRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    stableRef.current = 0;
    blinksRef.current = 0;
    paupiereFermeeRef.current = false;
    sourireRef.current = false;
    setDetecte(null);
    setEtape('accueil');
  };

  // Libère la caméra et le timer de retry proprement à la fermeture du composant
  useEffect(() => {
    return () => {
      stopRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      arreterFluxVideo(videoRef.current);
    };
  }, []);

  // Retour à l'accueil après le succès (plein écran 1,8 s puis boutons Entrée / Sortie)
  useEffect(() => {
    if (etape !== 'succes') return;
    const t = setTimeout(() => {
      setSucces(null);
      setCamFace('user');
      setBars(Array(NB_BARRES).fill(0.3));
      blinksRef.current = 0;
      paupiereFermeeRef.current = false;
      sourireRef.current = false;
      setEtape('accueil');
    }, DUREE_SUCCES_MS);
    return () => clearTimeout(t);
  }, [etape]);

  // Au montage : migre l'ancienne file localStorage → IndexedDB (si reliquat), hydrate le
  // compteur d'attente, purge les pointages synchronisés de plus de 7 jours, puis tente une
  // synchronisation immédiate (réseau rétabli entre deux sessions de la borne).
  useEffect(() => {
    let annule = false;
    (async () => {
      try { await migrerAncienneFile(); } catch {}
      try { await purgerSynchronises(); } catch {}
      if (annule) return;
      await rafraichirQueue();
      if (typeof navigator === 'undefined' || navigator.onLine) flushQueue();
    })();
    return () => { annule = true; };
  }, [rafraichirQueue, flushQueue]);

  // Baromètre sensoriel : oscillation des barres proportionnelle au score de confiance
  useEffect(() => {
    if (etape !== 'camera') return;
    const t = setInterval(() => {
      const d = detecteRef.current;
      const score = Math.max(0, d ? d.confiance : 0);
      setBars((prev) => prev.map((_, i) => {
        const seuil = (i + 1) / NB_BARRES;
        if (score < 0.02) return 0.08 + Math.random() * 0.06;              // attente (rouge)
        if (score < seuil) return 0.1 + Math.random() * 0.1;               // sous le niveau (faible)
        if (score >= 0.5 && suaSignale(i)) return 0.7 + Math.random() * 0.3; // forte oscillation au vert
        return 0.55 + Math.random() * 0.35;                                 // oscillation moyenne
      }));
    }, 90);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape]);

  const suaSignale = (i) => i === NB_BARRES - 1 || i === NB_BARRES - 2;

  useEffect(() => {
    if (etape === 'camera') detecteRef.current = detecte;
  }, [detecte, etape]);

  const deconnexion = () => {
    // Déconnexion = arrêt du visionnage + purge des données biométriques locales
    // (descripteurs & matcher). Les empreintes de référence restent côté serveur.
    stopRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);
    arreterFluxVideo(videoRef.current);
    matcherRef.current = null;
    faceapiRef.current = null;
    purgerDonneesBiometriques();
    logout();
    navigate('/login', { replace: true });
  };

  const enChargement = etape === 'chargement';
  const enAccueil = etape === 'accueil';
  const enCamera = etape === 'camera';
  const enSucces = etape === 'succes';
  const enErreur = etape === 'erreur';

  const score = (() => {
    if (etape === 'camera' && detecte) return Math.max(0, Math.min(1, detecte.confiance));
    return 0;
  })();
  const segment = segmentCouleur(score);

  // Cadrage ovale : suit la boîte détectée (coordonnées vidéo → écran avec object-fit: cover)
  const cadrage = (() => {
    if (!enCamera) return null;
    const box = detecte && detecte.box;
    const vw = (videoRef.current && videoRef.current.videoWidth) || 1280;
    const vh = (videoRef.current && videoRef.current.videoHeight) || 720;
    const W = tailleEcran.w;
    const H = tailleEcran.h;
    if (box && vw > 0 && vh > 0 && W > 0) {
      const scale = Math.max(W / vw, H / vh);
      let x = box.x * scale - (vw * scale - W) / 2;
      let y = box.y * scale - (vh * scale - H) / 2;
      let w = box.width * scale;
      let h = box.height * scale;
      // Élargit légèrement pour un cadrage « ovale » confortable
      x -= w * 0.12;
      y -= h * 0.16;
      w *= 1.24;
      h *= 1.32;
      const MAXW = W * 0.9;
      const MAXH = H * 0.9;
      if (w > MAXW || h > MAXH) {
        const k = Math.min(MAXW / w, MAXH / h);
        w *= k;
        h *= k;
      }
      x = Math.max(16, Math.min(W - w - 16, x));
      y = Math.max(16, Math.min(H - h - 16, y));
      return { x, y, w, h };
    }
    return null;
  })();

  const coulCadre = detecte && detecte.reconnu ? segment.couleur : (detecte ? '#fbbf24' : '#ef4444');

  const ovaleDefaut = {
    w: Math.min(tailleEcran.w * 0.62, 400),
    h: Math.min(tailleEcran.h * 0.34, 460),
  };

  const OV = cadrage || { x: (tailleEcran.w - ovaleDefaut.w) / 2, y: (tailleEcran.h - ovaleDefaut.h) / 2, ...ovaleDefaut };
  const coinW = Math.max(26, OV.w * 0.16);
  const coinH = Math.max(26, OV.h * 0.16);
  const coinCouches = [
    { left: -3, top: -3, radii: 'curveTL', bordL: true, bordT: true },
    { right: -3, top: -3, radii: 'curveTR', bordD: true, bordT: true },
    { left: -3, bottom: -3, radii: 'curveBL', bordL: true, bordB: true },
    { right: -3, bottom: -3, radii: 'curveBR', bordD: true, bordB: true },
  ];
  const stylesCoins = {
    curveTL: { borderTopLeftRadius: '100%' },
    curveTR: { borderTopRightRadius: '100%' },
    curveBL: { borderBottomLeftRadius: '100%' },
    curveBR: { borderBottomRightRadius: '100%' },
  };

  // ---- Plein écran immersif (scanner TikTok Live) ----
  if (enCamera || enSucces) {
    const heure = horloge;
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
        {/* Flux vidéo 100 % viewport, object-fit cover, aucune bordure */}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full object-cover opacity-95"
        />
        {/* Filtre cinématique léger */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/5 to-black/65" />

        {enCamera ? (
          <>
            {/* BADGE LIVE SCAN — haut gauche (néon vert clignotant) */}
            <div className="absolute left-4 top-4 flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 shadow-lg shadow-black/30 backdrop-blur-xl transition-transform duration-300 sm:left-6 sm:top-6">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Live Scan</span>
            </div>

            {/* HEURE + BASCULE CAMÉRA — haut droite */}
            <div className="absolute right-4 top-4 flex items-center gap-2 transition-all duration-300 sm:right-6 sm:top-6">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-center shadow-lg shadow-black/30 backdrop-blur-xl">
                <p className="font-mono text-lg font-black tabular-nums leading-none text-white sm:text-xl">{heure.slice(11)}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/60">{heure.slice(0, 10)}</p>
              </div>
              <button
                type="button"
                onClick={basculerCam}
                title="Changer de caméra (frontale / arrière)"
                aria-label="Changer de caméra"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-lg shadow-black/30 backdrop-blur-xl transition-transform duration-300 hover:rotate-180 hover:bg-white/25"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>

            {/* LIBELLÉ CENTRE HAUT — type de pointage en cours */}
            <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-white/15 bg-black/40 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.25em] text-white/90 backdrop-blur-md transition-transform duration-300 sm:top-6">
              {typePointage === 'arrivee' ? 'Entrée' : 'Sortie'} · Cadrez votre visage
            </div>

            {/* JAUGE DU VIVANT (anti-photo) — sous le libellé : clignement OU sourire requis */}
            <div
              className={`absolute left-1/2 top-14 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest backdrop-blur-md transition-all duration-300 sm:top-16 ${
                detecte && detecte.vivant
                  ? 'bg-emerald-500/90 text-emerald-950 shadow-[0_0_18px_rgba(34,255,136,0.9)]'
                  : 'border border-white/15 bg-black/40 text-white/70'
              }`}
            >
              {detecte && detecte.vivant ? '✓ Visage vivant détecté' : '👁 Clignez des yeux ou souriez'}
            </div>

            {/* CADRE OVALE DYNAMIQUE + COINS LUMINEUX */}
            <div
              className="pointer-events-none absolute transition-all duration-300 ease-out"
              style={{
                left: Math.max(0, OV.x - coinW),
                top: Math.max(0, OV.y - coinH),
                width: OV.w + coinW * 2,
                height: OV.h + coinH * 2,
              }}
            >
              <div
                className="absolute inset-0 rounded-full border-2 backdrop-blur-[1px]"
                style={{
                  borderColor: `${coulCadre}66`,
                  boxShadow: `0 0 32px ${coulCadre}40, inset 0 0 24px ${coulCadre}30`,
                  transition: 'border-color .3s ease, box-shadow .3s ease',
                }}
              />
              {coinCouches.map((c, i) => (
                <span
                  key={i}
                  className="absolute"
                  style={{
                    width: coinW,
                    height: coinH,
                    left: c.left,
                    top: c.top,
                    right: c.right,
                    bottom: c.bottom,
                    borderWidth: 0,
                    borderTopWidth: c.bordT ? 4 : 0,
                    borderLeftWidth: c.bordL ? 4 : 0,
                    borderRightWidth: c.bordD ? 4 : 0,
                    borderBottomWidth: c.bordB ? 4 : 0,
                    borderStyle: 'solid',
                    borderColor: coulCadre,
                    ...stylesCoins[c.radii],
                    filter: `drop-shadow(0 0 8px ${coulCadre})`,
                    transition: 'all .3s ease',
                  }}
                />
              ))}
            </div>

            {/* BAROMÈTRE DE CONFIANCE (VU-mètre) — droite */}
            <div
              className={`pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 rounded-3xl border border-white/15 bg-black/30 px-2 py-4 shadow-lg shadow-black/30 backdrop-blur-xl transition-transform duration-300 sm:right-5 ${estPaysage ? 'h-[72vh]' : 'h-[38vh]'}`}
            >
              <div className="flex h-full items-end gap-[3px]">
                {bars.map((amp, i) => {
                  const seuil = (i + 1) / NB_BARRES;
                  const actif = score >= seuil;
                  return (
                    <span
                      key={i}
                      className="w-[6px] rounded-full"
                      style={{
                        height: `${(seuil) * 100}%`,
                        background: actif ? segment.couleur : 'rgba(255,255,255,0.16)',
                        transform: `scaleY(${actif ? Math.max(0.35, amp) : 0.35})`,
                        transformOrigin: 'bottom',
                        boxShadow: actif ? `0 0 12px ${segment.couleur}99` : 'none',
                        transition: 'background .2s ease, box-shadow .2s ease',
                      }}
                    />
                  );
                })}
              </div>
              <p className="font-mono text-xs font-black tabular-nums" style={{ color: segment.couleur }}>
                {Math.round(score * 100)} %
              </p>
            </div>

            {/* CARTE FLOTTANTE BAS — employé détecté */}
            <div className="absolute inset-x-0 bottom-5 flex items-end justify-center gap-3 px-4 transition-all duration-300 sm:bottom-7">
              <div className="w-full max-w-xl rounded-3xl border border-white/20 bg-white/10 px-5 py-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
                {detecte && detecte.reconnu && detecte.employe ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black uppercase tracking-wide text-white sm:text-xl">
                        {detecte.employe.nom_prenom}
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-emerald-300">
                        mat. {detecte.employe.matricule}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-2xl font-black tabular-nums" style={{ color: segment.couleur }}>
                        {Math.round(score * 100)} %
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">{segment.libelle}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-3 w-3 shrink-0 rounded-full"
                      style={{ background: coulCadre, boxShadow: `0 0 12px ${coulCadre}` }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-white">Placez votre visage dans le cadrage ovale</p>
                      <p className="mt-0.5 text-[11px] text-white/60">Éclairez-vous, restez face à la caméra, puis clignez des yeux ou souriez pour valider le vivant.</p>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={annulerScan}
                className="shrink-0 rounded-3xl border border-white/20 bg-white/10 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-black/40 backdrop-blur-xl transition hover:bg-white/25"
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          /* ---- ÉCRAN DE SUCCÈS PLEIN ÉCRAN : flux gelé + flou + animation festive ---- */
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md">
            <div role="status" aria-live="polite" className="flex flex-col items-center px-6 text-center">
              <style>{`
                @keyframes borne-halo { 0%, 100% { transform: scale(1); opacity: .5; } 50% { transform: scale(1.18); opacity: .95; } }
                @keyframes borne-pop { 0% { transform: scale(0) rotate(-18deg); opacity: 0; } 55% { transform: scale(1.18) rotate(4deg); opacity: 1; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
                @keyframes borne-confetti { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-46vh) scale(.4); opacity: 0; } }
              `}</style>
              <div className="relative flex h-32 w-32 items-center justify-center sm:h-36 sm:w-36">
                <span className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/40 blur-2xl" style={{ animation: 'borne-halo 1.4s ease-in-out infinite' }} />
                <span
                  className="relative flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500/90 shadow-[0_0_60px_rgba(34,255,136,0.8)] sm:h-32 sm:w-32"
                  style={{ animation: 'borne-pop .55s cubic-bezier(.2,.9,.3,1.4) both' }}
                >
                  <span className="text-6xl leading-none sm:text-7xl">👌</span>
                </span>
              </div>
              <p className="mt-6 text-3xl font-black uppercase tracking-tight text-white drop-shadow-lg sm:text-5xl">
                Pointage validé !
              </p>
              {succes && succes.employe && (
                <div className="mt-5 max-w-xl rounded-3xl border border-emerald-300/30 bg-white/10 px-6 py-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <p className="truncate text-xl font-black uppercase tracking-wide text-emerald-200">
                    {succes.employe.nom_prenom}
                  </p>
                  <p className="mt-1 font-mono text-sm font-bold text-emerald-300">
                    mat. {succes.employe.matricule} ·{' '}
                    {succes.type === 'arrivee' ? 'Entrée' : 'Sortie'} ·{' '}
                    {succes.horodatage ? `${succes.horodatage.slice(0, 10)} ${succes.horodatage.slice(11)}` : ''}
                  </p>
                </div>
              )}
              {succes && succes.horsLigne && (
                <p className="mt-4 rounded-full bg-amber-500/20 px-4 py-1.5 text-[11px] font-bold text-amber-300 ring-1 ring-amber-400/30 backdrop-blur-md">
                  ⏳ En attente — synchronisation au retour en ligne
                </p>
              )}
              <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-white/50">
                Méthode · Biométrie Xmator-Eye
              </p>
              <p className="mt-2 text-xs text-white/60">Retour automatique à l&apos;accueil…</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Écrans « classiques » : chargement, erreur et accueil (boutons Entrée / Sortie) ----
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950 text-white">
      {/* Décor immersif */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-teal-500/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-600/5 blur-3xl" />

      {/* En-tête de la borne (compact) */}
      <header className="relative flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/60 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-3">
          <img
            src="/xmator-eye-logo.png"
            alt="Logo XMATOR EYE"
            className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/15"
          />
          <div>
            <p className="text-sm font-black tracking-wide">XMATOR EYE</p>
            <p className="text-[11px] uppercase tracking-widest text-slate-400">Borne de pointage biométrique</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[11px] text-slate-300 sm:flex">
          <span className={`h-2 w-2 rounded-full ${enLigne ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {enLigne ? 'En ligne' : 'Hors-ligne'}
          {queue.length > 0 && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">{queue.length} en attente</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 md:block">{user?.login}</span>
          <button onClick={deconnexion} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
            Déconnexion
          </button>
          <button onClick={() => navigate('/')} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">
            Sortir
          </button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
        {/* Horloge précise */}
        <div className="text-center">
          <p className="font-mono text-3xl font-black tracking-tight text-white sm:text-5xl">{horloge}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-slate-400">Date & heure locales</p>
        </div>

        {enChargement && (
          <div className="text-center text-sm text-slate-300">
            <p className="mb-2 text-lg font-semibold">{messageModele || 'Chargement…'}</p>
            <p className="text-xs text-slate-400">Modèles IA + signatures faciales des employés enrôlés.</p>
          </div>
        )}

        {enErreur && (
          <div className="card w-full max-w-xl border-red-400/30 bg-red-950/40 p-6 text-center ring-1 ring-red-500/30">
            <p className="text-sm font-semibold text-red-300">Erreur</p>
            <p className="mt-2 break-words text-sm text-red-200">{erreur}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button className="btn-secondary" onClick={() => navigate('/')}>Retour à l'application</button>
              <button className="btn-primary" onClick={() => navigate(0)}>Réessayer</button>
            </div>
          </div>
        )}

        {enAccueil && (
          <>
            {nbEnroles === 0 && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-200 ring-1 ring-amber-500/20">
                Aucun employé n'a encore de signature faciale. Enrôlez les visages depuis « Employés → Caméra en direct » avant d'utiliser la borne.
              </p>
            )}
            <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => demarrerCamera('arrivee')}
                disabled={nbEnroles === 0}
                className="flex min-h-[13rem] flex-col items-center justify-center gap-4 rounded-3xl border border-emerald-400/40 bg-emerald-600/80 p-8 shadow-2xl shadow-emerald-900/50 backdrop-blur-sm transition hover:scale-[1.02] hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[17rem]"
              >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                <span className="text-2xl font-black tracking-wide sm:text-3xl">HEURE D'ARRIVÉE</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-emerald-100">Reconnaissance faciale</span>
              </button>
              <button
                type="button"
                onClick={() => demarrerCamera('sortie')}
                disabled={nbEnroles === 0}
                className="flex min-h-[13rem] flex-col items-center justify-center gap-4 rounded-3xl border border-red-400/40 bg-red-600/80 p-8 shadow-2xl shadow-red-900/50 backdrop-blur-sm transition hover:scale-[1.02] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[17rem]"
              >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
                <span className="text-2xl font-black tracking-wide sm:text-3xl">HEURE DE SORTIE</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-red-100">Reconnaissance faciale</span>
              </button>
            </div>
            <p className="text-center text-xs text-slate-400">
              {nbEnroles > 0 ? `${nbEnroles} employé(s) enrôlé(s) disposent d'une signature faciale.` : 'Enrôlez les visages pour activer la borne.'}
              {' '}Reconnaissance faciale + seuil de confiance automatique.
            </p>
          </>
        )}
      </main>

      <footer className="relative border-t border-white/10 px-4 py-3 text-center text-[10px] uppercase tracking-widest text-slate-500">
        XMATOR EYE · Amicale du Personnel — Banque Centrale · reconnaissance faciale en temps réel · {getToken() ? 'session active' : 'non connecté'}
      </footer>
    </div>
  );
}