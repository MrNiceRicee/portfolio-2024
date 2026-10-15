import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve("dist");
const errorPage = readFileSync(resolve(dist, "404.html"), "utf8");
const home = readFileSync(resolve(dist, "index.html"), "utf8");
const scripts = html => [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
assert.match(errorPage, /data-crt404/, "404.html must contain the error page, not the homepage");
assert.match(errorPage, /name="robots" content="noindex"/);
assert.match(errorPage, /href="\/"[^>]*>Return home<\/a>/);
const entries = scripts(errorPage);
assert.ok(entries.length > 0, "the built error page must load its renderer");
let bytes = 0;
for (const asset of entries) {
  assert.ok(asset.startsWith("/_astro/"), "404 scripts must resolve from nested missing URLs");
  bytes += statSync(resolve(dist, `.${asset}`)).size;
  assert.ok(!scripts(home).includes(asset), "the homepage must not load the 404 renderer");
}
assert.ok(bytes < 40 * 1024, `404 entry scripts exceed the 40 KiB budget: ${bytes} bytes`);
console.log(`404.html verified; error-page entry scripts ${bytes} bytes; homepage isolated`);
