/**
 * Safely stringify a value, handling circular references and Error objects
 */
export function safeStringify(value: unknown, seen = new WeakSet<object>()): string {
  // Handle primitives
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return String(value);

  // Handle Error objects specially
  if (value instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    // Include any additional properties on the error object
    for (const key of Object.keys(value)) {
      if (!(key in errorObj)) {
        errorObj[key] = (value as unknown as Record<string, unknown>)[key];
      }
    }
    return JSON.stringify(errorObj);
  }

  // Handle Date objects
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Check for circular reference
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  // Handle Arrays
  if (Array.isArray(value)) {
    const items = value.map((item) => safeStringify(item, seen));
    return `[${items.join(',')}]`;
  }

  // Handle plain objects
  try {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `"${key}":${safeStringify(val, seen)}`)
      .join(',');
    return `{${entries}}`;
  } catch {
    return '[Object]';
  }
}
