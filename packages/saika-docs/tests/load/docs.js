// SPDX-License-Identifier: MIT
/* global __ENV */
import { check, sleep } from 'k6';
import http from 'k6/http';

export const options = JSON.parse(__ENV.DOCS_LOAD_OPTIONS);
const baseUrl = __ENV.DOCS_LOAD_BASE_URL.replace(/\/$/, '');
const headers = { Accept: 'application/json' };
if (__ENV.DOCS_LOAD_AUTHORIZATION) headers.Authorization = __ENV.DOCS_LOAD_AUTHORIZATION;

function json(response) {
  try {
    return response.json();
  } catch {
    return undefined;
  }
}

export default function readPublicEndpoints() {
  const health = http.get(`${baseUrl}/api/health/`, { headers, tags: { name: 'health' } });
  check(health, {
    'health returns 200': (response) => response.status === 200,
    'health reports ok': (response) => json(response)?.status === 'ok',
  });

  const catalog = http.get(`${baseUrl}/api/catalog/`, { headers, tags: { name: 'catalog' } });
  check(catalog, {
    'catalog returns 200': (response) => response.status === 200,
    'catalog contains document entries': (response) => {
      const items = json(response);
      return (
        Array.isArray(items) &&
        items.length > 0 &&
        items.every((item) =>
          ['id', 'title', 'href', 'description'].every((field) => typeof item?.[field] === 'string'),
        )
      );
    },
  });

  if (__ENV.DOCS_LOAD_PROFILE === 'smoke') sleep(1);
}
