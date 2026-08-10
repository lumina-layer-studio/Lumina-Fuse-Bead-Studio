import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build contains the worker and every runtime asset in one HTML file", async () => {
  const files = await readdir("dist/ui");
  assert.deepEqual(files, ["index.html"]);

  const html = await readFile("dist/ui/index.html", "utf8");
  assert.ok(
    Buffer.byteLength(html, "utf8") <= 1_200_000,
    "dist/ui/index.html must remain at or below the 1,200,000 byte delivery budget",
  );
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /new Worker\(["'][^"']+\.js/i);
  assert.match(
    html,
    /new Worker\(["']data:text\/javascript;charset=utf-8,/i,
  );
  assert.doesNotMatch(
    html,
    /<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i,
  );
});
