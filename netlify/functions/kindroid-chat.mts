import type { Context, Config } from "@netlify/functions";

// Adapted from KindroidAI/Kindroid-discord's src/kindroidAPI.ts — same
// endpoint contract (share_code / conversation / enable_filter body,
// Bearer + X-Kindroid-Requester headers), swapped from a Discord bot
// context to a browser one. The API key never reaches the browser: it
// only ever lives in this function's environment.

interface ConversationMessage {
  username: string;
  text: string;
  timestamp?: string;
}

const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

// Best-effort only: resets on cold start and isn't shared across concurrent
// instances. It blunts casual abuse of your Kindroid quota, nothing more —
// for a real guard, password-protect the site in Netlify's visitor access
// controls instead.
const hits = new Map<string, number[]>();
function isRateLimited(id: string): boolean {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(id, recent);
  return recent.length > RATE_LIMIT_MAX;
}

// Mirrors kindroidAPI.ts's hashedUsername derivation exactly.
function hashRequester(name: string): string {
  return Buffer.from(encodeURIComponent(name))
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32);
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Netlify.env.get("KINDROID_API_KEY");
  const inferUrl = Netlify.env.get("KINDROID_INFER_URL");
  const shareCode = Netlify.env.get("KINDROID_SHARE_CODE");
  if (!apiKey || !inferUrl || !shareCode) {
    return Response.json(
      {
        error:
          "Not configured yet — set KINDROID_API_KEY, KINDROID_INFER_URL and KINDROID_SHARE_CODE in Netlify's site environment variables.",
      },
      { status: 500 }
    );
  }

  let body: { message?: string; history?: ConversationMessage[]; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (message.length > MAX_MESSAGE_LEN) {
    return Response.json({ error: `message must be under ${MAX_MESSAGE_LEN} characters` }, { status: 400 });
  }

  const sessionId = (body.sessionId || "web-guest").slice(0, 64);
  if (isRateLimited(sessionId)) {
    return Response.json(
      { error: "Too many messages — slow down a bit and try again in a few minutes." },
      { status: 429 }
    );
  }

  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : [];
  const conversation: ConversationMessage[] = [
    ...history,
    { username: sessionId, text: message, timestamp: new Date().toISOString() },
  ];

  try {
    const kRes = await fetch(inferUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Kindroid-Requester": hashRequester(sessionId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_code: shareCode,
        conversation,
        enable_filter: false,
      }),
    });

    if (kRes.status === 429) {
      return Response.json(
        { error: "Kindroid is rate-limiting this persona right now — try again shortly." },
        { status: 429 }
      );
    }

    const data = (await kRes.json()) as { success: boolean; reply?: string; error?: string };
    if (!kRes.ok || !data.success) {
      return Response.json({ error: data.error || "Kindroid API request failed" }, { status: 502 });
    }

    const reply = (data.reply || "").replace(/@(everyone|here)/g, "");
    return Response.json({ reply });
  } catch (err) {
    console.error("Kindroid proxy error:", err);
    return Response.json({ error: "Couldn't reach Kindroid right now — try again in a moment." }, { status: 502 });
  }
};

export const config: Config = {
  path: "/api/kindroid-chat",
};
