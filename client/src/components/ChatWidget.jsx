import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { getSocket } from '../socket';

// Widget de chat en direct avec le Super Admin — visible par tous les rôles connectés.
// Bulle flottante bas-droite ; fenêtre animée (fixe sur desktop, quasi plein écran sur mobile).

function fmtHeure(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T'));
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatWidget({ user }) {
  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  const [nonLus, setNonLus] = useState(0);
  const [adminEnLigne, setAdminEnLigne] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const basRef = useRef(null);

  const estAdmin = user?.role === 'super_admin';
  // Le super admin discute depuis sa propre interface dédiée : pas de widget pour lui
  if (estAdmin) return null;

  // Chargement de l'historique à l'ouverture + marquage lu
  useEffect(() => {
    if (!ouvert || !user) return;
    api.chatMessages(user.id)
      .then((r) => setMessages(r.messages || []))
      .catch(() => {});
    api.chatMarquerLu(user.id).catch(() => {});
    setNonLus(0);
  }, [ouvert, user?.id]);

  // Socket temps réel : messages entrants, présence admin, badge non-lus
  useEffect(() => {
    if (!user) return;
    let sock;
    try { sock = getSocket(); } catch { return; }
    if (!sock) return;
    const surMessage = ({ message }) => {
      setMessages((prev) => (message && !prev.some((m) => m.id === message.id) ? [...prev, message] : prev));
      if (message && message.expediteur_role === 'admin') {
        api.chatMarquerLu(user.id).catch(() => {});
      }
    };
    const surPresence = ({ en_ligne }) => setAdminEnLigne(!!en_ligne);
    const surNonLus = ({ total }) => setNonLus(total);
    sock.on('chat:message', surMessage);
    sock.on('presence:admin', surPresence);
    sock.on('chat:non-lus', surNonLus);
    return () => {
      sock.off('chat:message', surMessage);
      sock.off('presence:admin', surPresence);
      sock.off('chat:non-lus', surNonLus);
    };
  }, [user?.id]);

  // Défilement auto en bas
  useEffect(() => {
    if (ouvert && basRef.current) basRef.current.scrollTop = basRef.current.scrollHeight;
  }, [messages, ouvert]);

  const envoyer = async (e) => {
    e.preventDefault();
    const contenu = texte.trim();
    if (!contenu || envoi) return;
    setEnvoi(true);
    setTexte('');
    try {
      await api.chatEnvoyer({ contenu });
    } catch {
      setTexte(contenu); // restitue en cas d'échec
    } finally {
      setEnvoi(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Fenêtre de discussion */}
      <div
        className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 ease-out ${
          ouvert ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
        } inset-x-3 bottom-3 top-20 sm:inset-x-auto sm:bottom-4 sm:end-4 sm:top-auto sm:h-[540px] sm:w-[380px]`}
        role="dialog"
        aria-label="Chat en direct avec l'administrateur"
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-brand-700 to-brand-500 px-4 py-3 text-white">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Assistance — Super Admin</p>
            <p className="flex items-center gap-1.5 text-xs text-white/80">
              <span className={`inline-block h-2 w-2 rounded-full ${adminEnLigne ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              {adminEnLigne ? 'Admin en ligne' : 'Admin hors ligne — réponse dès retour'}
            </p>
          </div>
          <button
            onClick={() => setOuvert(false)}
            title="Réduire"
            className="rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={basRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
          {messages.length === 0 && (
            <p className="mt-6 text-center text-xs text-slate-400">
              Aucun message pour l'instant.<br />Écrivez votre demande, le Super Admin y répondra ici même.
            </p>
          )}
          {messages.map((m) => {
            const mien = m.expediteur_id === user.id;
            return (
              <div key={m.id} className={`flex ${mien ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    mien
                      ? 'rounded-br-md bg-brand-700 text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.contenu}</p>
                  <p className={`mt-0.5 text-end text-[10px] ${mien ? 'text-white/70' : 'text-slate-400'}`}>{fmtHeure(m.date_envoi)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Saisie */}
        <form onSubmit={envoyer} className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
          <input
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Écrivez votre message…"
            maxLength={2000}
            className="input flex-1 py-2 text-sm"
          />
          <button type="submit" disabled={!texte.trim() || envoi} title="Envoyer" className="btn-primary shrink-0 px-3 py-2 disabled:opacity-40">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </form>
      </div>

      {/* Bulle flottante */}
      {!ouvert && (
        <button
          onClick={() => setOuvert(true)}
          title="Chat en direct avec l'administrateur"
          className="fixed bottom-4 end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-xl ring-2 ring-white/60 transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
          {nonLus > 0 && (
            <span className="absolute -end-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
              {nonLus > 99 ? '99+' : nonLus}
            </span>
          )}
        </button>
      )}
    </>
  );
}
