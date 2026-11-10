import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../next.config";

test("API rewrite supports an explicitly configured HTTPS backend without exposing an arbitrary target", async () => {
  const original = process.env.API_UPSTREAM_URL;
  try {
    delete process.env.API_UPSTREAM_URL;
    assert.deepEqual(await config.rewrites!(), [
      { source: "/api/:path*", destination: "http://127.0.0.1:4000/v1/:path*" },
    ]);
    for (const value of [
      "https://api.example.com/v1",
      "https://api.example.com/v1/",
    ]) {
      process.env.API_UPSTREAM_URL = value;
      assert.deepEqual(await config.rewrites!(), [
        {
          source: "/api/:path*",
          destination: "https://api.example.com/v1/:path*",
        },
      ]);
    }
    for (const value of [
      "http://api.example.com/v1",
      "https://user:pass@api.example.com/v1",
      "https://api.example.com/v1?q=secret",
      "https://api.example.com/v1#fragment",
      "https://api.example.com/wrong",
      "not-a-url",
    ]) {
      process.env.API_UPSTREAM_URL = value;
      await assert.rejects(
        () => Promise.resolve(config.rewrites!()),
        /API_UPSTREAM_URL/,
      );
    }
  } finally {
    if (original === undefined) delete process.env.API_UPSTREAM_URL;
    else process.env.API_UPSTREAM_URL = original;
  }
});
