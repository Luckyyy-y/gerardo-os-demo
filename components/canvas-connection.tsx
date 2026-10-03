"use client";
import type { WorkspaceState } from "@/lib/workspace";
type Props = {
  workspace: WorkspaceState;
  onUpdate: (change: (current: WorkspaceState) => WorkspaceState) => void;
};

export function CanvasConnection(_props: Props) {
  return (
    <section className="rounded-2xl border border-white/10 p-5">
      <h3 className="font-semibold">Sample coursework</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        These courses and deadlines are fictional examples. Add and edit
        courses locally. Canvas imports and private calendar feeds are
        disabled in this demo.
      </p>
    </section>
  );
}

export function CanvasAutoSync(_props: Props & { ready: boolean }) {
  return null;
}

export function CanvasMaterials(_props: { workspace: WorkspaceState }) {
  return null;
}
