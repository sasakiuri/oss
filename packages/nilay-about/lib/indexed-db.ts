import { LabsReadOnlyError, labsSession, labsWritable, trackWrite } from '@/lib/labs-session';

/**
 * A small wrapper over one IndexedDB database, for the Labs data too large for localStorage
 * (pictures run to megabytes).
 *
 * The database is opened on first use and the connection kept. A refusal is not remembered, so a
 * later attempt, after the reader has freed storage or left a private window, can still succeed.
 * Every call runs in one transaction and settles only when the transaction has completed, so a
 * resolved write is on disk rather than merely queued.
 */

export interface IndexedDbSpec {
  name: string;
  version: number;
  /** Creates the object stores and indexes for a new or older database. */
  upgrade: (database: IDBDatabase, oldVersion: number, transaction: IDBTransaction) => void;
}

export interface IndexedDb {
  run: <R>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    work: (transaction: IDBTransaction) => IDBRequest<R>[] | void,
  ) => Promise<R[]>;
}

export function createIndexedDb(spec: IndexedDbSpec): IndexedDb {
  let opening: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening;
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      // Set once the attempt has been given up on (blocked), so a connection that opens later is closed
      // rather than left holding the database with nothing to use or close it.
      let abandoned = false;
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const request = indexedDB.open(spec.name, spec.version);
      request.onupgradeneeded = (event) => {
        if (request.transaction) spec.upgrade(request.result, event.oldVersion, request.transaction);
      };
      request.onsuccess = () => {
        const database = request.result;
        if (abandoned) {
          database.close();
          return;
        }
        // Another tab opening a newer version needs this connection out of the way.
        database.onversionchange = () => {
          database.close();
          opening = null;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
      request.onblocked = () => {
        abandoned = true;
        reject(new Error('IndexedDB is blocked'));
      };
    });
    opening.catch(() => {
      opening = null;
    });
    return opening;
  };

  return {
    run: <R>(
      storeNames: string | string[],
      mode: IDBTransactionMode,
      work: (transaction: IDBTransaction) => IDBRequest<R>[] | void,
    ): Promise<R[]> => {
      // Read or written only once this page holds its place among the open Labs pages (labs-session.ts).
      const running = labsSession()
        .then(() => {
          if (mode !== 'readonly' && !labsWritable()) throw new LabsReadOnlyError();
        })
        .then(open)
        .then(
          (database) =>
            new Promise<R[]>((resolve, reject) => {
              const transaction = database.transaction(storeNames, mode);
              const requests = work(transaction) ?? [];
              transaction.oncomplete = () => resolve(requests.map((request) => request.result));
              transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
              transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
            }),
        );
      // A write is tracked until it lands, so the tab's lock is not given up under it.
      return mode === 'readonly' ? running : trackWrite(running);
    },
  };
}
