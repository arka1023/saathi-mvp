// Saathi free-AI proxy for Cloudflare Workers (use with GitHub Pages).
// Variables: GROQ_API_KEY (secret), ALLOWED_ORIGIN (e.g. https://yourname.github.io).

/* ---- Saathi free-AI proxy core (shared by the Netlify Function and the Cloudflare Worker) ----
   Holds the Groq key server-side. Builds its own prompts from structured input, so it can't be
   used as an open chatbot: the agent task only accepts Saathi's own tool calls and a server-written system prompt. Falls back across models when one is retired, rate-limited or refuses
   a request shape. Model lists can be changed with environment variables, no code change needed. */

const DEFAULT_TEXT_MODELS = "openai/gpt-oss-20b,openai/gpt-oss-120b";
const DEFAULT_VISION_MODELS = "qwen/qwen3.8-27b";
const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";
const GROQ = "https://api.groq.com/openai/v1";

const CATEGORIES = ["kurta-set", "kurti", "anarkali", "sharara", "saree", "lehenga", "dupatta", "crop-top", "top", "tshirt", "polo", "shirt", "dress", "coord",
  "jeans", "trousers", "skirt", "jumpsuit", "jacket", "hoodie", "blazer", "men-kurta", "nehru-jacket", "sherwani", "jewellery", "footwear", "bag"];
const OCCASIONS = ["wedding", "wedding-day", "wedding-evening", "haldi", "mehendi", "sangeet", "festive", "puja", "garba", "office", "college", "brunch", "date", "party", "vacation", "travel", "casual"];
const COLOURS = ["yellow", "mustard", "marigold", "gold", "orange", "peach", "coral", "rust", "pink", "fuchsia", "red", "maroon", "wine", "green", "sage", "mint", "olive", "emerald", "teal", "blue", "powder-blue", "navy", "purple", "lavender", "white", "ivory", "beige", "brown", "grey", "black", "silver"];
const FAMILIES = ["pastel", "bright", "earthy", "jewel", "neutral", "dark"];
const FABRICS = ["cotton", "mulmul", "linen", "chanderi", "silk", "georgette", "organza", "rayon", "satin", "velvet", "knit", "denim", "synthetic", "crepe", "chiffon", "jacquard", "fleece", "wool", "net", "leather"];
const PATTERNS = ["solid", "chikankari", "block-print", "floral", "stripe", "check", "zari", "embroidered", "bandhani", "ribbed", "ikat", "mirror"];
const RECIPIENTS = ["self", "daughter", "son", "mother", "father", "wife", "husband", "sister", "brother", "friend"];

const nullable = (list) => ({ type: ["string", "null"], enum: [...list, null] });
const INTENT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    language: { type: "string", enum: ["en", "hi", "hinglish", "mr"] },
    categories: { type: "array", items: { type: "string", enum: CATEGORIES } },
    group: nullable(["ethnic", "western", "accessory"]),
    occasion: nullable(OCCASIONS),
    time_of_day: nullable(["day", "evening"]),
    city: { type: ["string", "null"] },
    budget_max: { type: ["number", "null"] },
    budget_min: { type: ["number", "null"] },
    colours: { type: "array", items: { type: "string", enum: COLOURS } },
    colour_family: nullable(FAMILIES),
    fabrics: { type: "array", items: { type: "string", enum: FABRICS } },
    avoid_fabrics: { type: "array", items: { type: "string", enum: FABRICS } },
    breathable: { type: "boolean" },
    metal: nullable(["silver", "gold"]),
    recipient: nullable(RECIPIENTS),
    gender: nullable(["women", "men"]),
    size: nullable(["XS", "S", "M", "L", "XL", "XXL"]),
    deadline_days: { type: ["number", "null"] },
    style_words: { type: "array", items: { type: "string" } },
    needs_question: { type: "boolean" },
    question: { type: ["string", "null"] },
  },
};
INTENT_SCHEMA.required = Object.keys(INTENT_SCHEMA.properties);

