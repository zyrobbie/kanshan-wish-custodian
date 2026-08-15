export const DemoDurations = Object.freeze([24, 48, 72]);

export function durationFor(hours) {
  const seconds = Number(hours);
  if (!DemoDurations.includes(seconds)) throw new Error(`Unsupported demo duration: ${hours}`);
  return seconds;
}

export function createExpiry(seconds, now = Date.now()) {
  return now + durationFor(seconds) * 1000;
}

export function remainingSeconds(expiresAt, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(expiresAt) - now) / 1000));
}

export function hasExpired(expiresAt, now = Date.now()) {
  return remainingSeconds(expiresAt, now) === 0;
}
