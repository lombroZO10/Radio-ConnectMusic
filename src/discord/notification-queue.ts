type Task = () => Promise<void>;

interface QueueEntry {
  task: Task;
  key: string;
  createdAt: number;
}

export class NotificationQueue {
  readonly #queues = new Map<string, QueueEntry[]>();
  readonly #running = new Set<string>();
  readonly #lastSent = new Map<string, number>();
  readonly #cooldownMs: number;

  constructor(cooldownMs = 2500) {
    this.#cooldownMs = cooldownMs;
  }

  enqueue(scope: string, key: string, task: Task): void {
    const queue = this.#queues.get(scope) ?? [];
    const now = Date.now();
    if (queue.some((item) => item.key === key && now - item.createdAt < 15_000)) return;
    if ((this.#lastSent.get(`${scope}:${key}`) ?? 0) + 15_000 > now) return;
    queue.push({ task, key, createdAt: now });
    this.#queues.set(scope, queue);
    void this.#drain(scope);
  }

  clear(scope?: string): void {
    if (scope) this.#queues.delete(scope);
    else this.#queues.clear();
  }

  async #drain(scope: string): Promise<void> {
    if (this.#running.has(scope)) return;
    this.#running.add(scope);
    try {
      while (this.#queues.get(scope)?.length) {
        const queue = this.#queues.get(scope);
        const entry = queue?.shift();
        if (!entry) break;
        const wait = Math.max(0, this.#cooldownMs - (Date.now() - (this.#lastSent.get(scope) ?? 0)));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          await entry.task();
          this.#lastSent.set(scope, Date.now());
          this.#lastSent.set(`${scope}:${entry.key}`, Date.now());
        } catch {
          // A failed notification must never break the radio or the queue.
        }
      }
    } finally {
      this.#running.delete(scope);
      if (!this.#queues.get(scope)?.length) this.#queues.delete(scope);
    }
  }
}
