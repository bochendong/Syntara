export type ParallelTaskQueueRunnerArgs<TItem> = {
  item: TItem;
  index: number;
  key: string;
  signal: AbortSignal;
  generation: number;
};

export type ParallelTaskQueueEntry<TItem, TResult> = {
  item: TItem;
  index: number;
  key: string;
  generation: number;
  abortController: AbortController;
  promise: Promise<TResult>;
};

export type ParallelTaskQueueResult<TItem, TResult> = {
  entry: ParallelTaskQueueEntry<TItem, TResult>;
  result: TResult;
  stale: boolean;
};

type ParallelTaskQueueOptions<TItem, TResult> = {
  concurrency: number;
  items?: TItem[];
  parentSignal?: AbortSignal;
  getKey?: (item: TItem, index: number) => string;
  run: (args: ParallelTaskQueueRunnerArgs<TItem>) => Promise<TResult>;
};

function createLinkedAbortController(parent?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!parent) return controller;
  if (parent.aborted) {
    controller.abort();
    return controller;
  }
  parent.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}

function clampCursor(cursor: number, total: number) {
  if (!Number.isFinite(cursor)) return 0;
  return Math.max(0, Math.min(total, Math.floor(cursor)));
}

export class ParallelTaskQueue<TItem, TResult> {
  private readonly concurrency: number;
  private readonly parentSignal?: AbortSignal;
  private readonly getKey: (item: TItem, index: number) => string;
  private readonly run: (args: ParallelTaskQueueRunnerArgs<TItem>) => Promise<TResult>;
  private items: TItem[];
  private cursor = 0;
  private generation = 0;
  private entries = new Map<string, ParallelTaskQueueEntry<TItem, TResult>>();

  constructor(options: ParallelTaskQueueOptions<TItem, TResult>) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency || 1));
    this.parentSignal = options.parentSignal;
    this.getKey = options.getKey ?? ((_item, index) => String(index));
    this.run = options.run;
    this.items = [...(options.items ?? [])];
  }

  get activeCount() {
    return this.entries.size;
  }

  get size() {
    return this.items.length;
  }

  enqueue(items: TItem | TItem[]) {
    const nextItems = Array.isArray(items) ? items : [items];
    this.items.push(...nextItems);
    this.fill();
    return this.items.length;
  }

  reset(nextCursor = 0, nextItems?: TItem[]) {
    this.generation += 1;
    this.abortActiveEntries();
    this.entries.clear();
    if (nextItems) {
      this.items = [...nextItems];
    }
    this.cursor = clampCursor(nextCursor, this.items.length);
  }

  abortAll() {
    this.generation += 1;
    this.abortActiveEntries();
    this.entries.clear();
  }

  fill() {
    while (this.entries.size < this.concurrency && this.cursor < this.items.length) {
      this.start(this.cursor);
      this.cursor += 1;
    }
  }

  async take(index: number): Promise<ParallelTaskQueueResult<TItem, TResult>> {
    const entry = this.ensure(index);
    if (!entry) {
      throw new Error(`Parallel task queue item ${index} does not exist`);
    }

    try {
      const result = await entry.promise;
      return {
        entry,
        result,
        stale: entry.generation !== this.generation,
      };
    } finally {
      if (this.entries.get(entry.key) === entry) {
        this.entries.delete(entry.key);
        this.fill();
      }
    }
  }

  private ensure(index: number) {
    this.fill();
    const item = this.items[index];
    if (item === undefined) return null;
    const key = this.getKey(item, index);
    return this.entries.get(key) ?? this.start(index);
  }

  private start(index: number) {
    const item = this.items[index];
    if (item === undefined) return null;
    const key = this.getKey(item, index);
    const existing = this.entries.get(key);
    if (existing) return existing;

    const generation = this.generation;
    const abortController = createLinkedAbortController(this.parentSignal);
    const entry: ParallelTaskQueueEntry<TItem, TResult> = {
      item,
      index,
      key,
      generation,
      abortController,
      promise: Promise.resolve().then(() =>
        this.run({
          item,
          index,
          key,
          signal: abortController.signal,
          generation,
        }),
      ),
    };
    this.entries.set(key, entry);
    return entry;
  }

  private abortActiveEntries() {
    for (const entry of this.entries.values()) {
      entry.abortController.abort();
    }
  }
}
