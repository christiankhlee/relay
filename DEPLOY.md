# Deploying Relay so it's genuinely live for anyone — for free

This uses Google's Gemini API, which has a permanent free tier (no credit card, no expiration, generous daily limits) — a good fit for a public demo link meant to stay up indefinitely.

**What you're building:** page → Worker (holds the API key, free, always-on) → Gemini API. The key never touches the browser, so it's safe to make the page public.

---

## Step 1 — Get a free Gemini API key

1. Go to **aistudio.google.com** and sign in with any Google account.
2. Click **Get API key** → **Create API key**.
3. Copy the key. No credit card, no billing setup, no expiration on the free tier.

That's it for this step — genuinely free, permanently.

## Step 2 — Deploy the Worker (this is what holds your key safely)

1. Go to **dash.cloudflare.com** and sign in (or create a free account).
2. In the left sidebar, click **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name (e.g. `relay-demo`) → **Deploy** (it deploys a placeholder — that's fine, you're about to replace it).
4. Click **Edit code**.
5. Select all the existing placeholder code, delete it, and paste in the entire contents of `worker.js` from this project.
6. Click **Deploy** (top right).
7. Go to your Worker's **Settings → Variables and Secrets**.
8. Add a new secret: name it exactly `GEMINI_API_KEY`, paste in the key from Step 1, mark it encrypted, save.
9. At the top of your Worker's page, copy its URL — it looks like `https://relay-demo.yourname.workers.dev`.

## Step 3 — Point the demo at your Worker

1. Open `index.html` in a text editor.
2. Find this line:
   ```
   const WORKER_ENDPOINT = "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev";
   ```
3. Replace the placeholder with your real Worker URL from Step 2.9.
4. Save.

## Step 4 — Test it

Open `index.html`, make sure **Live** mode is selected, click a preset, hit **Run pipeline**. The banner should say *"Connected — every non-cached stage this run was a real Gemini API call."* If it fails, the banner will show the real error — the Worker passes it through instead of hiding it.

## Step 5 — Publish it

Push `index.html`, `worker.js`, `README.md`, and `DEPLOY.md` to your GitHub repo, then turn on **GitHub Pages** (repo **Settings → Pages → Deploy from branch**).

---

## Swapping providers

The Worker is a thin translation layer: it accepts an Anthropic-shaped request (`{system, messages}`) from `index.html` and translates it to whichever provider's API it's calling. Swapping to Anthropic's Claude API instead of Gemini only means changing the upstream URL, request/response shape, and the `ANTHROPIC_API_KEY` secret in `worker.js` — `index.html` doesn't change.

## Honest limits, worth knowing

- **Gemini's free tier uses your inputs to improve their models.** Since everything here is fictional (Wayfind, made-up docs), that's a non-issue for this project — just don't reuse this exact Worker for anything with real/sensitive data without switching to a paid tier.
- **The per-IP rate limit in `worker.js` is best-effort**, not bulletproof (Workers can reset it by spinning up fresh instances). Google's own 1,500-requests/day account-wide cap is your real backstop.
- **CORS is wide open (`*`)** for now — tighten `corsHeaders()` to your exact GitHub Pages origin once it's live.
