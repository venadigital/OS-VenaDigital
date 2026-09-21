// Google OAuth round trip: the app sends the user to Google's consent page and Google
// returns to /calendario with ?code&state. The code is exchanged on the server.
import type { Api } from '@/data/api';

const STATE_KEY = 'vena-os-google-oauth-state';

export const googleRedirectUri = () => `${window.location.origin}/calendario`;

export async function startGoogleConnect(api: Api): Promise<void> {
  if (api.mode === 'demo') return api.calendarConnect('', '');
  const state = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(STATE_KEY, state);
  window.location.assign(await api.calendarAuthUrl(googleRedirectUri(), state));
}

const handled = new Set<string>(); // an authorization code only works once (StrictMode runs effects twice)

/** Finishes the round trip when the URL carries Google's answer. Resolves to true once connected. */
export async function finishGoogleConnect(api: Api, params: URLSearchParams): Promise<boolean> {
  const code = params.get('code');
  const error = params.get('error');
  if (error) throw new Error(error === 'access_denied' ? 'Cancelaste el permiso en Google' : `Google respondió: ${error}`);
  if (!code || handled.has(code)) return false;
  handled.add(code);
  const expected = localStorage.getItem(STATE_KEY);
  localStorage.removeItem(STATE_KEY);
  // The state ties Google's answer to the request this browser started.
  if (!expected || params.get('state') !== expected) throw new Error('La respuesta de Google no coincide con esta sesión. Intenta conectar de nuevo.');
  await api.calendarConnect(code, googleRedirectUri());
  return true;
}
