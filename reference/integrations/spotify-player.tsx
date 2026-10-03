"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { spotifyConnected, spotifyConnect, spotifyDisconnect, finishSpotifyAuth, spotifyRequest, spotifyUri } from "@/lib/spotify";
import type { WorkspaceState } from "@/lib/workspace";

type Playback = { is_playing: boolean; progress_ms: number; device?: { name: string; is_restricted: boolean }; actions?: { disallows?: Record<string, boolean> }; item?: { name: string; duration_ms: number; external_urls?: { spotify?: string }; artists?: Array<{name: string}>; album?: { images?: Array<{url: string}> }; images?: Array<{url: string}>; show?: {name: string} } };
type Player = { playback: Playback | null; progress: number; connected: boolean; busy: boolean; error: string; connect(): void; disconnect(): void; command(action: string, body?: unknown): Promise<boolean> };
const Context = createContext<Player | null>(null);
export function SpotifyProvider({ children, clientId }: { children: ReactNode; clientId?: string }) {
  const [connected, setConnected] = useState(false); const [playback, setPlayback] = useState<Playback | null>(null); const [progress, setProgress] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const latest = useRef<{ data: Playback | null; at: number }>({ data: null, at: 0 }); const loading = useRef(false);
  async function load() {
    if (loading.current || document.hidden) return; loading.current = true;
    try { const data = await spotifyRequest<Playback>("/me/player"); latest.current = { data, at: Date.now() }; setPlayback(data); setProgress(data?.progress_ms || 0); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Spotify could not be reached."); setConnected(spotifyConnected()); }
    finally { loading.current = false; }
  }
  useEffect(() => {
    let active = true;
    void finishSpotifyAuth().then(value => { if (active) setConnected(value); }).catch(e => { if (active) setError(e.message); });
    const changed = () => { setConnected(spotifyConnected()); if (!spotifyConnected()) { setPlayback(null); setProgress(0); latest.current = { data: null, at: 0 }; } };
    window.addEventListener("spotify-auth-changed", changed); return () => { active = false; window.removeEventListener("spotify-auth-changed", changed); };
  }, []);
  useEffect(() => {
    if (!connected) return;
    void load(); const poll = setInterval(() => void load(), 15_000); const tick = setInterval(() => { const state = latest.current; if (!state.data) return; setProgress(Math.min(state.data.item?.duration_ms || 0, (state.data.progress_ms || 0) + (state.data.is_playing ? Date.now() - state.at : 0))); }, 1000);
    const visible = () => { if (!document.hidden) void load(); }; document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", visible); };
  }, [connected]);
  async function command(action: string, body?: unknown) {
    if (busy) return false; setBusy(true);
    try { await spotifyRequest(`/me/player/${action}`, action === "next" || action === "previous" ? "POST" : "PUT", body); setError(""); await load(); return true; }
    catch (e) { const message = e instanceof Error ? e.message : "Spotify command failed."; setError(message); toast.error(message); return false; }
    finally { setBusy(false); }
  }
  const value: Player = { connected, playback, progress, busy, error, command, disconnect: spotifyDisconnect, connect: () => { void spotifyConnect(clientId || "").catch(e => { setError(e.message); toast.error(e.message); }); } };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
function elapsed(ms: number) { return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`; }
export function SpotifyNowPlaying({ compact = false }: { compact?: boolean }) {
  const player = useContext(Context)!; const item = player.playback?.item; const disallows = player.playback?.actions?.disallows || {};
  const controls = player.connected && Boolean(item) && !player.playback?.device?.is_restricted && !player.busy;
  const cover = item?.album?.images?.[0]?.url || item?.images?.[0]?.url;
  return <div className="space-y-4 min-w-0"><div className="flex gap-3 items-center">{cover ? <img src={cover} alt={item ? `Album artwork for ${item.name}` : ""} className={`${compact ? "size-11" : "size-16"} shrink-0 rounded-lg object-cover`} /> : <div className={`${compact ? "size-11" : "size-16"} grid shrink-0 place-items-center rounded-lg bg-[#1ed760]/10`}><Music2 className="text-[#1ed760]" /></div>}<div className="min-w-0"><p className="text-sm text-[#1ed760]">{player.playback?.is_playing ? "Now playing" : item ? "Paused" : "Spotify"}</p><p className="font-semibold truncate">{item?.name || (player.connected ? "Start a song in Spotify" : "Connect your listening")}</p>{item && <p className="text-sm text-muted-foreground truncate">{item.artists?.map(a => a.name).join(", ") || item.show?.name}</p>}</div></div>
    {player.connected ? <><Slider aria-label="Spotify playback position" value={[player.progress]} max={item?.duration_ms || 1} step={1000} disabled={!controls || disallows.seeking} onValueCommit={v => void player.command(`seek?position_ms=${Math.round(v[0])}`)} /><div className="flex justify-between text-sm tabular-nums text-muted-foreground"><span>{elapsed(player.progress)}</span><span>{elapsed(item?.duration_ms || 0)}</span></div><div className="flex justify-center items-center gap-4"><Button variant="ghost" size="icon" disabled={!controls || disallows.skipping_prev} aria-label="Previous Spotify track" onClick={() => void player.command("previous")}><SkipBack /></Button><Button size="icon" className="rounded-full bg-[#1ed760] text-black hover:bg-[#1ed760]/80" disabled={!controls || (player.playback?.is_playing ? disallows.pausing : disallows.resuming)} aria-label={player.playback?.is_playing ? "Pause Spotify" : "Play Spotify"} onClick={() => void player.command(player.playback?.is_playing ? "pause" : "play")}>{player.playback?.is_playing ? <Pause /> : <Play />}</Button><Button variant="ghost" size="icon" disabled={!controls || disallows.skipping_next} aria-label="Next Spotify track" onClick={() => void player.command("next")}><SkipForward /></Button></div>{!compact && <p className="text-sm text-muted-foreground text-center">{player.playback?.device?.name ? `Playing through ${player.playback.device.name}` : "Open Spotify on your PC or tablet and start playback."}</p>}</> : <Button variant="outline" className="w-full" onClick={player.connect}><Music2 /> Connect Spotify</Button>}
    {player.error && !compact && <p role="alert" className="text-sm text-amber-200">{player.error}</p>}
    {!compact && <div className="flex flex-wrap gap-3 justify-between text-sm"><a href={item?.external_urls?.spotify || "https://open.spotify.com/"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#1ed760]">Open Spotify <ExternalLink className="size-3" /></a>{player.connected && <button onClick={player.disconnect} className="text-muted-foreground hover:text-foreground">Disconnect this browser</button>}</div>}
  </div>;
}
const focusMixes = [
  { name: "Deep Focus", note: "Ambient instrumentals", url: "https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ" },
  { name: "Peaceful Piano", note: "Quiet piano", url: "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO" },
];
export function SpotifyCard({ workspace, onUpdate }: { workspace: WorkspaceState; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) {
  const player = useContext(Context)!; const study = workspace.settings.spotifyStudyMode || false;
  const focusUrl = workspace.settings.spotifyFocusUrl || focusMixes[0].url; const [custom, setCustom] = useState(focusUrl);
  useEffect(() => setCustom(focusUrl), [focusUrl]);
  async function playUrl(url: string) {
    const uri = spotifyUri(url); if (!uri) { toast.error("Use a Spotify playlist, album, or track link."); return false; }
    if (!player.connected) { toast.info("Connect Spotify first, then start a song on your device."); return false; }
    return player.command("play", uri.startsWith("spotify:track:") ? { uris: [uri] } : { context_uri: uri });
  }
  async function toggle(enabled: boolean) { if (await playUrl(enabled ? focusUrl : workspace.settings.spotifyUrl)) onUpdate(current => ({ ...current, settings: { ...current.settings, spotifyStudyMode: enabled } })); }
  function select(url: string) { onUpdate(current => ({ ...current, settings: { ...current.settings, spotifyFocusUrl: url } })); }
  return <section className="spotify-card !p-0 overflow-hidden"><div className="grid md:grid-cols-2"><div className="p-5 sm:p-6"><h3 className="text-sm font-semibold text-muted-foreground mb-5">Your listening</h3><SpotifyNowPlaying /></div><div className="border-t md:border-t-0 md:border-l border-white/10 bg-[#1ed760]/[0.025] p-5 sm:p-6"><div className="flex justify-between items-center gap-4"><div><h3 className="font-semibold">Study mode</h3><p className="mt-1 text-sm text-muted-foreground">A quieter soundtrack for focused work.</p></div><Switch aria-label="Spotify study mode" checked={study} disabled={player.busy} onCheckedChange={enabled => void toggle(enabled)} /></div><div className="grid sm:grid-cols-2 gap-3 mt-5">{focusMixes.map(mix => <button key={mix.url} type="button" aria-pressed={focusUrl === mix.url} onClick={() => select(mix.url)} className={`rounded-xl border p-4 text-left ${focusUrl === mix.url ? "border-[#1ed760]/50 bg-[#1ed760]/10" : "border-white/10 hover:bg-white/5"}`}><Music2 className="size-5 text-[#1ed760] mb-3" /><p className="text-sm font-semibold">{mix.name}</p><p className="text-sm text-muted-foreground mt-1">{mix.note}</p></button>)}</div><div className="flex gap-2 mt-4"><Input value={custom} onChange={e => setCustom(e.target.value)} aria-label="Custom study playlist" placeholder="Or paste your own study playlist" /><Button variant="outline" onClick={() => { if (!spotifyUri(custom)) { toast.error("Use a valid Spotify playlist, album, or track link."); return; } select(custom); toast.success("Study playlist saved"); }}>Save</Button></div><div className="flex flex-wrap items-center gap-3 mt-4"><Button disabled={player.busy} variant="outline" onClick={() => void playUrl(focusUrl).then(ok => { if (ok) onUpdate(current => ({ ...current, settings: { ...current.settings, spotifyStudyMode: true } })); })}><Play /> Play study mix</Button><a className="text-sm text-[#1ed760]" href={focusUrl} target="_blank" rel="noreferrer">Open mix in Spotify ↗</a></div><p className="mt-4 text-sm text-muted-foreground">Turning Study mode off plays your saved Spotify mix. Playback controls need an active Spotify device and Premium access.</p></div></div></section>;
}
