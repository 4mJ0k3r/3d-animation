/** A generation barrier: registrations reopen readiness; stale captures must re-prepare. */
export class Readiness {
  readonly controller = new AbortController();
  private pending = new Set<Promise<unknown>>();
  private failure: unknown;
  private failed = false;
  private revision = 0;
  private finalized = -1;
  private preparing: Promise<void> | null = null;
  get signal(): AbortSignal { return this.controller.signal; }
  get ready(): boolean { return !this.signal.aborted && this.finalized === this.revision; }

  register<T>(promise: Promise<T>): Promise<T> {
    if (this.signal.aborted) { void promise.catch(() => {}); throw new DOMException('Engine disposed', 'AbortError'); }
    this.revision++;
    this.pending.add(promise);
    // Observe immediately, including rejection before prepare is invoked.
    void promise.then(() => {this.pending.delete(promise);}, (error: unknown) => {this.pending.delete(promise); this.failure = error; this.failed = true;});
    return promise;
  }

  async wait<T>(promise: Promise<T>): Promise<T> {
    if (this.signal.aborted) throw new DOMException('Engine disposed', 'AbortError');
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException('Engine disposed', 'AbortError'));
      const finish = () => this.signal.removeEventListener('abort', abort);
      this.signal.addEventListener('abort', abort, {once: true});
      void promise.then((value) => {finish(); resolve(value);}, (error: unknown) => {finish(); reject(error);});
    });
  }

  prepare(resources: () => Promise<void>): Promise<void> {
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      for (;;) {
        if (this.failed) throw this.failure;
        const revision = this.revision;
        await this.wait(Promise.all([...this.pending]));
        await this.wait(resources());
        // Include registrations during font/image/compile awaits and their microtasks.
        await this.wait(Promise.resolve());
        if (this.failed) throw this.failure;
        if (this.pending.size || revision !== this.revision) continue;
        this.finalized = revision;
        return;
      }
    })().finally(() => {this.preparing = null;});
    return this.preparing;
  }

  dispose(): void { this.controller.abort(); this.pending.clear(); }
}
