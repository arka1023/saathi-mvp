// Cloudflare Worker: proxy to Groq's free API for the GitHub Pages version.
// In the Worker's Settings → Variables and Secrets add:
//   GROQ_API_KEY   (type: Secret)  your key from console.groq.com
//   ALLOWED_ORIGIN (type: Text)    e.g. https://your-username.github.io
// Optional: GROQ_TEXT_MODEL, GROQ_FAST_MODEL, GROQ_VISION_MODEL

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_PROMPT = 20000;
const MAX_IMAGE_CHARS = 3_500_000;

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const okOrigin = allowed === "*" || origin === allowed;
    const cors = {
      "access-control-allow-origin": okOrigin ? (allowed === "*" ? "*" : origin) : allowed,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "origin",
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const vision = env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
    if (req.method === "GET") return json({ ok: !!env.GROQ_API_KEY, vision: !!vision, label: "Free AI (Groq)" });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!okOrigin) return json({ error: "Origin not allowed" }, 403);
    if (!env.GROQ_API_KEY) return json({ error: "GROQ_API_KEY is not set" }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
    const prompt = String(body.prompt || "").slice(0, MAX_PROMPT);
    const images = (Array.isArray(body.images) ? body.images : [])
      .filter((x) => typeof x === "string" && x.startsWith("data:image/") && x.length < MAX_IMAGE_CHARS)
      .slice(0, 2);
    if (!prompt) return json({ error: "Empty prompt" }, 400);

    const model = images.length
      ? vision
      : body.tier === "quick"
        ? env.GROQ_FAST_MODEL || "llama-3.1-8b-instant"
        : env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
    const content = images.length
      ? [{ type: "text", text: prompt }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))]
      : prompt;

    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model, temperature: 0.2, max_tokens: 900, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a component of a shopping assistant. Always reply with a single valid JSON object and nothing else." },
          { role: "user", content },
        ],
      }),
    });
    if (r.status === 429) return json({ error: "Rate limited" }, 429);
    if (!r.ok) return json({ error: "Upstream error", status: r.status, detail: (await r.text()).slice(0, 300) }, 502);
    const j = await r.json();
    return json({ text: j.choices?.[0]?.message?.content || "", model });
  },
};