const VISION_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    category: { type: "string", enum: [...CATEGORIES, "other"] },
    dept: { type: "string", enum: ["women", "men"] },
    colour: { type: "string", enum: COLOURS },
    colour_family: { type: "string", enum: FAMILIES },
    pattern: { type: "string", enum: [...PATTERNS, "other"] },
    neckline: nullable(["round", "v", "square", "mandarin", "sweetheart", "collar", "boat"]),
    sleeve: nullable(["sleeveless", "short", "elbow", "3/4", "full"]),
    silhouette: nullable(["straight", "a-line", "flared", "fitted", "relaxed", "wide-leg", "wrap", "drape"]),
    fabric_cues: { type: "array", items: { type: "string", enum: FABRICS } },
    style_words: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    confidence: { type: "number" },
  },
};
VISION_SCHEMA.required = Object.keys(VISION_SCHEMA.properties);

function intentMessages(text, ctx = {}) {
  const sys = [
    "You read shopping requests for an Indian fashion store and turn them into search constraints.",
    "Requests may be in English, Hindi (Devanagari), Hinglish or Marathi. Reply with one JSON object only.",
    "Rules: 'suit' means a salwar/kurta set (categories kurta-set, anarkali, sharara). Jewellery mentioned as something to pair with is 'metal', not a category.",
    "'wedding' without a time is occasion 'wedding'. Convert spoken amounts like 'teen hazaar' to numbers (3000). 'under/tak/तक/पर्यंत X' is budget_max.",
    "breathable is true when the shopper mentions heat, humidity, sweat or breathable/light fabric.",
    "Ask a question (needs_question true) only if neither an occasion nor a category nor a colour is given; write it in the shopper's language.",
    "style_words: up to 5 short English words for cut, neckline, sleeves, pattern or vibe (e.g. 'square neck', 'minimal').",
  ].join("\n");
  const user = `Shopper context: city ${ctx.city || "unknown"}, shopping in ${ctx.dept || "women"}'s wear, today is ${ctx.today || "unknown"}.\nRequest: """${text}"""`;
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}
function visionMessages(imageDataUrl, caption) {
  const sys = "You identify the main outfit in a frame from a social-media fashion reel, for matching against an Indian fashion catalogue. Reply with one JSON object only. Use the caption as a hint, but trust what you see. confidence is 0 to 1.";
  const text = `Identify the outfit worn by the main person.${caption ? ` Reel caption: """${caption}"""` : ""}\nAllowed colours: ${COLOURS.join(", ")}. description: at most 20 words.`;
  return [{ role: "system", content: sys }, { role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: imageDataUrl } }] }];
}

