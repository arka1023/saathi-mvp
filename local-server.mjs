// Run Saathi on your own computer with one command:   node local-server.mjs
// Then open http://localhost:8080 in Chrome or Edge.
//
// - Serves this folder and runs the same free-AI function the hosted site uses, at /api/ai.
// - For AI (and Whisper voice in browsers without built-in speech recognition), put your free Groq key in a file
//   named .env next to this one:   GROQ_API_KEY=gsk_...
//   Without a key everything still works with the rules agent.
// - Voice: Chrome and Edge allow the microphone on http://localhost, and use their built-in speech recognition.
// Needs Node.js 18 or newer. No packages to install.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = +(process.env.PORT || process.argv[2] || 8080);

// .env (KEY=value lines), never committed
const envFile = path.join(here, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { default: handler } = await import(pathToFileURL(path.join(here, "netlify/functions/ai.mjs")).href);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".zip": "application/zip" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname === "/api/ai") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined });
      const out = await handler(request);
      res.writeHead(out.status, Object.fromEntries(out.headers.entries()));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    let p = path.normalize(path.join(here, decodeURIComponent(url.pathname)));
    if (!p.startsWith(here) || path.basename(p).startsWith(".")) { res.writeHead(403); res.end("forbidden"); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(String(e && e.message || e));
  }
}).listen(port, () => {
  console.log(`Saathi is running at http://localhost:${port}`);
  console.log(process.env.GROQ_API_KEY ? "Free AI: on (Groq key found)." : "Free AI: off. Add GROQ_API_KEY=gsk_... to a .env file here to turn it on; the rules agent works without it.");
});
