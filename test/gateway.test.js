import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const env = {
  WEBHOOK_SECRET: "test-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  LINE_USER_ID: "U00000000000000000000000000000000",
};

test("rejects requests without the shared secret", async () => {
  const request = new Request("https://example.test/healthchecks", {
    method: "POST",
    body: "{}",
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 401);
});

test("converts Healthchecks UTC timestamps to Asia/Taipei", async () => {
  const originalFetch = globalThis.fetch;
  let lineRequest;
  globalThis.fetch = async (url, options) => {
    lineRequest = { url, options };
    return new Response(null, { status: 200 });
  };

  try {
    const request = new Request("https://example.test/healthchecks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": "test-secret",
      },
      body: JSON.stringify({
        name: "backup-daily",
        status: "down",
        time: "2026-09-05T13:01:51+00:00",
      }),
    });

    const response = await worker.fetch(request, env);
    assert.equal(response.status, 204);
    assert.equal(lineRequest.url, "https://api.line.me/v2/bot/message/push");
    assert.equal(lineRequest.options.headers.Authorization, "Bearer test-token");

    const body = JSON.parse(lineRequest.options.body);
    assert.match(body.messages[0].text, /2026-09-05 21:01:51/);
    assert.match(body.messages[0].text, /backup-daily 已停止回報/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
