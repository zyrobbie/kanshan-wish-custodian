export const States = Object.freeze({
  IDLE: 'idle',
  PRODUCT_SEARCHING: 'product_searching',
  PRODUCT_SELECTING: 'product_selecting',
  EVIDENCE_LOADING: 'evidence_loading',
  EVIDENCE_READY: 'evidence_ready',
  EVIDENCE_PARTIAL: 'evidence_partial',
  CUSTODY_CONFIG: 'custody_config',
  SEALED: 'sealed',
  EXPIRED: 'expired',
  PURCHASE_READY: 'purchase_ready',
  ABANDONED: 'abandoned',
  ARCHIVED: 'archived',
  ERROR: 'error',
});

export const transitions = Object.freeze({
  [States.IDLE]: [States.PRODUCT_SEARCHING, States.ARCHIVED],
  [States.PRODUCT_SEARCHING]: [States.PRODUCT_SELECTING, States.ERROR, States.IDLE],
  [States.PRODUCT_SELECTING]: [States.EVIDENCE_LOADING, States.IDLE, States.ERROR],
  [States.EVIDENCE_LOADING]: [States.EVIDENCE_READY, States.EVIDENCE_PARTIAL, States.ERROR],
  [States.EVIDENCE_READY]: [States.CUSTODY_CONFIG, States.PRODUCT_SELECTING],
  [States.EVIDENCE_PARTIAL]: [States.CUSTODY_CONFIG, States.PRODUCT_SELECTING],
  [States.CUSTODY_CONFIG]: [States.SEALED, States.PRODUCT_SELECTING],
  [States.SEALED]: [States.EXPIRED],
  [States.EXPIRED]: [States.PURCHASE_READY, States.ABANDONED],
  [States.PURCHASE_READY]: [States.ARCHIVED],
  [States.ABANDONED]: [States.ARCHIVED],
  [States.ARCHIVED]: [States.IDLE],
  [States.ERROR]: [States.IDLE, States.PRODUCT_SELECTING, States.EVIDENCE_LOADING],
});

export function canTransition(from, to) {
  return transitions[from]?.includes(to) ?? false;
}

export function transition(from, to) {
  if (!canTransition(from, to)) throw new Error(`Illegal state transition: ${from} -> ${to}`);
  return to;
}
