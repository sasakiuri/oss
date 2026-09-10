// SPDX-License-Identifier: MIT
import { writeFile } from 'node:fs/promises';

import { inventory, sourceIdentity, sourceEpoch, sha256, verifyArtifact } from './lib/artifact.mjs';

const root = process.argv[2] ?? 'out';
if (process.argv.includes('--verify')) {
  await verifyArtifact(root);
  console.log('Artifact seal verified.');
} else {
  const files = await inventory(root, ['artifact-manifest.json', 'sbom.spdx.json']);
  const identity = await sourceIdentity();
  const id = sha256(JSON.stringify(files));
  const spdx = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'saika-docs-static',
    documentNamespace: `https://spdx.org/spdxdocs/saika-docs-${id}`,
    creationInfo: { created: new Date(sourceEpoch() * 1000).toISOString(), creators: ['Tool: saika-docs-artifact'] },
    files: files.map((file, index) => ({
      SPDXID: `SPDXRef-File-${index}`,
      fileName: `./${file.file}`,
      checksums: [{ algorithm: 'SHA256', checksumValue: file.sha256 }],
      licenseConcluded: 'NOASSERTION',
      licenseInfoInFiles: ['NOASSERTION'],
      copyrightText: 'NOASSERTION',
    })),
    relationships: files.map((_, index) => ({
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: `SPDXRef-File-${index}`,
    })),
  };
  await writeFile(`${root}/sbom.spdx.json`, JSON.stringify(spdx, null, 2) + '\n');
  const complete = await inventory(root);
  await writeFile(
    `${root}/artifact-manifest.json`,
    JSON.stringify({ format: 1, ...identity, treeHash: sha256(JSON.stringify(complete)), files: complete }, null, 2) +
      '\n',
  );
  await verifyArtifact(root);
  console.log(`Sealed ${complete.length} files with an SPDX file inventory.`);
}
