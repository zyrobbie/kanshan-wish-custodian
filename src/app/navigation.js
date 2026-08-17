import { States } from './state-machine.js';

export const Views = Object.freeze({ FLOW: 'flow', WISHES: 'wishes' });

export function routeWishId(hash = window.location.hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#wish=')) return null;
  const id = hash.slice('#wish='.length);
  return id && !/[\u0000-\u001F\u007F]/.test(id) ? id : null;
}

export function setWishRoute(id) {
  if (typeof id !== 'string' || !id) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#wish=${encodeURIComponent(id)}`);
}

export function clearWishRoute() {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

export function openWishFlow(record) {
  if (!record || !Object.values(States).includes(record.status)) throw new Error('Cannot open an unknown wish.');
  return { state: record.status, recordId: record.id };
}
