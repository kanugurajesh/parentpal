import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError } from "../lib/errors";
import { caregiverLog, openPublicPlaybook, type PublicPlaybook } from "../services/playbook";
import { llmLimit } from "../lib/rateLimit";

/**
 * The page a grandparent, nanny or teacher opens from a shared link: no app, no login.
 * Server-rendered so it loads fast on any phone browser, with a strict CSP and no indexing.
 */

const Token = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/, "Invalid link") });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

/** Palette and type from apps/mobile/src/theme/tokens.ts, so the page feels like the app. */
const STYLE = `
:root{--paper:#F2F5F0;--paperDeep:#E6ECE4;--card:#FBFCFA;--ink:#1E2A3A;--inkSoft:#4A5768;--inkMuted:#7A8696;--line:#D5DDD3;--moss:#2E6A4F;--mossDeep:#21503B;--mossTint:#DCEAE1;--apricot:#F4A259;--apricotTint:#FCE6CF;--danger:#B3261E;--dangerTint:#FBE3E0}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.55 "Atkinson Hyperlegible",system-ui,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:560px;margin:0 auto;padding:20px 16px 48px}
h1,h2,h3{font-family:"Bricolage Grotesque",system-ui,sans-serif;margin:0;letter-spacing:-.02em}
h1{font-size:32px;line-height:1.1}
h2{font-size:22px;line-height:1.2}
h3{font-size:14px;letter-spacing:0;color:var(--inkMuted);font-family:inherit;font-weight:700;text-transform:none}
.brand{color:var(--moss);font-weight:700;font-family:"Bricolage Grotesque",system-ui,sans-serif;display:flex;align-items:center;gap:8px;margin-bottom:20px}
.hero{background:var(--mossTint);border-radius:28px;padding:22px;margin-bottom:20px}
.hero p{margin:8px 0 0;color:var(--inkSoft)}
.card{background:var(--card);border:1.5px solid var(--line);border-radius:22px;padding:20px;margin-bottom:16px}
.card > * + *{margin-top:14px}
.tag{display:inline-block;background:var(--paperDeep);color:var(--inkSoft);border-radius:999px;padding:2px 12px;font-size:13px;font-weight:700}
.say{border-left:4px solid var(--apricot);background:var(--apricotTint);border-radius:14px;padding:14px 16px}
.say h3{color:#8A4B12}
.say p{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-size:20px;line-height:1.35;margin:4px 0 0}
p{margin:4px 0 0}
.muted{color:var(--inkMuted);font-size:14px}
.log{background:var(--card);border:1.5px solid var(--moss);border-radius:22px;padding:20px;margin-top:24px}
.row{display:flex;gap:10px;margin:14px 0}
button{font:inherit;font-weight:700;border-radius:999px;min-height:52px;padding:0 20px;cursor:pointer;border:1.5px solid var(--line);background:var(--card);color:var(--ink);flex:1}
button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
button.primary{background:var(--moss);border-color:var(--moss);color:#fff;width:100%;margin-top:12px}
button:disabled{opacity:.5}
textarea,select{width:100%;min-height:96px;font:inherit;border:1.5px solid var(--line);border-radius:14px;padding:12px 14px;background:#fff;color:var(--ink);resize:vertical}
select{min-height:0;margin-bottom:12px}
.notice{border-radius:14px;padding:14px 16px;margin-top:12px}
.ok{background:var(--mossTint)}
.err{background:var(--dangerTint);color:var(--danger)}
.safety{background:var(--dangerTint);border:1.5px solid #F1B7B1}
.safety a{display:block;margin-top:8px;color:var(--danger);font-weight:700}
footer{margin-top:32px;text-align:center;color:var(--inkMuted);font-size:13px}
`;

const PEBBLE = `<svg width="28" height="20" viewBox="0 0 100 70" aria-hidden="true"><path d="M10 34C12 16 34 6 58 9c22 3 36 15 34 30-2 17-20 25-44 25C24 64 8 52 10 34z" fill="#F4A259" stroke="#1E2A3A" stroke-width="5"/></svg>`;

