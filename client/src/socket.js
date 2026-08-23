import { io } from 'socket.io-client';
import { getToken } from './api';

// Singleton Socket.IO : un seul socket pour toute l'application (widget de chat,
// présence admin, badges de non-lus). Le JWT est transmis à la connexion —
// même authentification que l'API REST.
let socket = null;

export function getSocket() {
  if (!getToken()) return null;
  if (!socket) {
    socket = io('/', { auth: { token: getToken() }, transports: ['websocket', 'polling'] });
    // Si le token change (re-login), le prochain getSocket() recrée la connexion
    socket.on('connect_error', (err) => {
      if (err && /authentifié|expiré|désactivé/i.test(err.message)) {
        try { socket.disconnect(); } catch {}
        socket = null;
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
