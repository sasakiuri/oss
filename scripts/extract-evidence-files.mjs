// SPDX-License-Identifier: MIT
// Extract verified original files from a Saika competition evidence JSON bundle.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, win32 } from "node:path";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
const digest = (value) => createHash("sha256").update(value).digest("hex");
const jsonDigest = (value) => digest(JSON.stringify(canonical(value)));

try {
  const [, , source, destination] = process.argv;
  if (!source || !destination || process.argv.length !== 4) {
    throw new Error(
      "Usage: node scripts/extract-evidence-files.mjs <bundle.json> <new-output-directory>",
    );
  }
  const bundle = JSON.parse(await readFile(source, "utf8"));
  const { bundleSha256, ...unsigned } = bundle;
  if (
    bundle.format !== "saika-competition-evidence" ||
    bundle.formatVersion !== 1 ||
    jsonDigest(unsigned) !== bundleSha256
  ) {
    throw new Error("Unsupported bundle or bundle SHA-256 mismatch");
  }
  const sections = bundle.sections;
  if (
    !Array.isArray(sections) ||
    new Set(sections.map((section) => section.id)).size !== sections.length
  ) {
    throw new Error("Invalid or duplicate bundle sections");
  }
  for (const section of sections) {
    if (
      !Array.isArray(section.records) ||
      section.recordCount !== section.records.length ||
      jsonDigest(section.records) !== section.sha256
    ) {
      throw new Error(`Section integrity mismatch: ${section.id}`);
    }
  }
  const records =
    sections.find((section) => section.id === "evidence-file-attachments")
      ?.records ?? [];
  const files = records.map((record) => {
    if (
      !/^[a-f0-9-]{36}$/i.test(record.id) ||
      record.encoding !== "base64" ||
      typeof record.contentBase64 !== "string" ||
      typeof record.fileName !== "string" ||
      !Number.isSafeInteger(record.sizeBytes) ||
      record.sizeBytes < 0
    ) {
      throw new Error("Invalid attachment manifest");
    }
    const bytes = Buffer.from(record.contentBase64, "base64");
    if (
      bytes.toString("base64") !== record.contentBase64 ||
      bytes.length !== record.sizeBytes ||
      digest(bytes) !== record.sha256
    ) {
      throw new Error(`Attachment integrity mismatch: ${record.id}`);
    }
    const name =
      basename(win32.basename(record.fileName))
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 150) || "original.bin";
    return { record, bytes, outputName: `${record.id}-${name}` };
  });
  if (new Set(files.map((file) => file.outputName)).size !== files.length)
    throw new Error("Duplicate attachment identities");
  // A fresh directory prevents accidental replacement of existing evidence.
  await mkdir(destination, { recursive: false });
  for (const file of files)
    await writeFile(join(destination, file.outputName), file.bytes, {
      flag: "wx",
      mode: 0o600,
    });
  const manifest = files.map(
    ({ record: { contentBase64: _bytes, ...record }, outputName }) => ({
      ...record,
      outputName,
    }),
  );
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify({ bundleSha256, files: manifest }, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  process.stdout.write(
    `Extracted ${files.length} verified evidence file(s).\n`,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
