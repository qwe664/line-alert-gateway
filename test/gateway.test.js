import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const env = {
  WEBHOOK_SECRET: "test-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  LINE_USER_ID: "U00000000000000000000000000000000",
};

function authorizedRequest(body) {
  return new Request("https://example.test/healthchecks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": "test-secret",
    },
    body,
  });
}

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

test("rejects invalid JSON after authorization", async () => {
  const response = await worker.fetch(authorizedRequest("{not-json"), env);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_json" });
});

test("rejects payloads that are not objects", async () => {
  for (const body of ["null", "[]", '"text"']) {
    const response = await worker.fetch(authorizedRequest(body), env);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_payload" });
  }
});

test("returns 502 when LINE rejects the push request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("bad request", { status: 400 });

  try {
    const response = await worker.fetch(
      authorizedRequest(JSON.stringify({ name: "backup", status: "down" })),
      env,
    );

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "line_push_failed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns 502 when the LINE push request throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network unavailable");
  };

  try {
    const response = await worker.fetch(
      authorizedRequest(JSON.stringify({ name: "backup", status: "down" })),
      env,
    );

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "line_push_failed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("formats recovery and informational notifications", async () => {
  const originalFetch = globalThis.fetch;
  const messages = [];
  globalThis.fetch = async (_url, options) => {
    messages.push(JSON.parse(options.body).messages[0].text);
    return new Response(null, { status: 200 });
  };

  try {
    const upResponse = await worker.fetch(
      authorizedRequest(
        JSON.stringify({
          name: "backup-daily",
          status: "up",
          time: "2026-09-05T13:01:51+00:00",
        }),
      ),
      env,
    );
    const unknownResponse = await worker.fetch(
      authorizedRequest(
        JSON.stringify({
          name: "backup-daily",
          status: "paused",
          time: "2026-09-05T13:01:51+00:00",
        }),
      ),
      env,
    );

    assert.equal(upResponse.status, 204);
    assert.equal(unknownResponse.status, 204);
    assert.match(messages[0], /backup-daily 已恢復回報/);
    assert.match(messages[0], /2026-09-05 21:01:51/);
    assert.match(messages[1], /狀態：paused/);
    assert.match(messages[1], /2026-09-05 21:01:51/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