function shell(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body><main><div class="brand">${PEBBLE}ParentPal</div>${body}</main></body></html>`;
}

export function renderPlaybook(p: PublicPlaybook) {
  const child = esc(p.childNickname);
  const wins = p.wins.length
    ? p.wins
        .map(
          (w) => `<section class="card">
  <span class="tag">${esc(w.goalTitle)}</span>
  <h2>${esc(w.title)}</h2>
  <div><h3>What to do</h3><p>${esc(w.action)}</p></div>
  <div class="say"><h3>Say this</h3><p>${esc(w.script)}</p></div>
  <div><h3>What to expect</h3><p>${esc(w.whatToExpect)}</p></div>
</section>`,
        )
        .join("\n")
    : `<section class="card"><p>Nothing has been shared yet. Check back soon.</p></section>`;

  const body = `<div class="hero">
  <h1>Hi ${esc(p.caregiverName)}!</h1>
  <p>Here's what we're trying with <strong>${child}</strong> right now, shared by ${esc(p.from)}. When everyone responds the same way, ${child} learns faster.</p>
</div>
${wins}
<section class="log" aria-labelledby="log-title">
  <h2 id="log-title">How did it go with ${child}?</h2>
  <p class="muted">Your note goes straight to ${esc(p.from)}'s journal in ParentPal. One line is plenty.</p>
${
  p.wins.length > 1
    ? `<label for="win" class="muted">Which idea? (optional)</label>
  <select id="win"><option value="">Not sure / something else</option>${p.wins.map((w) => `<option value="${esc(w.id)}">${esc(w.title)}</option>`).join("")}</select>`
    : p.wins.length === 1
      ? `<input type="hidden" id="win" value="${esc(p.wins[0].id)}">`
      : ""
}
  <div class="row" role="group" aria-label="How did it go">
    <button type="button" data-quick="worked" aria-pressed="false">It worked</button>
    <button type="button" data-quick="tough" aria-pressed="false">It was tough</button>
  </div>
  <label for="note" class="muted">What happened? (optional)</label>
  <textarea id="note" maxlength="1000" placeholder="e.g. Cried at bedtime, I used the words, calm in 5 minutes"></textarea>
  <button type="button" class="primary" id="send">Send note</button>
  <div id="result" aria-live="polite"></div>
</section>
<footer>General guidance from public pediatric and health sources, not medical advice.<br>Shared privately with ParentPal. Please don't forward this link.</footer>
<script>
(function(){
  var win=document.getElementById('win'), quick=null, btns=document.querySelectorAll('[data-quick]'), send=document.getElementById('send'), out=document.getElementById('result');
  btns.forEach(function(b){b.addEventListener('click',function(){quick=b.getAttribute('aria-pressed')==='true'?null:b.dataset.quick;btns.forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.quick===quick))});});});
  function show(cls,html){out.innerHTML='<div class="notice '+cls+'">'+html+'</div>';}
  function text(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  send.addEventListener('click',function(){
    var note=document.getElementById('note').value.trim();
    if(!quick&&note.length<3){show('err','Tap how it went, or write a few words.');return;}
    send.disabled=true;
    fetch(location.pathname.replace(/\\/$/,'')+'/log',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({quick:quick||undefined,text:note||undefined,winId:(win&&win.value)||undefined})})
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
      .then(function(res){
        send.disabled=false;
        if(!res.ok){show('err',text(res.j.message||'Something went wrong. Try again.'));return;}
        document.getElementById('note').value='';if(win&&win.tagName==='SELECT')win.value='';quick=null;btns.forEach(function(x){x.setAttribute('aria-pressed','false')});
        var s=res.j.safety;
        if(s){show('safety','<strong>'+text(s.title)+'</strong><p>'+text(s.body)+'</p>'+s.actions.map(function(a){return '<a href="'+text(a.href)+'">'+text(a.label)+'</a>';}).join(''));return;}
        show('ok','Thank you! Your note was sent.');
      })
      .catch(function(){send.disabled=false;show('err','No connection. Try again in a moment.');});
  });
})();
</script>`;
  return shell(`${p.childNickname}'s playbook`, body);
}

function errorPage(status: number, message: string) {
  return shell("ParentPal", `<div class="hero"><h1>${status === 410 ? "Link turned off" : "Link not found"}</h1><p>${esc(message)}</p></div>`);
}

export const publicPlaybookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/p/:token", { schema: { params: Token } }, async (req, reply) => {
    try {
      const page = renderPlaybook(await openPublicPlaybook(req.params.token));
      return reply.headers(HEADERS).send(page);
    } catch (err) {
      if (err instanceof HttpError) return reply.status(err.statusCode).headers(HEADERS).send(errorPage(err.statusCode, err.message));
      throw err;
    }
  });

  app.post(
    "/p/:token/log",
    {
      config: llmLimit.caregiver,
      schema: {
        params: Token,
        body: z.object({ quick: z.enum(["worked", "tough"]).optional(), text: z.string().max(1000).optional(), winId: z.string().max(100).optional() }),
      },
    },
    async (req) => caregiverLog(req.params.token, req.body),
  );
};
