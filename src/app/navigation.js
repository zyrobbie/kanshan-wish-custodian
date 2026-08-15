import { States } from './state-machine.js';

export const Views = Object.freeze({ FLOW: 'flow', WISHES: 'wishes' });

export function openWishFlow(record) {
  if (!record || !Object.values(States).includes(record.status)) throw new Error('Cannot open an unknown wish.');
  return { state: record.status, recordId: record.id };
}
