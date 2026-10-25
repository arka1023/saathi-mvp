# Saathi MVP: agentic style & fit concierge

A working MVP for the D2C fashion case: a Hinglish concierge, Reel-to-Cart, a Mini You fit twin, duplicate-free recommendations and a pre-checkout fit check, running over a 100-SKU pilot catalog.

- `index.html`: the whole app (catalog, ranking engine and UI in one file)
- `netlify/functions/ai.mjs`: free AI proxy for Netlify (Groq)
- `cloudflare-worker/worker.js`: the same proxy for the GitHub Pages version
- `saathi_catalog_100_skus.csv`: the pilot catalog

The Groq API key lives only on the server (a Netlify environment variable or a Cloudflare secret), never in the page. If no AI backend answers, the app falls back to its built-in rules, so it never breaks.

Models (change them with environment variables):
- `GROQ_FAST_MODEL`, default `llama-3.1-8b-instant` (understanding the brief)
- `GROQ_TEXT_MODEL`, default `llama-3.3-70b-versatile`
- `GROQ_VISION_MODEL`, default `qwen/qwen3.8-27b` (reading reel screenshots; a Groq preview model)