/* ---- the agent: the page runs the tools; the server owns the prompt and the tool list (mirrors S.TOOLS in the page) ---- */
const AGENT_TOOLS = [
  { name: "search_catalog", description: "Search the store's catalogue. Hard rules first (gender, category, budget, colours to avoid, stock), exact colour before close shades; widens one step at a time if nothing fits and says so. Returns up to 8 distinct pieces with price, fit, what buyers wore it for and whether it runs warm or small.",
    parameters: { type: "object", properties: { query: { type: "string" }, gender: { type: "string", enum: ["women", "men"] }, categories: { type: "array", items: { type: "string", enum: CATEGORIES } },
      colours: { type: "array", items: { type: "string" } }, not_colours: { type: "array", items: { type: "string" } }, max_price: { type: "number" }, min_price: { type: "number" }, occasion: { type: "string", enum: OCCASIONS },
      fabrics: { type: "array", items: { type: "string" } }, avoid_fabrics: { type: "array", items: { type: "string" } }, size: { type: "string" }, deadline_days: { type: "number" }, breathable: { type: "boolean" } } } },
  { name: "get_product", description: "Full facts for one product id: listing (Level 1) and what history taught (Level 2: true fit, heat, worn for, quality, colour accuracy, bought with).", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "check_fit", description: "Best size for a person (default the shopper, or e.g. 'daughter', 'husband'), from garment measurements and the learned true cut.", parameters: { type: "object", properties: { id: { type: "string" }, person: { type: "string" } }, required: ["id"] } },
  { name: "get_context", description: "Weather for a city and month, and the dress norms for an occasion.", parameters: { type: "object", properties: { city: { type: "string" }, month: { type: "number" }, occasion: { type: "string" } } } },
  { name: "check_delivery", description: "Expected delivery for product ids, and whether each arrives by a date (YYYY-MM-DD) or within N days.", parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" } }, need_by: { type: "string" }, within_days: { type: "number" } }, required: ["ids"] } },
  { name: "complete_look", description: "Pieces that complete an outfit for a product id, preferring what buyers actually bought together.", parameters: { type: "object", properties: { id: { type: "string" }, budget_left: { type: "number" } }, required: ["id"] } },
  { name: "build_look", description: "ONE outfit from several pieces named in one request (e.g. a green saree + a diamond-look necklace + green sandals): searches each piece with its own words, matches the others to the main piece, splits a total budget, sizes and prices it.",
    parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { query: { type: "string" }, category: { type: "string", enum: CATEGORIES }, colours: { type: "array", items: { type: "string" } }, max_price: { type: "number" } } } },
      total_budget: { type: "number" } }, required: ["items"] } },
  { name: "plan_occasion", description: "One outfit per event (e.g. haldi, sangeet, wedding-evening) within a TOTAL budget; avoids repeating colours; checks delivery before the date.",
    parameters: { type: "object", properties: { events: { type: "array", items: { type: "string", enum: OCCASIONS } }, total_budget: { type: "number" }, city: { type: "string" }, date: { type: "string" }, gender: { type: "string", enum: ["women", "men"] } }, required: ["events"] } },
  { name: "get_offers", description: "Price product ids as one order: MRP, sale price, look bundle discount, best coupon, delivery, final amount.", parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" } }, same_look: { type: "boolean" } }, required: ["ids"] } },
  { name: "add_to_bag", description: "Propose adding items (id + size) to the shopper's bag. Nothing is added until the shopper approves.", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, size: { type: "string" } } } }, note: { type: "string" } }, required: ["items"] } },
  { name: "remember_preference", description: "Propose remembering a shopper preference. Saved only if the shopper approves.", parameters: { type: "object", properties: { fact: { type: "string" }, kind: { type: "string", enum: ["like_colour", "avoid_colour", "avoid_fabric", "like_brand", "size_note", "other"] }, value: { type: "string" } }, required: ["fact"] } },
];
const TOOL_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));
function agentSystem(ctx = {}) {
  const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
  const people = Array.isArray(ctx.people) ? ctx.people.slice(0, 4).map((x) => clip(x, 40)).join(", ") : "";
  const memory = Array.isArray(ctx.memory) ? ctx.memory.slice(0, 8).map((x) => "- " + clip(x, 120)).join("\n") : "";
  return [
    "You are Saathi, the shopping agent inside an Indian fashion store. Work like an agent: plan, call tools, check results, re-plan if needed. Call one tool at a time.",
    "Rules: recommend ONLY product ids returned by your tools. Respect the shopper's hard rules (gender, category, budget, colours they don't want). If a colour isn't available, say so and offer the closest shades the tool labels. Never invent facts. Use check_fit before naming a size. For several events use plan_occasion. For several pieces of one outfit (e.g. a saree, a necklace and sandals) call build_look once, with one item per piece. add_to_bag and remember_preference only propose; the shopper approves.",
    `Shopper: ${clip(ctx.shopper, 60) || "a guest"}; city ${clip(ctx.city, 30)}; today ${clip(ctx.today, 12)}. People with a Mini You: ${people || "none"}.`,
    "What Saathi remembers about them:\n" + (memory || "- nothing yet"),
    "Reply in the shopper's language (English, Hindi, Hinglish or Marathi), warm and brief.",
    'When done, reply with ONLY a JSON object: {"reply": string (2-3 sentences), "picks": [{"id": string, "size": string|null, "role": "best"|"value"|"premium"|"different"|"also", "why": string (max 14 words)}], "follow_up": string|null}. For a plan, one pick per event with role set to the event name; for a look, one pick per piece with role set to the piece.',
  ].join("\n");
}
function cleanAgentMessages(list) {
  const out = [];
  (Array.isArray(list) ? list.slice(-24) : []).forEach((m) => {
    if (!m || typeof m !== "object") return;
    if (m.role === "user") out.push({ role: "user", content: String(m.content || "").slice(0, 600) });
    else if (m.role === "assistant") {
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls.slice(0, 4).filter((tc) => tc && tc.function && TOOL_NAMES.has(tc.function.name))
        .map((tc) => ({ id: String(tc.id || "").slice(0, 64), type: "function", function: { name: tc.function.name, arguments: String(tc.function.arguments || "{}").slice(0, 2000) } })) : [];
      out.push(Object.assign({ role: "assistant", content: String(m.content || "").slice(0, 2000) }, calls.length ? { tool_calls: calls } : {}));
    } else if (m.role === "tool") out.push({ role: "tool", tool_call_id: String(m.tool_call_id || "").slice(0, 64), content: String(m.content || "").slice(0, 6000) });
  });
  return out;
}
async function agentTurn(key, models, messages) {
  const deadline = Date.now() + 9000;
  const tried = [];
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    const ctl = new AbortController();
    try {
      const r = await withTimeout(fetch(GROQ + "/chat/completions", {
        method: "POST", signal: ctl.signal, headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, tools: AGENT_TOOLS.map((t) => ({ type: "function", function: t })), tool_choice: "auto", temperature: 0.2, max_completion_tokens: 900,
          ...(/gpt-oss/.test(model) ? { reasoning_effort: "low", include_reasoning: false } : {}) }),
      }), Math.min(left - 300, 8500), ctl);
      const body = await r.text();
      if (r.status === 429) { tried.push({ model, code: "rate_limited" }); continue; }
      if (r.status === 404 || /model_not_found|decommissioned|does not exist|not have access/i.test(body)) { tried.push({ model, code: "model_unavailable" }); continue; }
      if (!r.ok) { tried.push({ model, code: "upstream_" + r.status, detail: body.slice(0, 160) }); continue; }
      const j = JSON.parse(body);
      const msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((tc) => tc && tc.function && TOOL_NAMES.has(tc.function.name)) : [];
      tried.push({ model, code: "ok" });
      return { ok: true, model, tried, usage: j.usage || null, message: { content: String(msg.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").slice(0, 4000), tool_calls: calls.slice(0, 4) } };
    } catch (e) { tried.push({ model, code: e.message === "timeout" ? "timeout" : "network" }); }
  }
  return { ok: false, code: tried.length && tried.every((t) => t.code === "rate_limited") ? "rate_limited" : "all_models_failed", tried };
}

