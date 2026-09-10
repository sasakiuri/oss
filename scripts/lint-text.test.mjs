// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createLinter, loadTextlintrc } from "textlint";

const descriptor = await loadTextlintrc({
  configFilePath: fileURLToPath(
    new URL("../.textlintrc.json", import.meta.url),
  ),
});
const linter = createLinter({ descriptor });

test("Japanese and English boundaries require spaces in Markdown and plain text", async () => {
  const input = "これはinstanton解です。ここではMQTT protocolが使用されます。";
  const expected =
    "これは instanton 解です。ここでは MQTT protocol が使用されます。";
  for (const file of ["manual.md", "manual.txt"]) {
    assert.equal((await linter.lintText(input, file)).messages.length, 4);
    assert.equal((await linter.fixText(input, file)).output, expected);
    assert.deepEqual((await linter.lintText(expected, file)).messages, []);
  }
});

test("Headings, table cells, emphasis and link labels are checked", async () => {
  const input =
    "# MQTT接続\n\n**CSV出力**と[JSON形式](https://example.com/JSON形式)\n\n| UI表示 |\n| --- |\n";
  const expected =
    "# MQTT 接続\n\n**CSV 出力**と[JSON 形式](https://example.com/JSON形式)\n\n| UI 表示 |\n| --- |\n";
  assert.equal((await linter.fixText(input, "manual.md")).output, expected);
});

test("Numbers, punctuation and code are preserved", async () => {
  const input = "10回、1秒、MQTT。\n\n`MQTT接続`\n\n```text\nMQTT接続\n```\n";
  assert.deepEqual((await linter.lintText(input, "manual.md")).messages, []);
  assert.equal((await linter.fixText(input, "manual.md")).output, input);
});

test("Saika Docs inherits the rule without a conflicting preset", async () => {
  const docs = createLinter({
    descriptor: await loadTextlintrc({
      configFilePath: fileURLToPath(
        new URL("../packages/saika-docs/.textlintrc.cjs", import.meta.url),
      ),
    }),
  });
  const spacing = (result) =>
    result.messages.filter((message) =>
      message.ruleId.endsWith("ja-space-between-half-and-full-width"),
    );
  assert.equal(
    spacing(await docs.lintText("これはMQTT通信です。", "manual.md")).length,
    2,
  );
  assert.deepEqual(
    spacing(await docs.lintText("これは MQTT 通信です。", "manual.md")),
    [],
  );
});
