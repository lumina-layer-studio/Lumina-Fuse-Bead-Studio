import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build contains the worker and every runtime asset in one HTML file", async () => {
  const files = await readdir("dist/ui");
  assert.deepEqual(files, ["index.html"]);

  const html = await readFile("dist/ui/index.html", "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /new Worker\(["'][^"']+\.js/i);
  assert.doesNotMatch(
    html,
    /<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i,
  );
});
