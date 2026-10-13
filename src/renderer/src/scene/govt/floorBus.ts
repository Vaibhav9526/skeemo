/**
 * Commands from the UI to the floor scene (and nothing back): the app tells the floor "carry this
 * file", "walk the citizen to that counter", "that worker says …". The scene subscribes while it
 * is mounted; commands sent while it is not are dropped (the floor is only scenery).
 */
import type { DeskId } from '@shared/govt/cases';
import type { ActorId } from '@/govt/art/people';

export type FloorCommand =
  | { type: 'file'; from: DeskId | 'citizen'; to: DeskId; label?: string }
  | { type: 'walk'; to: DeskId }
  | { type: 'say'; actor: ActorId; text: string; ms?: number }
  | { type: 'busy'; actor: ActorId; on: boolean }
  | { type: 'arrive' }
  | { type: 'focus'; desk: DeskId | null };

type Listener = (c: FloorCommand) => void;
const listeners = new Set<Listener>();

export function subscribeFloor(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function floor(c: FloorCommand): void {
  for (const fn of [...listeners]) fn(c);
}
