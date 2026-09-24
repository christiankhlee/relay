const MODEL = "gemini-3.6-flash";
const MAX_TOKENS_CAP = 900;
const RATE_LIMIT_PER_HOUR = 30;

// In-memory only — Workers can spin up fresh instances, so this is a speed bump,
// not a guarantee. Gemini's own account-wide daily cap is the real backstop.
const rateMap = new Map();

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const entry = rateMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    rateMap.set(ip, entry);
    if (entry.count > RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: { message: "Rate limit exceeded for this demo. Try again in a bit." } }),
        { status: 429, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    let body;
    try { body = await request.json(); }
    catch (e) {
      return new Response(
        JSON.stringify({ error: { message: "Invalid JSON body" } }),
        { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: { message: "Worker is missing the GEMINI_API_KEY secret — add it in Cloudflare dashboard → your Worker → Settings → Variables." } }),
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    // The page sends an Anthropic-shaped request ({system, messages}). Translate it
    // to Gemini's shape here, so index.html never needs to know which provider is behind the Worker.
    const userText = (body.messages && body.messages[0] && body.messages[0].content) || "";
    const cappedTokens = Math.min(body.max_tokens || MAX_TOKENS_CAP, MAX_TOKENS_CAP);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
    const upstream = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: body.system || "" }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        // thinkingBudget:0 disables internal reasoning tokens — without it, Flash models can
        // spend the whole maxOutputTokens budget "thinking" and cut the visible answer off mid-sentence.
        generationConfig: { maxOutputTokens: cappedTokens, thinkingConfig: { thinkingBudget: 0 } }
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: { message: data.error?.message || `Gemini API error (HTTP ${upstream.status})` } }),
        { status: upstream.status, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    const candidate = data.candidates && data.candidates[0];
    const text = candidate?.content?.parts?.map(p => p.text).join("") || "";
    if (!text) {
      return new Response(
        JSON.stringify({ error: { message: `No text returned (finishReason: ${candidate?.finishReason || "unknown"})` } }),
        { status: 502, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    const usage = {
      input_tokens: data.usageMetadata?.promptTokenCount || 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount || 0
    };

    const translated = { content: [{ type: "text", text }], usage };
    return new Response(JSON.stringify(translated), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }
};