# Turn registrations/src.html into a client-portal prototype board:
# src/app/s/inc/registrations.html (uses the portal's sidebar, top bar and routing).
import json, os, re
here = os.path.dirname(os.path.abspath(__file__))
proto = os.path.dirname(here)
src = open(os.path.join(here, 'src.html')).read()
phase = open(os.path.join(proto, 'src/app/s/inc/phase.html')).read().split('\n')

css = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
css = re.sub(r'@font-face\{[^}]*\}\n?', '', css)
css = re.sub(r'/\* top bar \*/.*?\.seg \.lbl\{[^}]*\}\n', '', css, flags=re.S)
css = css.replace('.wrap{max-width:1240px;margin:0 auto;padding:22px 24px 80px}', '.wrap{max-width:1240px;margin:0 auto}')
css = css.replace('.toast{', '.rtoast{').replace('.toast.on', '.rtoast.on').replace('.toast svg', '.rtoast svg')
css = css.replace('.flow{position:sticky;top:76px}', '.flow{position:sticky;top:72px}')
css = re.sub(r'@media \(max-width:640px\)\{\n \.wrap\{[^}]*\}\n \.top\{[^}]*\}\n \.top \.co[^}]*\}\n \.top img\{[^}]*\}\n', '@media (max-width:640px){\n', css)
shell_css = '\n'.join(phase[13:15] + [phase[22]] + phase[23:40] + [phase[40]]) + '\n' + '\n'.join(phase[434:437] + phase[442:452]) + '\n}\n'
extra = """
#crMid{display:contents}
.top .crumb{flex-wrap:nowrap;overflow:hidden;white-space:nowrap}
:root{--sw:var(--vp-side-w,248px);--mono:"IBM Plex Mono",ui-monospace,monospace}
.phead{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.phead .grow{flex:1;min-width:240px}
.seg{display:flex;background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:3px;box-shadow:var(--shadow)}
.seg button{border:0;background:none;color:var(--muted);font-weight:700;font-size:12px;padding:6px 12px;border-radius:999px;white-space:nowrap;cursor:pointer}
.seg button.on{background:var(--navy);color:#fff}
.seg .lbl{font-size:11px;color:var(--subtle);align-self:center;padding:0 6px;font-weight:700}
"""
hdr = '\n'.join(phase[510:522]).replace('<b id="crB">Phase</b>', '<span id="crMid"></span><b id="crB">Registrations</b>')

body = re.search(r'<script>(.*?)</script>', src, re.S).group(1)
body = body.replace("__REGDATA__", json.dumps(json.load(open(os.path.join(here, 'reg-steps.json')))))
body = body.replace('data-go=', 'data-nav=').replace("closest('[data-go]')", "closest('[data-nav]')").replace('go.dataset.go', 'go.dataset.nav')
body = body.replace("document.getElementById('toast')", "document.getElementById('rtoast')")
body = re.sub(r'<nav class="crumb" aria-label="Location">.*?</nav>\n?', '', body)
role = """<div class="seg" role="group" aria-label="Preview as"><span class="lbl">Preview as</span><button type="button" data-role="client" class="${state.role==='client'?'on':''}">Client</button><button type="button" data-role="lead" class="${state.role==='lead'?'on':''}">Lead</button></div>"""
body = body.replace("<h1>Registrations</h1>\n  <p class=\"sub\">", '<div class="phead"><div class="grow"><h1>Registrations</h1>\n  <p class="sub">', 1)
body = body.replace("what we need from you, and where it stands.</p>", "what we need from you, and where it stands.</p></div>" + role + "</div>", 1)
body = body.replace("<h1>${c.name}</h1><p class=\"sub\">${c.blurb}</p>", '<div class="phead"><div class="grow"><h1>${c.name}</h1><p class="sub">${c.blurb}</p></div>' + role + '</div>')
body = body.replace('<div class="dh"><span class="tile">${ic(c.key)}</span><div style="min-width:0">', '<button class="back" data-nav="#/g/${c.key}">${ic(\'left\')}${c.name}</button><div class="phead"><div class="dh grow"><span class="tile">${ic(c.key)}</span><div style="min-width:0">')
body = body.replace("<span class=\"tm\">${ic('clock')}${esc(r.timeline)}</span></div>\n  </div></div>", "<span class=\"tm\">${ic('clock')}${esc(r.timeline)}</span></div>\n  </div></div>" + role + "</div>")
body = body.replace("""const app=document.getElementById('app');
function render(){
  const h=location.hash||'#/';""", """const app=document.getElementById('app');
let cur=(function(){const h=location.hash||'';let m;if((m=h.match(/r=([\\w-]+)/)))return '#/r/'+m[1];if((m=h.match(/g=([\\w-]+)/)))return '#/g/'+m[1];return h.startsWith('#/')?h:'#/';})();
function nav(h){cur=h;render();window.scrollTo({top:0});}
function setCrumb(h){const mid=document.getElementById('crMid'),b=document.getElementById('crB');let m,parts=[];
  if((m=h.match(/^#\\/g\\/([\\w-]+)/))){parts=[['Registrations','#/']];b.textContent=(catByKey(m[1])||{}).name||'Registrations'}
  else if((m=h.match(/^#\\/r\\/([\\w-]+)/))){const r=REG.find(x=>x.slug===m[1]);const c=r&&catByKey(r.group);parts=[['Registrations','#/']].concat(c?[[c.name,'#/g/'+c.key]]:[]);b.textContent=r?r.title:'Registrations'}
  else b.textContent='Registrations';
  mid.innerHTML=parts.map(([t,u])=>'<a href="#" data-nav="'+u+'">'+t+'</a><span class="sl">/</span>').join('');}
function render(){
  const h=cur;setCrumb(h);""")
body = body.replace("window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0})});", "window.addEventListener('hashchange',()=>{const h=location.hash||'';let m;if((m=h.match(/r=([\\w-]+)/)))nav('#/r/'+m[1]);else if((m=h.match(/g=([\\w-]+)/)))nav('#/g/'+m[1]);else nav('#/');});")
body = body.replace("const go=e.target.closest('[data-nav]'); if(go){location.hash=go.dataset.nav;return}", "const go=e.target.closest('[data-nav]'); if(go){e.preventDefault();nav(go.dataset.nav);return}")
body = body.replace("document.querySelectorAll('[data-role]').forEach(b=>b.classList.toggle('on',b===rl));render();", "render();")
body = body.replace("document.title = (app.querySelector('h1')?.textContent||'Registrations')+' · VCFO Suite';", "")

out = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registrations</title>
<style>{css}
/* portal shell (same as phase.html) */
{shell_css}
{extra}
</style>
</head>
<body>
{hdr}
<main id="main"><div class="wrap" id="app"></div></main>
<div class="rtoast" id="rtoast" role="status" aria-live="polite"></div>
<script src="../../routes.js"></script>
<script src="../../proto.js"></script>
<script>{body}</script>
</body>
</html>
"""
open(os.path.join(proto, 'src/app/s/inc/registrations.html'), 'w').write(out)
print('ok', len(out))
