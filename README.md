# Saathi: run it, host it, demo it

Saathi is a fashion store with a team of shopping agents inside. The whole app is one web page.

It works on its own with a rules planner, which understands English, Hinglish, हिंदी and मराठी. Adding a free Groq key adds three things:

- an AI planner that calls the same tools,
- reading reel frames,
- voice in browsers without built-in speech recognition.

The key stays in a small server function and never goes into the page.

```
saathi-site/
  index.html                      the whole app: catalogue, Level 2 data, agents, UI
  local-server.mjs                run it on your computer: node local-server.mjs
  .env.example                    copy to .env and add your free Groq key (optional)
  netlify.toml                    Netlify settings
  netlify/functions/ai.mjs        the free-AI function, answers at /api/ai
  cloudflare-worker/worker.js     the same function for Cloudflare (use with GitHub Pages)
  data/                           Level 1 and Level 2 CSVs, analysis.json, the year of history (see data/DATA_README.md)
```

## 1. Run it on your computer (one command)

This is also the quickest way to test voice. The claude.ai preview blocks the microphone; your own computer doesn't.

1. Install Node.js 18 or newer from https://nodejs.org.
2. Unzip `saathi-site.zip`, open a terminal in the `saathi-site` folder, and run:

   ```bash
   node local-server.mjs
   ```

3. Open **http://localhost:8080** in Chrome or Edge.
4. Tap a mic button. Allow the microphone when the browser asks, then speak.

Voice works on `localhost` because browsers treat it as a secure address. On `http://192.168…` or any other plain-http address, the browser blocks the microphone. Use localhost or an https link.

**Optional: free AI locally.** Copy `.env.example` to `.env` and paste your key (step 2 below), then restart the server. The terminal says `Free AI: on`. Without a key, everything works with the rules planner.

## 2. Get a free Groq key (2 minutes)

