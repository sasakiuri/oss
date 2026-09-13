// SPDX-License-Identifier: MIT
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installAppImage, launchAppImage } from '../src/installAppImage';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, rename: vi.fn(original.rename) };
});

const directories: string[] = [];

async function files(currentName = 'Saika.AppImage', nextName = 'Saika-0.4.0.AppImage') {
  const directory = await mkdtemp(join(tmpdir(), 'saika-appimage-test-'));
  directories.push(directory);
  const cache = join(directory, 'cache');
  await mkdir(cache);
  const current = join(directory, currentName);
  const downloaded = join(cache, nextName);
  await writeFile(current, 'previous executable', { mode: 0o755 });
  await writeFile(downloaded, 'updated executable', { mode: 0o755 });
  return { directory, current, downloaded };
}

afterEach(async () => {
  vi.mocked(rename).mockClear();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('AppImage installation', () => {
  it('preserves a custom filename and installs the verified contents', async () => {
    const { directory, current, downloaded } = await files();
    const launch = vi.fn(async (destination: string) => {
      expect(await readFile(destination, 'utf8')).toBe('updated executable');
    });

    expect(await installAppImage(current, downloaded, launch)).toBe(current);

    expect(launch).toHaveBeenCalledOnce();
    expect(await readFile(current, 'utf8')).toBe('updated executable');
    expect(await readFile(downloaded, 'utf8')).toBe('updated executable');
    expect(await readdir(directory)).toEqual(expect.arrayContaining(['cache', basename(current)]));
    expect((await readdir(directory)).filter((entry) => entry.startsWith('.saika-update-'))).toHaveLength(0);
  });

  it.skipIf(process.platform === 'win32')('sets executable permissions before launching', async () => {
    const { current, downloaded } = await files();
    await chmod(downloaded, 0o644);
    const launch = vi.fn(async (destination: string) => {
      expect((await stat(destination)).mode & 0o111).toBe(0o111);
    });

    await installAppImage(current, downloaded, launch);

    expect(launch).toHaveBeenCalledOnce();
  });

  it('retains a versioned original until the new process has spawned', async () => {
    const { current, downloaded } = await files('Saika-0.3.0.AppImage');
    let confirmSpawn!: () => void;
    const launch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          confirmSpawn = resolve;
        }),
    );
    const installation = installAppImage(current, downloaded, launch);
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());

    expect(await readFile(current, 'utf8')).toBe('previous executable');
    confirmSpawn();
    const destination = await installation;

    expect(basename(destination)).toBe('Saika-0.4.0.AppImage');
    expect(await readFile(destination, 'utf8')).toBe('updated executable');
    await expect(stat(current)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['Saika.AppImage', 'Saika-0.3.0.AppImage'])(
    'restores %s after a process launch failure and retains the verified download',
    async (name) => {
      const { directory, current, downloaded } = await files(name);
      const failure = new Error('could not spawn');

      await expect(
        installAppImage(current, downloaded, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(await readFile(current, 'utf8')).toBe('previous executable');
      expect(await readFile(downloaded, 'utf8')).toBe('updated executable');
      expect((await readdir(directory)).sort()).toEqual([name, 'cache'].sort());
    },
  );

  it('leaves the original intact if the atomic replacement fails', async () => {
    const { current, downloaded } = await files();
    vi.mocked(rename).mockRejectedValueOnce(new Error('rename failed'));
    const launch = vi.fn();

    await expect(installAppImage(current, downloaded, launch)).rejects.toThrow('rename failed');

    expect(await readFile(current, 'utf8')).toBe('previous executable');
    expect(launch).not.toHaveBeenCalled();
  });

  it('does not overwrite or remove an existing versioned destination', async () => {
    const { directory, current, downloaded } = await files('Saika-0.3.0.AppImage');
    const destination = join(directory, basename(downloaded));
    await writeFile(destination, 'user file');
    const launch = vi.fn();

    await expect(installAppImage(current, downloaded, launch)).rejects.toMatchObject({ code: 'EEXIST' });

    expect(await readFile(current, 'utf8')).toBe('previous executable');
    expect(await readFile(destination, 'utf8')).toBe('user file');
    expect(launch).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'win32')(
    'detects a real asynchronous spawn error and restores the original executable',
    async () => {
      const { current, downloaded } = await files();
      await writeFile(downloaded, '#!/nonexistent-saika-interpreter\n');

      await expect(installAppImage(current, downloaded)).rejects.toMatchObject({ code: 'ENOENT' });

      expect(await readFile(current, 'utf8')).toBe('previous executable');
    },
  );

  it.skipIf(process.platform === 'win32')('observes successful process creation', async () => {
    const { downloaded } = await files();
    await writeFile(downloaded, '#!/bin/sh\nexit 0\n');
    await chmod(downloaded, 0o755);

    await expect(launchAppImage(downloaded)).resolves.toBeUndefined();
  });

  it('preserves a recovery copy if the filesystem also rejects restoration', async () => {
    const { directory, current, downloaded } = await files();
    const originalRename = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(rename)
      .mockImplementationOnce(originalRename.rename)
      .mockRejectedValueOnce(new Error('restoration failed'));

    await expect(
      installAppImage(current, downloaded, async () => {
        throw new Error('spawn failed');
      }),
    ).rejects.toThrow('The previous executable is at');

    const recoveryDirectory = (await readdir(directory)).find((entry) => entry.startsWith('.saika-update-'));
    expect(recoveryDirectory).toBeDefined();
    expect(await readFile(join(directory, recoveryDirectory!, 'previous.AppImage'), 'utf8')).toBe(
      'previous executable',
    );
  });
});
