const encoder = new TextEncoder();

async function safeEqual(actual, expected) {
  if (!actual || !expected) return false;

  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  const a = new Uint8Array(actualHash);
  const b = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function taipeiTime(value) {
  const parsed = new Date(value);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function makeMessage(payload) {
  const name = String(payload.name || "未命名檢查").slice(0, 200);
  const status = String(payload.status || "unknown").toLowerCase();
  const time = taipeiTime(payload.time);

  if (status === "down") {
    return `❌ VPS Healthchecks 告警\n\n${name} 已停止回報。\n狀態：down\n時間：${time}`;
  }

  if (status === "up") {
    return `✅ VPS Healthchecks 恢復\n\n${name} 已恢復回報。\n狀態：up\n時間：${time}`;
  }

  return `ℹ️ VPS Healthchecks 通知\n\n${name}\n狀態：${status}\n時間：${time}`;
}

function jsonResponse(body, status) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({ ok: true, service: "line-alert-gateway" }, 200);
    }

    if (request.method !== "POST" || url.pathname !== "/healthchecks") {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const authorized = await safeEqual(
      request.headers.get("X-Webhook-Secret"),
      env.WEBHOOK_SECRET,
    );
    if (!authorized) return jsonResponse({ error: "unauthorized" }, 401);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: env.LINE_USER_ID,
        messages: [{ type: "text", text: makeMessage(payload) }],
      }),
    });

    if (!response.ok) {
      console.error("LINE push failed", response.status, await response.text());
      return jsonResponse({ error: "line_push_failed" }, 502);
    }

    return new Response(null, { status: 204 });
  },
};
