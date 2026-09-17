import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@shared/AuthContext';
import AppTerminal from './AppTerminal';
import './terminal.css';

// Enregistrement du service worker PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/terminal/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/terminal">
      <AuthProvider>
        <AppTerminal />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
