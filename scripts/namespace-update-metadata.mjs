// SPDX-License-Identifier: MIT
import { readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import yaml from "js-yaml";

export async function namespaceUpdateMetadata(directory, namespace, version) {
  if (!["director", "vista"].includes(namespace))
    throw new Error("Unknown application update namespace");
  const product = `Saika${namespace === "director" ? "Director" : "Vista"}`;
  const validate = (info) => {
    if (
      !info ||
      typeof info !== "object" ||
      info.version !== version ||
      !Array.isArray(info.files) ||
      !info.files.length
    )
      throw new Error("Update metadata does not match the application version");
    for (const file of info.files) {
      if (
        typeof file.url !== "string" ||
        typeof file.sha512 !== "string" ||
        !file.sha512
      )
        throw new Error(
          "Update metadata requires an artifact URL and checksum",
        );
      const name = decodeURIComponent(file.url);
      const productName = namespace === "director" ? "Director" : "Vista";
      const prefixes = [" ", "-", "."].map(
        (separator) => `Saika${separator}${productName}-${version}-`,
      );
      if (
        basename(name) !== name ||
        !prefixes.some((prefix) => name.startsWith(prefix))
      )
        throw new Error(
          `Update artifact does not belong to ${product}: ${file.url}`,
        );
    }
    return info;
  };
  const created = [];
  for (const name of await readdir(directory)) {
    if (
      !name.endsWith(".yml") ||
      name.startsWith(`${namespace}-`) ||
      name === "app-update.yml"
    )
      continue;
    const source = join(directory, name);
    const info = yaml.load(await readFile(source, "utf8"), {
      schema: yaml.JSON_SCHEMA,
    });
    if (!info || typeof info !== "object" || !Array.isArray(info.files))
      continue;
    if (info.version !== version) continue;
    validate(info);
    const destination = join(directory, `${namespace}-${name}`);
    let previous;
    try {
      previous = yaml.load(await readFile(destination, "utf8"), {
        schema: yaml.JSON_SCHEMA,
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Keep archives from separate architecture builds in one channel file
    // so the updater can select the running architecture.
    const files = new Map();
    if (previous?.version === version)
      for (const file of validate(previous).files) files.set(file.url, file);
    for (const file of info.files) files.set(file.url, file);
    const merged = { ...info, files: [...files.values()] };
    merged.path = merged.files[0].url;
    merged.sha512 = merged.files[0].sha512;
    const temporary = `${destination}.tmp`;
    await writeFile(
      temporary,
      yaml.dump(merged, { lineWidth: -1, noRefs: true }),
    );
    await rename(temporary, destination);
    await unlink(source);
    created.push(destination);
  }
  return created;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const namespace = process.argv[2];
  const directory = resolve(process.argv[3] ?? "release");
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  const files = await namespaceUpdateMetadata(directory, namespace, version);
  for (const file of files) console.log(`Prepared ${basename(file)}`);
}
