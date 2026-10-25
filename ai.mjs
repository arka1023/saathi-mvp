// Netlify Function: a small proxy to Groq's free API so the API key never reaches the browser.
// Set GROQ_API_KEY in Netlify: Site configuration → Environment variables.
// Optional overrides: GROQ_TEXT_MODEL, GROQ_FAST_MODEL, GROQ_VISION_MODEL.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_PROMPT = 20000;
const MAX_IMAGE_CHARS = 3_500_000; // ~2.6 MB per base64 image

const env = (k, d) => (globalThis.Netlify?.env?.get(k) ?? process.env[k] ?? d);

export default async (req) => {
  const key = env("GROQ_API_KEY");
  const vision = env("GROQ_VISION_MODEL", "qwen/qwen3.8-27b");

  if (req.method === "GET") {
    return Response.json({ ok: !!key, vision: !!vision, label: "Free AI (Groq)" });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!key) return Response.json({ error: "GROQ_API_KEY is not set" }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const prompt = String(body.prompt || "").slice(0, MAX_PROMPT);
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter((x) => typeof x === "string" && x.startsWith("data:image/") && x.length < MAX_IMAGE_CHARS)
    .slice(0, 2);
  if (!prompt) return Response.json({ error: "Empty prompt" }, { status: 400 });

  const model = images.length
    ? vision
    : body.tier === "quick"
      ? env("GROQ_FAST_MODEL", "llama-3.1-8b-instant")
      : env("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile");

  const content = images.length
    ? [{ type: "text", text: prompt }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))]
    : prompt;

  const payload = {
    model,
    temperature: 0.2,
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are a component of a shopping assistant. Always reply with a single valid JSON object and nothing else." },
      { role: "user", content },
    ],
  };

  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  if (r.status === 429) return Response.json({ error: "Rate limited" }, { status: 429 });
  if (!r.ok) return Response.json({ error: "Upstream error", status: r.status, detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const j = await r.json();
  return Response.json({ text: j.choices?.[0]?.message?.content || "", model });
};

export const config = { path: "/api/ai" };
