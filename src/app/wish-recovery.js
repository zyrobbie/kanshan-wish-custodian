import { WishStatuses } from './wish-domain.js';
import { States } from './state-machine.js';
import { Views } from './navigation.js';

const active = new Set([WishStatuses.SEALED, WishStatuses.EXPIRED]);

/** Select from server-authoritative wishes; never depends on a previous in-memory record id. */
export function recoveryTarget(wishes) {
  const candidates = wishes.filter((wish) => active.has(wish.status));
  if (candidates.length !== 1) return { view: Views.WISHES, record: null, state: null, reason: candidates.length > 1 ? 'multiple_active' : 'none_active' };
  const record = candidates[0];
  return { view: Views.FLOW, record, state: record.status === WishStatuses.EXPIRED ? States.EXPIRED : States.SEALED, reason: 'single_active' };
}
