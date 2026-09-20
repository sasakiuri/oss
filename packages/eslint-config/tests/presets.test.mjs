// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";

import { Linter } from "eslint";
import tseslint from "typescript-eslint";

import testingLibrary from "../testing-library.js";
import vitest from "../vitest.js";

function lint(source, presets = [vitest], filename = "tests/example.test.ts") {
  return new Linter().verify(
    source,
    [
      {
        files: ["**/*.{js,mjs,ts,tsx}"],
        languageOptions: { parser: tseslint.parser },
      },
      ...presets,
    ],
    { filename },
  );
}

test("Vitest catches focused, disabled, and unawaited assertions", () => {
  const messages = lint(`
    import { it, expect } from 'vitest';
    it.only('focused', () => { expect(true).toBe(true); });
    it.skip('disabled', () => { expect(true).toBe(true); });
    it('async assertion', () => { expect(Promise.resolve(true)).resolves.toBe(true); });
  `);
  assert.deepEqual(
    messages.map(({ ruleId }) => ruleId).sort(),
    [
      "vitest/no-focused-tests",
      "vitest/no-disabled-tests",
      "vitest/valid-expect",
    ].sort(),
  );
});

test("valid asynchronous assertions and parameterized tests pass", () => {
  assert.deepEqual(
    lint(`
      import { it, expect } from 'vitest';
      it.each([1, 2])('resolves %i', async (value) => {
        await expect(Promise.resolve(value)).resolves.toBe(value);
      });
    `),
    [],
  );
});

test("React Testing Library catches unawaited asynchronous work", () => {
  const messages = lint(
    `
      import { screen, waitFor } from '@testing-library/react';
      import userEvent from '@testing-library/user-event';
      import { it, expect } from 'vitest';
      it('loads a result', () => {
        screen.findByText('Result');
        waitFor(() => { expect(screen.getByText('Result')).toBeVisible(); });
        userEvent.click(screen.getByRole('button'));
      });
    `,
    [vitest, testingLibrary],
  );
  assert.deepEqual(
    messages.map(({ ruleId }) => ruleId).sort(),
    [
      "testing-library/await-async-queries",
      "testing-library/await-async-utils",
      "testing-library/await-async-events",
    ].sort(),
  );
});

test("React Testing Library rejects actions retried inside waitFor", () => {
  const messages = lint(
    `
      import { fireEvent, screen, waitFor } from '@testing-library/react';
      import { it, expect } from 'vitest';
      it('saves once', async () => {
        await waitFor(() => {
          fireEvent.click(screen.getByRole('button'));
          expect(screen.getByText('Saved')).toBeVisible();
        });
      });
    `,
    [vitest, testingLibrary],
  );
  assert.deepEqual(
    messages.map(({ ruleId }) => ruleId),
    ["testing-library/no-wait-for-side-effects"],
  );
});

test("properly awaited queries and actions pass", () => {
  assert.deepEqual(
    lint(
      `
        import { screen, waitFor } from '@testing-library/react';
        import userEvent from '@testing-library/user-event';
        import { it, expect } from 'vitest';
        it('loads a result', async () => {
          await userEvent.click(screen.getByRole('button'));
          expect(await screen.findByText('Result')).toBeVisible();
          await waitFor(() => { expect(screen.getByText('Ready')).toBeVisible(); });
        });
      `,
      [vitest, testingLibrary],
    ),
    [],
  );
});

test("the presets do not apply Vitest rules to application, Playwright, or node:test files", () => {
  for (const filename of [
    "src/example.ts",
    "e2e/example.spec.ts",
    "scripts/example.test.mjs",
  ]) {
    assert.deepEqual(
      lint(
        "test.only('example', () => {});",
        [vitest, testingLibrary],
        filename,
      ),
      [],
    );
  }
});

test("callers can scope the Vitest preset when another framework uses .test.ts", () => {
  const preset = { ...vitest, files: ["tests/unit/**/*.test.ts"] };
  assert.deepEqual(
    lint(
      "import { test } from 'node:test'; test.only('script', () => {});",
      [preset],
      "scripts/check.test.ts",
    ),
    [],
  );
  assert.equal(
    lint(
      "import { it } from 'vitest'; it.only('unit', () => {});",
      [preset],
      "tests/unit/check.test.ts",
    )[0].ruleId,
    "vitest/no-focused-tests",
  );
});