function parseJSONLoose(s) {
  if (!s) return null;
  let t = String(s).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

async function withTimeout(promise, ms, ctl) {
  let timer;
  const to = new Promise((_, rej) => { timer = setTimeout(() => { ctl && ctl.abort(); rej(new Error("timeout")); }, ms); });
  try { return await Promise.race([promise, to]); } finally { clearTimeout(timer); }
}

let modelCache = { at: 0, ids: null, status: null };
async function listModels(key) {
  if (modelCache.ids && Date.now() - modelCache.at < 10 * 60 * 1000) return modelCache;
  const ctl = new AbortController();
  try {
    const r = await withTimeout(fetch(GROQ + "/models", { headers: { Authorization: "Bearer " + key }, signal: ctl.signal }), 5000, ctl);
    if (!r.ok) { modelCache = { at: Date.now(), ids: null, status: r.status }; return modelCache; }
    const j = await r.json();
    modelCache = { at: Date.now(), ids: (j.data || []).map((m) => m.id), status: 200 };
  } catch (e) { modelCache = { at: Date.now() - 9 * 60 * 1000, ids: null, status: "unreachable" }; }
  return modelCache;
}

async function chat(key, model, messages, schema, name, deadline) {
  const isOss = /gpt-oss/.test(model);
  const attempts = [
    { response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }, ...(isOss ? { reasoning_effort: "low", include_reasoning: false } : {}) },
    { response_format: { type: "json_object" } },
  ];
  let last = null;
  for (const extra of attempts) {
    const left = deadline - Date.now();
    if (left < 1200) return { ok: false, code: "timeout", detail: last };
    const ctl = new AbortController();
    try {
      const r = await withTimeout(fetch(GROQ + "/chat/completions", {
        method: "POST", signal: ctl.signal,
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0, max_completion_tokens: 900, ...extra }),
      }), Math.min(left - 300, 8000), ctl);
      const body = await r.text();
      if (r.status === 429) return { ok: false, code: "rate_limited", retryAfter: r.headers.get("retry-after"), detail: body.slice(0, 200) };
      if (r.status === 404 || /model_not_found|decommissioned|does not exist|not have access/i.test(body)) return { ok: false, code: "model_unavailable", detail: body.slice(0, 200) };
      if (r.status === 400) { last = body.slice(0, 200); continue; } // try the simpler request shape
      if (!r.ok) return { ok: false, code: "upstream_" + r.status, detail: body.slice(0, 200) };
      const j = JSON.parse(body);
      const data = parseJSONLoose(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
      if (!data) { last = "unparseable"; continue; }
      return { ok: true, data, model, usage: j.usage || null };
    } catch (e) {
      return { ok: false, code: e.message === "timeout" ? "timeout" : "network", detail: String(e.message || e).slice(0, 120) };
    }
  }
  return { ok: false, code: "bad_request", detail: last };
}

