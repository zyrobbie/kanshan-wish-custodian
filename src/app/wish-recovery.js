import { WishStatuses, isFormalWish } from './wish-domain.js';
import { States } from './state-machine.js';
import { Views } from './navigation.js';

const active = new Set([WishStatuses.SEALED, WishStatuses.EXPIRED]);

export const RecoveryTriggers = Object.freeze({
  INITIAL_LOAD: 'initial_load',
  BACKGROUND_RETURN: 'background_return',
});

function stateForWish(wish) {
  if (!wish) return null;
  if (wish.status === WishStatuses.SEALED) return States.SEALED;
  if (wish.status === WishStatuses.EXPIRED) return States.EXPIRED;
  if (wish.status === WishStatuses.PURCHASED_INTENT) return States.PURCHASE_READY;
  if (wish.status === WishStatuses.ABANDONED) return States.ABANDONED;
  return null;
}

/** Select from server-authoritative wishes; never depends on a previous in-memory record id. */
export function recoveryTarget(wishes) {
  const candidates = wishes.filter((wish) => active.has(wish.status));
  if (candidates.length !== 1) return { view: Views.WISHES, record: null, state: null, reason: candidates.length > 1 ? 'multiple_active' : 'none_active' };
  const record = candidates[0];
  return { view: Views.FLOW, record, state: stateForWish(record), reason: 'single_active' };
}

/**
 * Decide whether a server refresh may change navigation. Initial loads can
 * restore a single active wish; background returns only refresh the current
 * sealed/decision page or the already-open wish list. A new product flow is
 * deliberately left untouched even if older active wishes exist on the server.
 */
export function recoveryPlan({ trigger, currentView, currentState, currentRecordId, routeWishId = null, wishes }) {
  if (trigger === RecoveryTriggers.INITIAL_LOAD) {
    // A root URL is always a fresh, stable home screen. Only an explicit route
    // created while opening a formal custody record may restore that record.
    if (!routeWishId) return { action: 'keep_current', reason: 'root_route' };
    const record = wishes.find((wish) => wish.id === routeWishId && isFormalWish(wish) && active.has(wish.status));
    const state = stateForWish(record);
    return record && state
      ? { action: 'replace_view', view: Views.FLOW, record, state, reason: 'explicit_wish_route' }
      : { action: 'keep_current', reason: 'invalid_or_completed_route' };
  }

  if (currentView === Views.WISHES) return { action: 'refresh_wishes', reason: 'wish_list' };

  if (currentView === Views.FLOW && [States.SEALED, States.EXPIRED].includes(currentState)) {
    const record = wishes.find((wish) => wish.id === currentRecordId);
    const state = stateForWish(record);
    if (record && state) return { action: 'refresh_current', record, state, reason: 'current_wish' };
  }

  return { action: 'keep_current', reason: 'protected_current_flow' };
}
