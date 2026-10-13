import { useSyncExternalStore } from 'react';

/**
 * Whether the Librarian's desk (the folder of everything the class has made) is open.
 * A tiny module store so the floor, the library room and the chat header can all open it,
 * and the floor can pan its camera back when it closes.
 */
let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

export const isDeskOpen = (): boolean => open;
export function openDesk(): void { if (!open) { open = true; emit(); } }
export function closeDesk(): void { if (open) { open = false; emit(); } }
export function useDeskOpen(): boolean {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => open);
}

/**
 * The floor registers how to fly its camera to a character; clicking the Librarian asks for a
 * pan, and the desk opens once the camera has arrived.
 */
let panHandler: ((agentId: string | null) => boolean) | null = null;
export function registerFloorPan(fn: ((agentId: string | null) => boolean) | null): void { panHandler = fn; }
/** Fly the camera to `agentId` (or back to the full view with null). False when there is no floor to fly. */
export function panFloorTo(agentId: string | null): boolean { return panHandler ? panHandler(agentId) : false; }

export const PAN_MS = 950;
/** Pan into the Librarian, then open the desk. Falls back to opening straight away. */
export function enterDesk(agentId: string | null): void {
  if (open) return;
  if (agentId && panFloorTo(agentId)) window.setTimeout(openDesk, PAN_MS);
  else openDesk();
}
