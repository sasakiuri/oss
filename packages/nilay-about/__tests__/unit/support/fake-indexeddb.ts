/**
 * An in-memory IndexedDB, enough of it for the Labs storage modules: object stores with in-line or
 * out-of-line keys, indexes (compound ones too), key ranges, cursors, and transactions that run their
 * requests in order, complete when none is left and put everything back when aborted.
 *
 * jsdom has no IndexedDB. This stands in for it so the storage code runs as written in the unit tests;
 * the E2E specs run it against a real browser. `failWrites` makes the next writes fail as a full disk
 * would, which aborts their transaction.
 *
 * It is one tab's database and no more: it does not track connections, so `blocked`, `versionchange`
 * and transactions waiting on another tab never happen, and an aborted upgrade does not put the
 * version or the stores back. Tests of upgrades or of several tabs belong in the E2E specs.
 */

type Key = string | number | Key[];

function compare(a: Key, b: Key): number {
  const rank = (key: Key) => (typeof key === 'number' ? 0 : typeof key === 'string' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const order = compare(a[index]!, b[index]!);
      if (order !== 0) return order;
    }
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

class FakeKeyRange {
  constructor(
    readonly lower: Key | undefined,
    readonly upper: Key | undefined,
    readonly lowerOpen = false,
    readonly upperOpen = false,
  ) {}
  static only(key: Key) {
    return new FakeKeyRange(key, key);
  }
  static bound(lower: Key, upper: Key, lowerOpen = false, upperOpen = false) {
    return new FakeKeyRange(lower, upper, lowerOpen, upperOpen);
  }
  includes(key: Key): boolean {
    if (this.lower !== undefined) {
      const order = compare(key, this.lower);
      if (order < 0 || (order === 0 && this.lowerOpen)) return false;
    }
    if (this.upper !== undefined) {
      const order = compare(key, this.upper);
      if (order > 0 || (order === 0 && this.upperOpen)) return false;
    }
    return true;
  }
}

const matches = (query: unknown, key: Key) =>
  query === undefined || query === null
    ? true
    : query instanceof FakeKeyRange
      ? query.includes(key)
      : compare(key, query as Key) === 0;

const serial = (key: Key) => JSON.stringify(key);

function keyAt(value: unknown, path: string | string[]): Key | undefined {
  if (Array.isArray(path)) {
    const parts = path.map((part) => keyAt(value, part));
    return parts.some((part) => part === undefined) ? undefined : (parts as Key[]);
  }
  const found = (value as Record<string, unknown> | null)?.[path];
  return typeof found === 'string' || typeof found === 'number' ? found : undefined;
}

interface StoreData {
  keyPath: string | null;
  records: Map<string, { key: Key; value: unknown }>;
  indexes: Map<string, string | string[]>;
}

interface DatabaseData {
  version: number;
  stores: Map<string, StoreData>;
}

export const fakeIndexedDb = {
  databases: new Map<string, DatabaseData>(),
  /** The next this many writes fail, each aborting its transaction. */
  failWrites: 0,
  reset() {
    this.databases.clear();
    this.failWrites = 0;
  },
};

class FakeRequest {
  result: unknown = undefined;
  error: DOMException | null = null;
  onsuccess: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  transaction: FakeTransaction | null = null;
  // Used by open requests.
  onupgradeneeded: ((event: { oldVersion: number }) => void) | null = null;
  onblocked: (() => void) | null = null;
}

class FakeCursor {
  constructor(
    private readonly transaction: FakeTransaction,
    private readonly store: StoreData,
    private readonly request: FakeRequest,
    private readonly entries: { key: Key; primaryKey: Key }[],
    private position: number,
  ) {}
  get key() {
    return this.entries[this.position]!.key;
  }
  get primaryKey() {
    return this.entries[this.position]!.primaryKey;
  }
  get value() {
    return structuredClone(this.store.records.get(serial(this.primaryKey))?.value);
  }
  delete() {
    const primaryKey = this.primaryKey;
    return this.transaction.enqueue(() => {
      this.store.records.delete(serial(primaryKey));
      return undefined;
    });
  }
  continue() {
    this.transaction.schedule(this.request, () => {
      let next = this.position + 1;
      // Records deleted since the cursor opened are passed over.
      while (next < this.entries.length && !this.store.records.has(serial(this.entries[next]!.primaryKey))) next += 1;
      return next < this.entries.length
        ? new FakeCursor(this.transaction, this.store, this.request, this.entries, next)
        : null;
    });
  }
}

class FakeIndex {
  constructor(
    private readonly transaction: FakeTransaction,
    private readonly store: StoreData,
    private readonly path: string | string[],
  ) {}
  private entries(query: unknown) {
    const list: { key: Key; primaryKey: Key; value: unknown }[] = [];
    for (const record of this.store.records.values()) {
      const key = keyAt(record.value, this.path);
      if (key !== undefined && matches(query, key)) list.push({ key, primaryKey: record.key, value: record.value });
    }
    return list.sort((a, b) => compare(a.key, b.key) || compare(a.primaryKey, b.primaryKey));
  }
  getAll(query?: unknown) {
    return this.transaction.enqueue(() => this.entries(query).map((entry) => structuredClone(entry.value)));
  }
  getAllKeys(query?: unknown) {
    return this.transaction.enqueue(() => this.entries(query).map((entry) => entry.primaryKey));
  }
  count(query?: unknown) {
    return this.transaction.enqueue(() => this.entries(query).length);
  }
  openCursor(query?: unknown) {
    const request = new FakeRequest();
    this.transaction.schedule(request, () => {
      const entries = this.entries(query);
      return entries.length ? new FakeCursor(this.transaction, this.store, request, entries, 0) : null;
    });
    return request;
  }
}

class FakeObjectStore {
  constructor(
    private readonly owner: FakeTransaction,
    private readonly data: StoreData,
  ) {}
  get transaction() {
    return this.owner;
  }
  private sorted(query?: unknown) {
    return [...this.data.records.values()]
      .filter((record) => matches(query, record.key))
      .sort((a, b) => compare(a.key, b.key));
  }
  private write(value: unknown, key: Key | undefined, add: boolean) {
    return this.owner.enqueue(() => {
      const resolved = this.data.keyPath ? keyAt(value, this.data.keyPath) : key;
      if (resolved === undefined) throw new DOMException('No key', 'DataError');
      if (add && this.data.records.has(serial(resolved))) throw new DOMException('Key exists', 'ConstraintError');
      if (fakeIndexedDb.failWrites > 0) {
        fakeIndexedDb.failWrites -= 1;
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      this.data.records.set(serial(resolved), { key: resolved, value: structuredClone(value) });
      return resolved;
    });
  }
  put(value: unknown, key?: Key) {
    return this.write(value, key, false);
  }
  add(value: unknown, key?: Key) {
    return this.write(value, key, true);
  }
  get(query: unknown) {
    return this.owner.enqueue(() => structuredClone(this.sorted(query)[0]?.value));
  }
  getKey(query: unknown) {
    return this.owner.enqueue(() => this.sorted(query)[0]?.key);
  }
  getAll(query?: unknown) {
    return this.owner.enqueue(() => this.sorted(query).map((record) => structuredClone(record.value)));
  }
  getAllKeys(query?: unknown) {
    return this.owner.enqueue(() => this.sorted(query).map((record) => record.key));
  }
  count(query?: unknown) {
    return this.owner.enqueue(() => this.sorted(query).length);
  }
  delete(query: unknown) {
    return this.owner.enqueue(() => {
      for (const record of this.sorted(query)) this.data.records.delete(serial(record.key));
      return undefined;
    });
  }
  clear() {
    return this.owner.enqueue(() => {
      this.data.records.clear();
      return undefined;
    });
  }
  index(name: string) {
    const path = this.data.indexes.get(name);
    if (!path) throw new DOMException(`No index ${name}`, 'NotFoundError');
    return new FakeIndex(this.owner, this.data, path);
  }
  createIndex(name: string, path: string | string[]) {
    this.data.indexes.set(name, path);
  }
  openCursor(query?: unknown) {
    const request = new FakeRequest();
    this.owner.schedule(request, () => {
      const entries = this.sorted(query).map((record) => ({ key: record.key, primaryKey: record.key }));
      return entries.length ? new FakeCursor(this.owner, this.data, request, entries, 0) : null;
    });
    return request;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: DOMException | null = null;
  private readonly queue: { request: FakeRequest; run: () => unknown }[] = [];
  private finished = false;
  private readonly backup: Map<string, Map<string, { key: Key; value: unknown }>>;

  constructor(
    private readonly database: DatabaseData,
    private readonly names: string[],
  ) {
    this.backup = new Map(names.map((name) => [name, new Map(database.stores.get(name)?.records ?? [])]));
    setTimeout(() => this.step(), 0);
  }
  objectStore(name: string) {
    const data = this.database.stores.get(name);
    if (!data || !this.names.includes(name)) throw new DOMException(`No store ${name}`, 'NotFoundError');
    return new FakeObjectStore(this, data);
  }
  enqueue(run: () => unknown) {
    const request = new FakeRequest();
    request.transaction = this;
    this.schedule(request, run);
    return request;
  }
  schedule(request: FakeRequest, run: () => unknown) {
    if (this.finished) throw new DOMException('The transaction has finished', 'TransactionInactiveError');
    this.queue.push({ request, run });
  }
  abort() {
    if (this.finished) return;
    this.finished = true;
    this.error ??= new DOMException('Aborted', 'AbortError');
    for (const [name, records] of this.backup) {
      const data = this.database.stores.get(name);
      if (data) data.records = new Map(records);
    }
    setTimeout(() => this.onabort?.(), 0);
  }
  private step() {
    while (!this.finished && this.queue.length > 0) {
      const { request, run } = this.queue.shift()!;
      try {
        request.result = run();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error as DOMException;
        this.error = error as DOMException;
        request.onerror?.({ target: request });
        this.onerror?.();
        this.abort();
        return;
      }
    }
    if (this.finished) return;
    this.finished = true;
    setTimeout(() => this.oncomplete?.(), 0);
  }
}

class FakeDatabase {
  onversionchange: (() => void) | null = null;
  constructor(
    private readonly data: DatabaseData,
    private readonly upgrade: FakeTransaction | null = null,
  ) {}
  get objectStoreNames() {
    return { contains: (name: string) => this.data.stores.has(name) };
  }
  createObjectStore(name: string, options: { keyPath?: string } = {}) {
    this.data.stores.set(name, { keyPath: options.keyPath ?? null, records: new Map(), indexes: new Map() });
    return new FakeObjectStore(this.upgrade!, this.data.stores.get(name)!);
  }
  deleteObjectStore(name: string) {
    this.data.stores.delete(name);
  }
  transaction(names: string | string[], _mode?: string) {
    return new FakeTransaction(this.data, Array.isArray(names) ? names : [names]);
  }
  close() {}
}

function open(name: string, version = 1) {
  const request = new FakeRequest();
  setTimeout(() => {
    let data = fakeIndexedDb.databases.get(name);
    if (!data) {
      data = { version: 0, stores: new Map() };
      fakeIndexedDb.databases.set(name, data);
    }
    const oldVersion = data.version;
    if (version > oldVersion) {
      data.version = version;
      const upgrade = new FakeTransaction(data, [...data.stores.keys()]);
      // Stores created during the upgrade belong to it too.
      Object.defineProperty(upgrade, 'names', { get: () => [...data.stores.keys()] });
      const database = new FakeDatabase(data, upgrade);
      request.result = database;
      request.transaction = upgrade;
      request.onupgradeneeded?.({ oldVersion });
      upgrade.oncomplete = () => request.onsuccess?.({ target: request });
      return;
    }
    request.result = new FakeDatabase(data);
    request.onsuccess?.({ target: request });
  }, 0);
  return request;
}

/** Installs the fake as the global IndexedDB for the test file that calls it. */
export function installFakeIndexedDb() {
  Object.assign(globalThis, {
    indexedDB: {
      open,
      deleteDatabase: (name: string) => {
        fakeIndexedDb.databases.delete(name);
        const request = new FakeRequest();
        setTimeout(() => request.onsuccess?.({ target: request }), 0);
        return request;
      },
    },
    IDBKeyRange: FakeKeyRange,
  });
}