async function runWithFallback(key, models, messages, schema, name) {
  const deadline = Date.now() + 9000; // stay inside a 10 s function limit
  const tried = [];
  for (const m of models) {
    const res = await chat(key, m, messages, schema, name, deadline);
    tried.push({ model: m, code: res.ok ? "ok" : res.code });
    if (res.ok) return { ...res, tried };
    if (res.code === "timeout" && Date.now() > deadline - 1200) break;
  }
  const rl = tried.every((t) => t.code === "rate_limited");
  return { ok: false, code: rl ? "rate_limited" : "all_models_failed", tried };
}

async function transcribe(key, model, b64, mime, language) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = /webm/.test(mime) ? "webm" : /ogg/.test(mime) ? "ogg" : /mp4|m4a|aac/.test(mime) ? "m4a" : /wav/.test(mime) ? "wav" : "webm";
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: mime || "audio/webm" }), "voice." + ext);
  fd.append("model", model);
  fd.append("response_format", "json");
  if (language && /^(en|hi|mr)$/.test(language)) fd.append("language", language);
  const ctl = new AbortController();
  const r = await withTimeout(fetch(GROQ + "/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + key }, body: fd, signal: ctl.signal }), 9000, ctl);
  const body = await r.text();
  if (!r.ok) return { ok: false, code: r.status === 429 ? "rate_limited" : "upstream_" + r.status, detail: body.slice(0, 200) };
  const j = JSON.parse(body);
  return { ok: true, text: (j.text || "").trim(), model };
}

/* simple per-instance rate limit: 30 requests a minute per visitor */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 30;
}

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

