// Offline test for the cache-similarity logic in index.html. No network calls:
//   node test-cache-logic.mjs
//
// Duplicates the tokenize/bow/cosine functions from index.html rather than
// importing them, since index.html isn't a module — mirror changes to that
// logic here too.

const STOP = new Set(['the','a','an','to','of','in','on','for','and','or','is','are','be','with','as','by','at','from','that','this','it','can','will']);

function tokenize(s){
  return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)
    .filter(w=>w && w.length>1 && !STOP.has(w))
    .map(w=> (w.length>3 && w.endsWith('s') && !w.endsWith('ss')) ? w.slice(0,-1) : w);
}
function bow(text){ const c={}; tokenize(text).forEach(t=>c[t]=(c[t]||0)+1); return c; }
function cosine(a,b){ let dot=0,na=0,nb=0; for(const k in a){na+=a[k]*a[k]; if(b[k]) dot+=a[k]*b[k];} for(const k in b) nb+=b[k]*b[k]; const denom=Math.sqrt(na)*Math.sqrt(nb); return denom? dot/denom : 0; }

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log(`  ok  - ${name}`); }
  else { fail++; console.log(`FAIL  - ${name}${detail?` (${detail})`:''}`); }
}

console.log('Tokenizer stemming');
check('drivers -> driver', tokenize('drivers').includes('driver'));
check('routes -> route', tokenize('routes').includes('route'));
check('short words dropped (a, to)', !tokenize('a route to go').includes('a'));
check('"class" not de-pluralized to "clas"', tokenize('class').includes('class'));

console.log('\nPreset 1 vs Preset 2 (the CSV paraphrase pair — should now clear the 0.32 default threshold)');
const p1 = "Let drivers export their assigned routes as a CSV file from the mobile app.";
const p2 = "Add the ability to download a CSV of a driver's routes.";
const sim = cosine(bow(p1), bow(p2));
console.log(`  similarity = ${sim.toFixed(3)}`);
check('similarity clears default threshold (0.32)', sim >= 0.32, `got ${sim.toFixed(3)}`);
check('similarity would have missed the old threshold (0.55)', sim < 0.55, `got ${sim.toFixed(3)} — if this fails the old threshold was fine and something else was wrong`);

console.log('\nUnrelated ticket should NOT cache-hit against preset 1');
const unrelated = "Add a dark mode option to the driver app.";
const simUnrelated = cosine(bow(p1), bow(unrelated));
console.log(`  similarity = ${simUnrelated.toFixed(3)}`);
check('unrelated ticket stays below threshold', simUnrelated < 0.32, `got ${simUnrelated.toFixed(3)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
