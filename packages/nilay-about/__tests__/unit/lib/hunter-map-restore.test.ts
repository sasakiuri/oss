import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fakeIndexedDb, installFakeIndexedDb } from '../support/fake-indexeddb';

installFakeIndexedDb();

let storage: typeof import('@/lib/hunter-map-storage');
beforeAll(async () => {
  storage = await import('@/lib/hunter-map-storage');
});

const image = (id: string, byte: number) => ({
  id,
  data: new Uint8Array([byte]).buffer,
  type: 'image/png',
  name: `${id}.png`,
  width: 8,
  height: 6,
});
const setup = (id: string, name = id) => ({
  id,
  name,
  fiscalYear: null,
  points: [],
  model: 'affine',
  projection: 'transverse-mercator',
  zones: [],
});

async function snapshot() {
  const catalog = await storage.readCatalog();
  const ids = (await storage.readMapIds()).sort();
  const maps = await Promise.all(ids.map((id) => storage.readMapRaw(id)));
  return { ids, active: catalog.activeId, maps };
}

const imageKeys = () => [
  ...fakeIndexedDb.databases.get('nilay-labs-hunter-map-v1')!.stores.get('images')!.records.keys(),
];

describe('restoring hunter maps', () => {
  beforeEach(async () => {
    fakeIndexedDb.failWrites = 0;
    await storage.clearSavedMaps();
  });

  it('swaps every map for the staged ones and puts them all back on undo, as they were stored', async () => {
    await storage.writeNewMap('map-a', image('map-a', 1), setup('map-a'));
    // A setup the current schema cannot read is still kept and put back unchanged.
    await storage.writeNewMap('map-b', image('map-b', 2), { id: 'map-b', from: 'an older version' });
    await storage.writeActiveMap('map-a');
    const before = await snapshot();

    await storage.stageMapImage('t1', 'map-c', image('map-c', 3));
    await storage.stageMapCatalog('t1', [setup('map-c')], 'map-c');
    // Staged maps are invisible to the tool until the swap.
    expect((await snapshot()).ids).toEqual(['map-a', 'map-b']);

    await storage.commitStagedMaps('t1');
    const after = await snapshot();
    expect(after.ids).toEqual(['map-c']);
    expect(after.active).toBe('map-c');
    expect(after.maps[0]).toEqual({ setup: setup('map-c'), image: image('map-c', 3) });

    await storage.undoCommittedMaps('t1');
    expect(await snapshot()).toEqual(before);
    await storage.discardMapRestore('t1');
    expect(imageKeys().sort()).toEqual(['"map-a"', '"map-b"']);
  });

  it('clears every map when the backup had none, and finishes by deleting what was replaced', async () => {
    await storage.writeNewMap('map-a', image('map-a', 1), setup('map-a'));
    await storage.stageMapCatalog('t2', [], null);
    await storage.commitStagedMaps('t2');
    expect(await snapshot()).toEqual({ ids: [], active: undefined, maps: [] });
    await storage.discardMapRestore('t2');
    expect(imageKeys()).toEqual([]);
  });

  it('restores the same maps onto the device that has them', async () => {
    await storage.writeNewMap('map-a', image('map-a', 1), setup('map-a', 'old name'));
    await storage.stageMapImage('t3', 'map-a', image('map-a', 9));
    await storage.stageMapCatalog('t3', [setup('map-a', 'new name')], 'map-a');
    await storage.commitStagedMaps('t3');
    expect((await storage.readMapRaw('map-a')).setup).toMatchObject({ name: 'new name' });
    await storage.discardMapRestore('t3');
    expect(imageKeys()).toEqual(['"map-a"']);
  });

  it('refuses a swap with nothing staged, and an undo without a swap changes nothing', async () => {
    await storage.writeNewMap('map-a', image('map-a', 1), setup('map-a'));
    await expect(storage.commitStagedMaps('t4')).rejects.toThrow();
    await storage.undoCommittedMaps('t4');
    expect((await snapshot()).ids).toEqual(['map-a']);
  });

  it('leaves the maps as they were when the disk fills during the swap', async () => {
    await storage.writeNewMap('map-a', image('map-a', 1), setup('map-a'));
    await storage.stageMapImage('t5', 'map-c', image('map-c', 3));
    await storage.stageMapCatalog('t5', [setup('map-c')], 'map-c');
    const before = await snapshot();
    fakeIndexedDb.failWrites = 1;
    await expect(storage.commitStagedMaps('t5')).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
});