async function handle(req, env, opts = {}) {
  const cors = opts.cors || {};
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const key = env.GROQ_API_KEY;
  const textModels = (env.GROQ_TEXT_MODELS || DEFAULT_TEXT_MODELS).split(",").map((s) => s.trim()).filter(Boolean);
  const visionModels = (env.GROQ_VISION_MODELS || DEFAULT_VISION_MODELS).split(",").map((s) => s.trim()).filter(Boolean);
  const sttModel = (env.GROQ_STT_MODEL || DEFAULT_STT_MODEL).trim();

  if (req.method === "GET") {
    if (!key) return json({ ok: false, reason: "missing_key", hint: "Add GROQ_API_KEY in your host's environment settings, then redeploy." }, 200, cors);
    const mc = await listModels(key);
    if (mc.status === 401 || mc.status === 403) return json({ ok: false, reason: "bad_key", hint: "Groq rejected the key. Create a new one at console.groq.com." }, 200, cors);
    const has = (m) => !mc.ids || mc.ids.includes(m); // if the list is unreachable, assume configured models
    const text = textModels.find(has) || null, vision = visionModels.find(has) || null;
    const stt = has(sttModel) ? sttModel : null;
    return json({ ok: !!text, reason: text ? null : "no_text_model", text, vision, stt, agent: text, checked: mc.ids ? "live" : "assumed", retired: textModels.concat(visionModels).filter((m) => !has(m)) }, 200, cors);
  }
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405, cors);
  if (!key) return json({ ok: false, reason: "missing_key" }, 503, cors);
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "anon";
  if (limited(ip)) return json({ ok: false, reason: "rate_limited" }, 429, cors);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_json" }, 400, cors); }
  const mc = await listModels(key);
  const live = (list) => (mc.ids ? list.filter((m) => mc.ids.includes(m)) : list);
  const t0 = Date.now();
  if (body.task === "intent") {
    const text = String(body.text || "").slice(0, 600);
    if (!text.trim()) return json({ ok: false, reason: "empty" }, 400, cors);
    const ctx = body.context || {};
    const res = await runWithFallback(key, live(textModels), intentMessages(text, { city: String(ctx.city || "").slice(0, 40), dept: ctx.dept === "men" ? "men" : "women", today: String(ctx.today || "").slice(0, 20) }), INTENT_SCHEMA, "shopping_intent");
    return json({ ...res, ms: Date.now() - t0 }, res.ok ? 200 : res.code === "rate_limited" ? 429 : 502, cors);
  }
  if (body.task === "vision") {
    const img = String(body.image || "");
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 2_800_000) return json({ ok: false, reason: "bad_image" }, 400, cors);
    const res = await runWithFallback(key, live(visionModels), visionMessages(img, String(body.caption || "").slice(0, 300)), VISION_SCHEMA, "reel_outfit");
    return json({ ...res, ms: Date.now() - t0 }, res.ok ? 200 : res.code === "rate_limited" ? 429 : 502, cors);
  }
  if (body.task === "agent") {
    const msgs = cleanAgentMessages(body.messages);
    if (!msgs.length || msgs[0].role !== "user" || JSON.stringify(msgs).length > 80000) return json({ ok: false, reason: "bad_messages" }, 400, cors);
    const res = await agentTurn(key, live(textModels), [{ role: "system", content: agentSystem(body.context || {}) }].concat(msgs));
    return json({ ...res, ms: Date.now() - t0 }, res.ok ? 200 : res.code === "rate_limited" ? 429 : 502, cors);
  }
  if (body.task === "transcribe") {
    const b64 = String(body.audio || "");
    if (!b64 || b64.length > 5_500_000) return json({ ok: false, reason: "bad_audio" }, 400, cors);
    try {
      const res = await transcribe(key, sttModel, b64, String(body.mime || "audio/webm"), String(body.language || ""));
      return json({ ...res, ms: Date.now() - t0 }, res.ok ? 200 : 502, cors);
    } catch (e) { return json({ ok: false, reason: "transcribe_failed", detail: String(e.message || e).slice(0, 120) }, 502, cors); }
  }
  return json({ ok: false, reason: "unknown_task" }, 400, cors);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
    const ok = !allowed.length || allowed.includes(origin);
    const cors = { 'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    if (!ok) return new Response(JSON.stringify({ ok: false, reason: 'origin_not_allowed', origin }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    return handle(request, env, { cors });
  },
};
