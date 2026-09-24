// Live test against the deployed Cloudflare Worker + Gemini. Uses real API quota:
//   node test-worker-live.mjs
//
// Checks:
//   1. The worker is reachable and returns a normal 200 with content.
//   2. Output isn't getting cut off mid-sentence (heuristic: ends in sentence-ending
//      punctuation — the worker doesn't pass finishReason through, so this is the
//      practical signal) and output_tokens stays under the token cap.
//   3. The plain-text system-prompt rule is respected (no stray markdown like
//      **bold**, # headers, or `code` spans in the reply).

const WORKER_ENDPOINT = "https://relay-demo.christiankhlee.workers.dev/";

const PLAIN_TEXT_RULE = " Plain text only — no markdown, no **bold**, no # headers, no backtick code spans. Use plain numbered lines like '1. ' if listing items.";

const cases = [
  {
    name: 'router',
    system: "You are an engineering manager at Wayfind, a delivery route-planning SaaS. Given a feature request, decide which specialist track(s) are needed: backend (API/data/services) and/or frontend (Driver App UI). Respond with exactly one line starting 'TRACKS: backend' or 'TRACKS: frontend' or 'TRACKS: both', then one short sentence explaining why. No other text." + PLAIN_TEXT_RULE,
    user: 'Feature request: "Let drivers export their assigned routes as a CSV file from the mobile app."'
  },
  {
    name: 'integrator (longer output, higher truncation risk)',
    system: "You are a tech lead merging specialist proposals into one coherent plan. Given a feature request and one or two specialist drafts, produce a single combined plan under 130 words, explicitly naming any interface/contract point the tracks must agree on (or stating there are none if only one track exists). No preamble." + PLAIN_TEXT_RULE,
    user: 'Feature request: "Let drivers export their assigned routes as a CSV file from the mobile app."\n\nSpecialist drafts:\nBackend agent: Add GET /routes/{driver_id}/export?format=csv to Routes API. Extend ReportGenerator with a CSV formatter.\nFrontend agent: Add an \'Export CSV\' action next to the existing \'Export PDF\' button on the Driver App route list screen.'
  },
  {
    name: 'reviewer (longer output, most likely to get cut off)',
    system: "You are a tech lead reviewing a proposed plan. Give a one-line verdict (Approve / Needs changes) then up to 3 short numbered risk or edge-case bullets. Under 110 words. No preamble." + PLAIN_TEXT_RULE,
    user: 'Feature request: "Notify dispatchers via webhook when a route is marked completed."\n\nProposed plan:\nAdd a route.completed event to Notification Service, extend the webhook subscription model beyond per-driver scoping, and have Routes API emit the event on status transition to completed.'
  }
];

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log(`    ok  - ${name}`); }
  else { fail++; console.log(`  FAIL  - ${name}${detail?` (${detail})`:''}`); }
}

for(const c of cases){
  console.log(`\n=== ${c.name} ===`);
  let response;
  try{
    response = await fetch(WORKER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: 900, system: c.system, messages: [{ role: 'user', content: c.user }] })
    });
  } catch(networkErr){
    check('reachable', false, networkErr.message);
    continue;
  }
  check('HTTP 200', response.status === 200, `got ${response.status}`);
  const data = await response.json().catch(()=>null);
  if(!data){ check('valid JSON body', false); continue; }
  if(!response.ok){
    check('no error in body', false, data.error?.message || JSON.stringify(data).slice(0,200));
    continue;
  }
  const text = (data.content || []).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
  check('non-empty output', text.length > 0);
  check('output_tokens under 900 cap', (data.usage?.output_tokens ?? 0) <= 900, `got ${data.usage?.output_tokens}`);
  check('not cut off mid-sentence', /[.!?]['"]?$/.test(text), `ends with: "…${text.slice(-40)}"`);
  check('no markdown bold (**)', !text.includes('**'), text.slice(0,120));
  check('no markdown headers (#)', !/^#{1,6}\s/m.test(text), text.slice(0,120));
  check('no backtick code spans', !text.includes('`'), text.slice(0,120));
  console.log(`    output_tokens=${data.usage?.output_tokens}, input_tokens=${data.usage?.input_tokens}`);
  console.log(`    preview: ${text.slice(0,150).replace(/\n/g,' ')}${text.length>150?'…':''}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
