// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, copyFile, mkdtemp, rename, rm, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';

export async function launchAppImage(file: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(file, [], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, APPIMAGE_SILENT_INSTALL: 'true' },
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function installAppImage(
  currentFile: string,
  downloadedFile: string,
  launch: (file: string) => Promise<void> = launchAppImage,
  onCleanupError: (error: unknown) => void = () => undefined,
): Promise<string> {
  if (!isAbsolute(currentFile) || currentFile.includes('\0')) {
    throw new Error('APPIMAGE must identify an absolute executable path.');
  }
  if (!(await stat(currentFile)).isFile() || !(await stat(downloadedFile)).isFile()) {
    throw new Error('The current AppImage and downloaded update must be files.');
  }

  const currentName = basename(currentFile);
  const destination =
    basename(downloadedFile) === currentName || !/\d+\.\d+\.\d+/.test(currentName)
      ? currentFile
      : join(dirname(currentFile), basename(downloadedFile));
  const workingDirectory = await mkdtemp(join(dirname(currentFile), '.saika-update-'));
  const stagedFile = join(workingDirectory, 'update.AppImage');
  const backupFile = join(workingDirectory, 'previous.AppImage');
  const replacesCurrent = destination === currentFile;
  let installed = false;

  try {
    await copyFile(downloadedFile, stagedFile, constants.COPYFILE_EXCL);
    await chmod(stagedFile, 0o755);
    if (replacesCurrent) {
      await copyFile(currentFile, backupFile, constants.COPYFILE_EXCL);
      await rename(stagedFile, destination);
    } else {
      // An existing destination may belong to the user; exclusive copy preserves it.
      await copyFile(stagedFile, destination, constants.COPYFILE_EXCL);
    }
    installed = true;
    await launch(destination);
  } catch (error) {
    if (installed) {
      try {
        if (replacesCurrent) await rename(backupFile, currentFile);
        else await unlink(destination);
      } catch (rollbackError) {
        // Keep the backup available if filesystem failure also prevents restoration.
        throw new AggregateError(
          [error, rollbackError],
          `AppImage installation and restoration failed. The previous executable is at ${replacesCurrent ? backupFile : currentFile}.`,
        );
      }
    }
    await rm(workingDirectory, { recursive: true, force: true }).catch(onCleanupError);
    throw error;
  }

  if (!replacesCurrent) await unlink(currentFile).catch(onCleanupError);
  await rm(workingDirectory, { recursive: true, force: true }).catch(onCleanupError);
  return destination;
}
