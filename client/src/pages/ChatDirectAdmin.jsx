import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { getSocket } from '../socket';

// Interface Super Admin « Chat en direct » : conversations avec chaque compte
// (badge de non-lus, aperçu du dernier message) + fil de discussion pour répondre.

function fmtHeure(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T'));
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ChatDirectAdmin() {
  const [conversations, setConversations] = useState([]);
  const [selection, setSelection] = useState(null);
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  const [adminEnLigne, setAdminEnLigne] = useState(true);
  const basRef = useRef(null);

  const chargerConversations = async () => {
    try {
      const d = await api.chatConversations();
      setConversations(d.conversations || []);
    } catch { /* silencieux */ }
  };

  useEffect(() => {
    chargerConversations();
    const t = setInterval(chargerConversations, 15 * 1000);
    return () => clearInterval(t);
  }, []);

  // Historique de la conversation sélectionnée + marquage lu
  useEffect(() => {
    if (!selection) return;
    api.chatMessages(selection.utilisateur_id)
      .then((r) => setMessages(r.messages || []))
      .catch(() => {});
    api.chatMarquerLu(selection.utilisateur_id)
      .then(chargerConversations)
      .catch(() => {});
  }, [selection?.utilisateur_id]);

  // Temps réel : nouveaux messages + présence admin
  useEffect(() => {
    let sock;
    try { sock = getSocket(); } catch { return; }
    if (!sock) return;
    const surMessage = ({ message }) => {
      chargerConversations();
      if (message && selection && message.utilisateur_id === selection.utilisateur_id) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        if (message.expediteur_role === 'utilisateur') {
          api.chatMarquerLu(selection.utilisateur_id).catch(() => {});
        }
      }
    };
    sock.on('chat:message', surMessage);
    sock.on('presence:admin', ({ en_ligne }) => setAdminEnLigne(!!en_ligne));
    return () => {
      sock.off('chat:message', surMessage);
      sock.off('presence:admin');
    };
  }, [selection?.utilisateur_id]);

  useEffect(() => {
    if (basRef.current) basRef.current.scrollTop = basRef.current.scrollHeight;
  }, [messages]);

  const repondre = async (e) => {
    e.preventDefault();
    const contenu = texte.trim();
    if (!contenu || !selection) return;
    setTexte('');
    try {
      await api.chatEnvoyer({ utilisateur_id: selection.utilisateur_id, contenu });
    } catch {
      setTexte(contenu);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Chat en direct avec les utilisateurs</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Conversations avec chaque compte (tous rôles) — messages en temps réel, historique persistant.
          <span className={`ms-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${adminEnLigne ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
            <span className={`h-2 w-2 rounded-full ${adminEnLigne ? 'bg-emerald-500' : 'bg-slate-400'}`} /> Vous êtes {adminEnLigne ? 'en ligne' : 'hors ligne'}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Liste des conversations */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Conversations ({conversations.length})
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {conversations.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-slate-400">Aucune conversation.<br />Les comptes vous écrivent depuis la bulle flottante.</p>
            )}
            {conversations.map((c) => (
              <button
                key={c.utilisateur_id}
                onClick={() => setSelection(c)}
                className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-start transition hover:bg-slate-50 ${
                  selection?.utilisateur_id === c.utilisateur_id ? 'bg-brand-50/70' : ''
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
                  {(c.login || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{c.login}</span>
                    {c.non_lus > 0 && (
                      <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">{c.non_lus}</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-slate-400">{c.dernier_message || '—'}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-slate-300">{c.role || ''} · {fmtHeure(c.derniere_date)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Fil de discussion */}
        <div className="card flex min-h-[420px] flex-col overflow-hidden lg:h-[600px]">
          {!selection ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-400">
              Sélectionnez une conversation dans la liste pour lire et répondre.
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 bg-gradient-to-r from-brand-700 to-brand-500 px-4 py-3 text-white">
                <p className="text-sm font-bold">{selection.login}</p>
                <p className="text-xs text-white/80">Rôle : {selection.role || '—'}</p>
              </div>
              <div ref={basRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
                {messages.map((m) => {
                  const moi = m.expediteur_role === 'admin';
                  return (
                    <div key={m.id} className={`flex ${moi ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        moi ? 'rounded-br-md bg-brand-700 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{m.contenu}</p>
                        <p className={`mt-0.5 text-end text-[10px] ${moi ? 'text-white/70' : 'text-slate-400'}`}>{fmtHeure(m.date_envoi)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={repondre} className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
                <input
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  placeholder={`Répondre à ${selection.login}…`}
                  maxLength={2000}
                  className="input flex-1 py-2"
                />
                <button type="submit" disabled={!texte.trim()} className="btn-primary shrink-0 px-4 disabled:opacity-40">Envoyer</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
