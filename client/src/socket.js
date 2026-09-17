import { io } from 'socket.io-client';
import { api, getToken } from './api';

// Singleton Socket.IO : un seul socket pour toute l'application (widget de chat,
// présence admin, badges de non-lus). L'authentification repose sur le JWT d'accès
// (mémoire) — avec repli sur le cookie de session côté serveur.
let socket = null;

export function getSocket() {
  if (!getToken()) return null;
  if (!socket) {
    // « auth » est une fonction : un jeton frais est fourni à CHAQUE (re)connexion
    // (l'ancien JWT figé dans un objet auth resterait valide jusqu'à son expiration).
    socket = io('/', {
      auth: (cb) => {
        (async () => {
          if (getToken()) return cb({ token: getToken() });
          try {
            const r = await api.auth.refresh();
            cb({ token: r.token });
          } catch {
            cb({});
          }
        })();
      },
      transports: ['websocket', 'polling'],
    });
    socket.on('connect_error', (err) => {
      if (err && /authentifié|expiré|désactivé/i.test(err.message)) {
        // Jeton trop ancien → on régénère depuis le cookie puis on relance la connexion.
        api.auth.refresh()
          .then(() => { try { socket.connect(); } catch {} })
          .catch(() => {
            try { socket.disconnect(); } catch {}
            socket = null;
          });
      }
    });
    socket.on('disconnect', () => { /* reconnexion automatique par socket.io */ });
  }
  return socket;
}

export function fermerSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
}