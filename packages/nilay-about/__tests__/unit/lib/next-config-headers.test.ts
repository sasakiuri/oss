import { describe, expect, it } from 'vitest';

import config from '../../../next.config';

const permissionsPolicy = async () => {
  const nextConfig = await config();
  const rules = (await nextConfig.headers?.()) ?? [];
  const header = rules.flatMap((rule) => rule.headers).find((entry) => entry.key === 'Permissions-Policy');
  return new Map(
    (header?.value ?? '').split(',').map((directive) => {
      const [feature, allowList] = directive.trim().split('=');
      return [feature, allowList];
    }),
  );
};

describe('the Permissions-Policy header', () => {
  // The group and pattern cameras, the shot timer's microphone and the map's position all run on this site.
  it('lets this origin use the camera, the microphone and the position', async () => {
    const policy = await permissionsPolicy();
    expect(policy.get('camera')).toBe('(self)');
    expect(policy.get('microphone')).toBe('(self)');
    expect(policy.get('geolocation')).toBe('(self)');
  });
});
