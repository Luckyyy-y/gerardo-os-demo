// Public-client PKCE. Tokens stay in this browser tab and never enter the
// synced workspace, GitHub, or a third-party proxy. No client secret is used.
const SESSION = "gerardo-spotify-session-v2";
const PENDING = "gerardo-spotify-oauth-v2";
type Token = { access: string; refresh: string; expires: number; clientId: string };
type Pending = { clientId: string; verifier: string; state: string; redirectUri: string; createdAt: number };
let exchangePromise: Promise<boolean> | undefined;
let refreshPromise: Promise<Token> | undefined;
let rateLimitedUntil = 0;
export class SpotifyError extends Error { constructor(message: string, public status = 400) { super(message); } }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
function token() { try { return JSON.parse(sessionStorage.getItem(SESSION) || "null") as Token | null; } catch { return null; } }
export function spotifyConnected() { return Boolean(token()?.refresh); }
export function spotifyDisconnect() { sessionStorage.removeItem(SESSION); sessionStorage.removeItem(PENDING); window.dispatchEvent(new Event("spotify-auth-changed")); }
export async function spotifyConnect(clientId: string) {
  if (!/^[A-Za-z0-9]{32}$/.test(clientId.trim())) throw new SpotifyError("Add your Spotify app’s public Client ID in Customize first.");
  const verifier = encode(crypto.getRandomValues(new Uint8Array(64))); const state = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const redirectUri = window.location.origin + "/";
  sessionStorage.setItem(PENDING, JSON.stringify({ clientId: clientId.trim(), verifier, state, redirectUri, createdAt: Date.now() } satisfies Pending));
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({ client_id: clientId.trim(), response_type: "code", redirect_uri: redirectUri, code_challenge_method: "S256", code_challenge: challenge, state, scope: "user-read-currently-playing user-read-playback-state user-modify-playback-state" }).toString();
  window.location.assign(url.href);
}
async function tokenRequest(body: URLSearchParams, previous?: Token) {
  const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    if ([400,401].includes(response.status)) spotifyDisconnect();
    throw new SpotifyError("Spotify sign-in could not be renewed. Connect Spotify again.", response.status);
  }
  const next: Token = { clientId: body.get("client_id")!, access: result.access_token, refresh: result.refresh_token || previous?.refresh, expires: Date.now() + Number(result.expires_in || 3600) * 1000 };
  if (!next.refresh) throw new SpotifyError("Spotify did not grant a renewable session. Connect again.");
  sessionStorage.setItem(SESSION, JSON.stringify(next)); return next;
}
export async function finishSpotifyAuth() {
  if (exchangePromise) return exchangePromise;
  exchangePromise = (async () => {
    // Remove the old non-renewing implementation's tokens during migration.
    for (const key of ["spotify-access-token", "spotify-token-expires", "spotify-client-id"]) localStorage.removeItem(key);
    const params = new URLSearchParams(window.location.search);
    if (!params.has("code") && !params.has("error")) return spotifyConnected();
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) { if (params.has("state")) { window.history.replaceState({}, "", window.location.pathname); throw new SpotifyError("The Spotify sign-in session expired. Connect again from this browser."); } return spotifyConnected(); }
    const pending = JSON.parse(raw) as Pending;
    try {
      if (params.get("state") !== pending.state || Date.now() - pending.createdAt > 10 * 60_000) throw new SpotifyError("The Spotify sign-in session did not match. Start Connect Spotify again.");
      if (params.has("error")) throw new SpotifyError("Spotify access was not granted. You can reconnect when ready.");
      await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code: params.get("code")!, redirect_uri: pending.redirectUri, client_id: pending.clientId, code_verifier: pending.verifier }));
      return true;
    } finally { sessionStorage.removeItem(PENDING); window.history.replaceState({}, "", window.location.pathname); }
  })();
  return exchangePromise;
}
async function accessToken(force = false) {
  const current = token(); if (!current) throw new SpotifyError("Connect Spotify to use playback controls.", 401);
  if (!force && current.expires > Date.now() + 60_000) return current.access;
  if (!refreshPromise) refreshPromise = tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: current.refresh, client_id: current.clientId }), current).finally(() => { refreshPromise = undefined; });
  return (await refreshPromise).access;
}
export async function spotifyRequest<T>(path: string, method = "GET", body?: unknown): Promise<T | null> {
  if (Date.now() < rateLimitedUntil) throw new SpotifyError("Spotify is limiting requests. Controls will resume after its cooldown.", 429);
  let access = await accessToken();
  const send = () => fetch(`https://api.spotify.com/v1${path}`, { method, headers: { Authorization: `Bearer ${access}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  let response = await send();
  if (response.status === 401) { access = await accessToken(true); response = await send(); }
  if (response.status === 204) return null;
  if (!response.ok) {
    if (response.status === 429) rateLimitedUntil = Date.now() + Math.max(15, Number(response.headers.get("retry-after")) || 60) * 1000;
    const message = response.status === 403 ? "Spotify denied this action. Check Premium, the app’s allowed users, and the playback permissions, then reconnect." : response.status === 404 ? "Open Spotify on your PC or tablet and start a song, then retry the control." : response.status === 429 ? "Spotify is limiting requests. Playback checks will pause briefly." : "Spotify could not complete this action. Try again.";
    throw new SpotifyError(message, response.status);
  }
  return await response.json().catch(() => null) as T | null;
}
export function spotifyUri(value: string) {
  if (/^spotify:(playlist|album|track):[A-Za-z0-9]{22}$/.test(value)) return value;
  try { const url = new URL(value); if (url.hostname !== "open.spotify.com") return null; const match = url.pathname.match(/^\/(?:intl-[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]{22})\/?$/); return match ? `spotify:${match[1]}:${match[2]}` : null; } catch { return null; }
}
