const labels = Object.freeze({
  welcome: '看山在安静地望着你',
  guard: '看山正在守候这个愿望',
  release: '看山轻轻送别这次决定',
});

/** A small original in-repo SVG mascot. It contains no external image or user data. */
export function kanshanCharacter(state = 'welcome') {
  const name = labels[state] ?? labels.welcome;
  return `<div class="kanshan-character kanshan-${state}" role="img" aria-label="${name}">
    <svg viewBox="0 0 180 150" aria-hidden="true" focusable="false">
      <path class="mountain-back" d="M12 132 65 50l26 42 24-31 53 71Z" />
      <path class="mountain-front" d="M34 132 85 67l25 37 17-20 31 48Z" />
      <path class="lantern" d="M87 42h18l4 12-5 30H88l-5-30Z" />
      <path class="lantern-glow" d="M94 48h5v26h-5Z" />
      <circle class="eye eye-left" cx="65" cy="107" r="3" />
      <circle class="eye eye-right" cx="81" cy="107" r="3" />
      <path class="cloak" d="M52 130q21-35 44 0Z" />
      <path class="seal-mark" d="M122 112c10-12 22-12 32 0-10 12-22 12-32 0Z" />
    </svg>
  </div>`;
}
