export class AsyncTaskGate {
  #generation = 0;

  begin() { this.#generation += 1; return this.#generation; }
  invalidate() { this.#generation += 1; }
  isCurrent(token) { return token === this.#generation; }
}
