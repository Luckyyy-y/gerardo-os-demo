"use client";
import type { ReactNode } from "react";
import type { WorkspaceState } from "@/lib/workspace";
export function SpotifyProvider({ children }: { children: ReactNode; clientId?: string }) { return <>{children}</>; }
export function SpotifyNowPlaying({ compact: _compact }: { compact?: boolean }) { return <p className="text-xs text-muted-foreground">Music connection disabled in demo</p>; }
export function SpotifyCard({ workspace: _workspace, onUpdate: _onUpdate }: { workspace: WorkspaceState; onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void }) { return <section className="panel p-5"><h2 className="font-semibold">A soundtrack for focus</h2><p className="mt-2 text-sm text-muted-foreground">The private app includes Spotify controls. This public demo does not sign in, play audio, or load account information.</p></section>; }
