// SPDX-License-Identifier: MIT
import { connect } from 'node:tls';

const configured = process.env.MONITOR_URL;
if (!configured) throw new Error('Set MONITOR_URL to the approved production URL');
const target = new URL(configured);
if (target.protocol !== 'https:' || target.username || target.password)
  throw new Error('An HTTPS URL without embedded credentials is required');
const base = target.href.replace(/\/$/, '');
await new Promise((resolve, reject) => {
  const socket = connect({
    host: target.hostname,
    servername: target.hostname,
    port: Number(target.port || 443),
    rejectUnauthorized: true,
  });
  socket.setTimeout(10000, () => socket.destroy(new Error('Certificate probe timed out')));
  socket.on('error', reject);
  socket.on('secureConnect', () => {
    const certificate = socket.getPeerCertificate();
    socket.end();
    if (Date.parse(certificate.valid_to) - Date.now() < 14 * 86400000)
      reject(new Error('TLS certificate expires within 14 days'));
    else resolve();
  });
});
for (const [route, expected] of [
  ['/', 'Saika'],
  ['/manifest.webmanifest', 'Saika'],
  ['/rss.xml/', '<rss'],
  ['/sw.js', 'saika-docs-'],
]) {
  const response = await fetch(base + route, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !(await response.text()).includes(expected))
    throw new Error(`Production probe failed: ${route} (${response.status})`);
  console.log(`OK ${route}`);
}