1. Sign in at https://console.groq.com. Google sign-in works and no card is needed.
2. Open **API Keys** (https://console.groq.com/keys) and choose **Create API Key**.
3. Copy the key; it starts with `gsk_`. It goes into `.env`, Netlify or Cloudflare, never into the page.

## 3a. Host on Netlify (recommended)

The Netlify CLI deploys the page and the AI function together.

```bash
cd saathi-site
npx netlify-cli login
npx netlify-cli deploy --prod            # pick "Create & configure a new project"
npx netlify-cli env:set GROQ_API_KEY gsk_your_key_here
npx netlify-cli deploy --prod            # deploy again so the function reads the key
```

Prefer clicking to typing?

1. Put the `saathi-site` folder in a GitHub repo.
2. In Netlify choose **Add new project → Import an existing project** and pick the repo. There's no build command; `netlify.toml` sets everything.
3. Add `GROQ_API_KEY` under **Project configuration → Environment variables**.
4. Choose **Deploys → Trigger deploy**.

Dragging the folder onto Netlify Drop publishes the page but may skip the function. The app then runs with the rules planner only.

## 3b. Or: GitHub Pages and a Cloudflare Worker

1. In the Cloudflare dashboard, choose **Workers & Pages → Create → Start with Hello World**. Name it `saathi-ai`, then **Deploy**.
2. Choose **Edit code**, replace everything with `cloudflare-worker/worker.js`, then **Deploy**.
3. Under the Worker's **Settings → Variables and Secrets**, add:
   - `GROQ_API_KEY`, type **Secret**: your key
   - `ALLOWED_ORIGIN`, type **Text**: your Pages address, for example `https://yourname.github.io`
4. In `index.html`, find `window.SAATHI_AI = { endpoint: "" };` and paste the worker URL:
   `window.SAATHI_AI = { endpoint: "https://saathi-ai.yourname.workers.dev" };`
5. Push `index.html` and `data/` to a GitHub repo, then turn on **Settings → Pages → Deploy from a branch → main / (root)**.

## 4. Check that AI is on

- The pill at the top right says **AI agent: free models**. Click it to see the models, switch to **Rules only**, check again, or reset the demo data.
- Opening `/api/ai` (or the worker URL) shows a health report, such as `{"ok":true,"text":"openai/gpt-oss-20b","agent":"openai/gpt-oss-20b",...}`.
- If the pill says **Rules agent (AI off)**, the menu explains why: no key, a rejected key, or no function found.

## 5. Running the demo

The top bar has the controls:

- **App / Website**: the store as a phone app, or as a website.
- **Store, Why this?, Agents, Data lab, Impact**: the views.
- **EN / हिं / मरा**: the interface language.
- **Sun / moon**: light or dark mode.
- **Prompts**: 35 demo requests in seven groups (exact matches, occasion and weather, languages, whole looks, plans, closest matches, shopping for someone else). Each one is checked against this catalogue on every build. **Put in the Ask box** fills it in as the right shopper; **Run** opens the results.
- **Guided demo**: a 12-step walkthrough you advance with **Next**. Nothing plays until you press it. Use Back, Next or the arrow keys; Esc closes it.

**How shopping works.** Type what you want, in your own words, in the search bar or the **Ask Saathi** box on the home page. The request opens a results page, like any store:

- **One thing** ("red kurta for men under 4000"): a listing with Saathi's picks on top, then every match with filters and sorting.
- **Several pieces of one outfit** ("i need green saree, to go with diamond necklace, and green sandals"): a **look** page. Each piece is searched with its own words, the others are matched to the main piece, a total budget is split across them, and **Add the look to bag** adds every piece with one tap. Swap any piece with **Use this**, or remove it. A piece named only as something to match ("to go with diamond necklace") is **optional**: it's shown, but stays out of the bag until the shopper taps **Add to look**.
- **Not stocked exactly** ("silver kurta … white track pants … for my 15 yr old son"): the page is never empty. A callout says what isn't in stock ("No white track pants in stock. Track pants in other colours: brown, charcoal, olive. White in other styles: linen trousers."), the closest pieces are shown, and every card says what's different ("Brown, not white"). Colour, style, pattern, cut, fabric, metal, budget and delivery are loosened one at a time, nearest first. What's missing is logged for the buying team.
- **Context it picks up**: things the shopper already owns ("…to go with my red lehenga", "…goes well with gold necklace") are matched to, not searched for; "winter" or "night" prefers warmer fabrics and flags light ones; someone with no Mini You ("my 15 yr old son") is sized from a typical body for that age, and the page says so.
- **Several events** ("haldi, sangeet and reception in Jaipur on 12 Dec, total ₹15,000"): a **plan** page, one look per function, with **Add the plan to bag**.
- **Too vague** ("something nice"): a page with the one question Saathi needs, as tap-to-answer chips.

The strip at the top of every results page shows the agents' steps; **Why these results?** opens the full reasoning. The rules planner answers at once. With AI on, Claude (in the claude.ai preview) or the free models (on the hosted link) re-plan in the background and refine the page when they finish; the strip says when. The **Chat with Saathi** button (website) and the Saathi tab (app) open a separate conversation for anyone who prefers to talk it through.

How each view works:

- **App**: the explanation ("How Saathi decided") sits beside the phone.
- **Website**: "Why this?" is its own tab. Every result also has a **Why these results?** link.
- **Agents**: the agent team, every tool with its autonomy level, the guardrails, and back-office agents. It also has goals you can run in the open and watch step by step.
- **Data lab**: Level 1 next to Level 2 for every product, the charts, the search words Saathi learned in four languages, how well the analysis recovers the hidden truths, and the data downloads.
- **Impact**: the business case. Every assumption is a slider. It also has the metric tree, guardrails, experiment design, roadmap, PM standards, and the CCPA dark-pattern, DPDP and ASCI compliance notes.

**Shoppers.** Choosing a shopper only switches to them; nothing is typed or asked for you. Suggestions fill the Ask box, and you press **Find it**.

| Shopper | Try |
| --- | --- |
| Ananya | A breathable pastel outfit for a day wedding in Mumbai. Then the three-function plan within ₹15,000: tap **Add the plan to bag**, open the bag and watch the returns guard. For closest matches: "i need a silver colour kurta that goes well with gold necklace, and a white track pant with that, for winter nights, all within 15,000, for my 15 yr old son". |
| Sunita | Hindi, for her daughter Pooja. The results are sized for Pooja's Mini You, and the page is in Hindi. Try a Hindi look too: "हरी साड़ी और हरे सैंडल, पाँच हज़ार तक". |
| Riya | A whole look in one line: "Green saree, to go with a diamond necklace, and green sandals". Her usual ₹3,000 budget applies to the saree, and the necklace is optional until she adds it. Also reels: sample a reel and get the closest match, a cheaper one and a different take. |
| Rohan | Fit. Office shirts that fit his shoulders, the brand size table, and photo measuring in Mini You. |
| Neha | Hinglish and Western wear: "croptop for brunch under 1000". |
| Arjun | Streetwear for men. |
| Vikram | Men's ethnic wear, in Hindi. |
| Madhuri | Marathi. |
| Guest | A plain search for anyone, for example "red kurta for men under 4000", or a look: "red lehenga with gold jhumkas and juttis under 15000". |
| **+ Add shopper** | Your own profile: name, gender, city, language, height, weight and body shape. |

Deep links: add `#web`, `#why`, `#agents`, `#data`, `#impact`, `#demo` or `#prompts` to the address.

## 6. Voice

| Where | What happens |
| --- | --- |
| Chrome, Edge or Safari on the hosted link or http://localhost | The browser's own speech recognition, in the shopper's language (en-IN, hi-IN, mr-IN). |
| Firefox and other browsers without speech recognition | Records up to 12 seconds and transcribes with Groq Whisper. Needs the free AI key. |
| The claude.ai preview | The preview's frame blocks the microphone, so Saathi says so and points to the hosted or local link. Typing works, and so does your phone keyboard's mic. |

Spoken replies use the device's own voices. If the device has no Hindi or Marathi voice, the reply is read in English.

## 7. Models and limits

| Job | Default model | Change with |
| --- | --- | --- |
| Understanding requests | `openai/gpt-oss-20b`, then `openai/gpt-oss-120b` | `GROQ_TEXT_MODELS` |
| The agent (function calling) | the same text models, with Saathi's tool list | `GROQ_TEXT_MODELS` |
| Reading a reel frame | `qwen/qwen3.8-27b` | `GROQ_VISION_MODELS` |
| Speech to text | `whisper-large-v3-turbo` | `GROQ_STT_MODEL` |

- Each setting takes a comma-separated list, tried in order. Models that Groq no longer lists are skipped automatically.
- Groq's free plan allows roughly 30 requests a minute per text model, which is plenty for a demo. If a limit is hit, that request falls back to the rules planner, and the "Why this?" steps say so.
- The function writes its own prompts and accepts only four tasks: intent, agent, vision and transcribe. That means the key can't be used as an open chatbot. Each visitor is also limited to 30 calls a minute.
- The AI planner can only act through Saathi's tools, which run in the page (search, fit, delivery, offers, complete the look, build a look, plan an event). Its picks are re-checked against the shopper's rules (department, budget, excluded colours, stock). Adding to the bag and remembering a preference always wait for the shopper's tap.
- If the AI doesn't finish, or answers something the checks reject, the results page keeps the rules planner's answer and the strip says so.

## 8. Real product photos

Products show studio renders. To show photos you have the rights to use (your own shoot, or images your supplier licenses to you):

1. Put them in an `images/` folder.
2. List them near the top of `index.html`: `window.SAATHI_PHOTOS = { "SA-001": "images/SA-001.jpg" };`

Don't copy product photos from other websites; they're someone else's copyright.

## 9. Troubleshooting

| What you see | Fix |
| --- | --- |
| "The AI function is deployed but has no GROQ_API_KEY yet." | Add the variable, then deploy again (Netlify) or save the variable (Cloudflare). Locally, add it to `.env` and restart. |
| "Groq rejected the API key." | Create a new key at console.groq.com/keys and replace it. |
| "No AI function found at /api/ai." | The function wasn't deployed (for example, a Netlify Drop upload). Use the CLI or Git route, or `node local-server.mjs`. |
| Worker answers `origin_not_allowed` | `ALLOWED_ORIGIN` must match your site's address exactly, with no trailing slash. |
| The mic says it was blocked | Allow the microphone in the browser's site settings. Use localhost or an https address, not plain http. |
| Old results after changing data | AI pill menu → **Reset demo data**. |

## Privacy

- **Body photos** are read in the browser and discarded. Only measurements are kept, in that browser, and you can delete them in Mini You.
- **Reel frames** stay on the device. Only the single clearest frame goes to the vision model, and only when AI is on.
- **Memory** is opt-in, visible and deletable: Me → What Saathi remembers → Forget.
