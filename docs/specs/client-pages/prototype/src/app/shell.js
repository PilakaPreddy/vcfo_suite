/* VCFO Suite prototype · one shared sidebar for every screen.
   Draws the navy sidebar (logo, Updates + Compliances groups, Library, team, account) over each board's
   own sidebar placeholder, and the same nav as a drawer. Loaded by proto.js.

   RESPONSIVE CONTRACT (v7) · what boards can rely on
   - <html data-vp-bp="phone|tablet|desktop">   phone <= 767 px · tablet 768-1279 px · desktop >= 1280 px
   - --vp-side-w on <html>: 0px | 72px | 248px  (the board's sidebar placeholder is `width: var(--vp-side-w, 248px); flex: none`)
   - mark the placeholder data-vp="side" (recommended; shell.js also finds a navy column of that width at the left edge)
   - desktop: full 248 px sidebar · tablet: 72 px icon rail (tooltips, fly-outs) · phone: no rail, a drawer
   - window.vcfoOpenSide() opens the drawer (any size) · window.vcfoCloseSide() closes it
   - a board's phone menu button carries data-vp-menu (any click on it opens the drawer)
   - no visible [data-vp-menu] on a phone: shell.js adds a 56 px top band with a 40 px menu button, sets
     <html data-vp-menu-fallback> and --vp-menu-offset: 56px, and pads <body> (and sticky [data-vp="top"]) by it
   - window 'vcfo:bp' event (detail {bp, sideW}) fires when the breakpoint changes
   - Before | After: desktop top bar (before Announcements) · tablet: inside the rail · phone: top of the drawer */
(function () {
  if (window.vcfoShell) return;
  function B(p) { if (window.__binUrl) return window.__binUrl(p); try { if (/^https?:$/.test(location.protocol)) return new URL(p, location.origin + '/').href; } catch (e) {} return p; }   // dev server: root-relative
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function go(k) { if (window.vcfoGo) window.vcfoGo(k); }
  function toast(m) { if (window.vcfoToast) window.vcfoToast(m); }
  function quiet(fn) { if (window.vcfoQuiet) window.vcfoQuiet(fn); else fn(); }
  function ss(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem('vcfo.' + k)); sessionStorage.setItem('vcfo.' + k, JSON.stringify(v)); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('vcfo.' + k)); localStorage.setItem('vcfo.' + k, JSON.stringify(v)); } catch (e) { return null; } }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* ---------- breakpoints ---------- */
  var SW = { phone: 0, tablet: 72, desktop: 248 };
  var BP = null;
  function bpOf(w) { return w <= 767 ? 'phone' : w < 1280 ? 'tablet' : 'desktop'; }
  function applyBP() {
    var b = bpOf(innerWidth); if (b === BP) return false;
    BP = b; var de = document.documentElement;
    quiet(function () { de.setAttribute('data-vp-bp', b); de.style.setProperty('--vp-side-w', SW[b] + 'px'); de.style.setProperty('--vps-w', SW[b] + 'px'); });
    try { window.dispatchEvent(new CustomEvent('vcfo:bp', { detail: { bp: b, sideW: SW[b] } })); } catch (e) {}
    return true;
  }
  applyBP();

  /* ---------- brand images (sized by height, any aspect ratio fits) ---------- */
  function have(p) { var u = B(p); return !window.__binUrl || /^(blob|data):/.test(u); }   // bundle: a missing file is not a blob
  var LOGO = 'brand/vcfo-logo-on-black.png';
  function markSrc() { return B(have('brand/vcfo-mark.png') ? 'brand/vcfo-mark.png' : LOGO); }
  function markImg(cls, alt) { return '<img class="' + cls + '" src="' + markSrc() + '" alt="' + (alt || '') + '" onerror="this.onerror=null;this.src=\'' + B(LOGO) + '\'">'; }

  /* ---------- icons (same strokes as the boards) ---------- */
  function svg(d, s) { return '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d.split('|').map(function (p) { return '<path d="' + p + '"/>'; }).join('') + '</svg>'; }
  var I = {
    home: 'M4.5 4.5h6v7h-6Z M13.5 4.5h6v4h-6Z M13.5 12.5h6v7h-6Z M4.5 15.5h6v4h-6Z',
    updates: 'M4 10h3l8-4.5v13L7 14H4Z M7 14l1.5 5.5H11L10 14 M18 9.5a3.5 3.5 0 0 1 0 5',
    inc: 'M3.5 20.5h17 M5.5 20.5V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15.5 M14.5 9.5h3a1 1 0 0 1 1 1v10 M8.5 7.8h3 M8.5 11.3h3 M8.5 14.8h3',
    comp: 'M6 5.5h12A1.5 1.5 0 0 1 19.5 7v11.5A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 6 5.5Z M4.5 10h15 M8.5 3.5v4 M15.5 3.5v4 M8 13.5h2 M8 16.5h2 M12.5 13.5h3.5',
    docs: 'M3.5 18V6A1.5 1.5 0 0 1 5 4.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z',
    lib: 'M5.5 19V5A1.5 1.5 0 0 1 7 3.5h11.5v14H7A1.5 1.5 0 0 0 5.5 19a1.5 1.5 0 0 0 1.5 1.5h11.5 M9 7.5h6',
    team: 'M9 12.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7Z M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5 M15.5 5.7a3.3 3.3 0 0 1 0 6.4 M17.5 15.3c1.9.6 3.1 2.1 3.5 4.7',
    audit: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9 M4.5 4.5V9H9 M12 8v4.2l2.8 1.8',
    chev: 'M9 6l6 6-6 6',
    up: 'M6 15l6-6 6 6',
    wa: 'M12 4a8 8 0 0 0-6.9 12L4 20l4.1-1.1A8 8 0 1 0 12 4Z M9.2 8.8c.2-.4.6-.4.9-.2l.8 1.4c.1.3 0 .6-.2.8l-.4.4c.4.9 1.2 1.7 2.1 2.1l.4-.4c.2-.2.5-.3.8-.2l1.4.8c.3.2.3.6.1.9-.5.8-1.4 1.1-2.3.7a7 7 0 0 1-3.7-3.7c-.4-.9-.1-1.8.1-2.6Z',
    call: 'M7 4h2.2l1.3 3.6-1.8 1.2a10 10 0 0 0 6.5 6.5l1.2-1.8L20 14.8V17a2 2 0 0 1-2 2A14 14 0 0 1 5 6a2 2 0 0 1 2-2Z',
    mail: 'M5 5.5h14A1.5 1.5 0 0 1 20.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7A1.5 1.5 0 0 1 5 5.5Z M4.5 7.5l7.5 5.5 7.5-5.5',
    teams: 'M3.5 7h10v10h-10Z M6.5 10h4 M8.5 10v5 M16.5 9.5a2 2 0 1 0 0-4a2 2 0 1 0 0 4Z M15.5 11h5v4.5a2.5 2.5 0 0 1-5 0',
    person: 'M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5',
    head: 'M4.5 14v-2a7.5 7.5 0 0 1 15 0v2 M4.5 14h2.5v5H6a1.5 1.5 0 0 1-1.5-1.5Z M19.5 14H17v5h1a1.5 1.5 0 0 0 1.5-1.5Z',
    gear: 'M12 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6Z M19.4 13.5l1.1.9-1.6 2.8-1.4-.5a7 7 0 0 1-1.6.9l-.2 1.5h-3.2l-.2-1.5a7 7 0 0 1-1.6-.9l-1.4.5-1.6-2.8 1.1-.9a7 7 0 0 1 0-1.9l-1.1-.9 1.6-2.8 1.4.5a7 7 0 0 1 1.6-.9l.2-1.5h3.2l.2 1.5a7 7 0 0 1 1.6.9l1.4-.5 1.6 2.8-1.1.9a7 7 0 0 1 0 1.9Z',
    out: 'M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4 M10 16l-4-4 4-4 M6 12h10',
    help: 'M12 20.5a8.5 8.5 0 1 0 0-17a8.5 8.5 0 1 0 0 17Z M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6 M12 17h.01',
    x: 'M6 6l12 12 M18 6L6 18'
  };

  /* ---------- Lucide line icons (lucide-static, ISC): stroke 2, round caps and joins ---------- */
  var LU = {
    "layout-dashboard": "<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>",
    "key-round": "<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\"/><path d=\"M16.5 7.5h.01\"/>",
    "megaphone": "<path d=\"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\"/><path d=\"M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14\"/><path d=\"M8 6v8\"/>",
    "building-2": "<path d=\"M10 12h4\"/><path d=\"M10 8h4\"/><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"/><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"/>",
    "calendar-check": "<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"m9 15 2 2 4-4\"/>",
    "calendar": "<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/>",
    "file-check": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"m9 15 2 2 4-4\"/>",
    "folder-open": "<path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\"/>",
    "library": "<path d=\"m16 6 4 14\"/><path d=\"M12 6v14\"/><path d=\"M8 8v12\"/><path d=\"M4 4v16\"/>",
    "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>",
    "history": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M12 7v5l4 2\"/>",
    "settings": "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    "user-round": "<circle cx=\"12\" cy=\"8\" r=\"5\"/><path d=\"M20 21a8 8 0 0 0-16 0\"/>"
  };
  function lu(k, s) { return '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + LU[k] + '</svg>'; }
  I.menu = 'M4 7h16 M4 12h16 M4 17h16';

  /* ---------- the one navigation model ---------- */
  var NAV = [
    { k: 'home', t: 'Home', i: 'layout-dashboard' },
    { g: 'updates', t: 'Updates', i: 'megaphone', badge: '3', hot: true, kids: [{ k: 'announcements', t: 'Announcements' }, { k: 'notifications', t: 'Notifications', badge: '3', hot: true }] },
    { g: 'incorporation', t: 'Incorporation', i: 'building-2', badge: 'inc', kids: [{ k: 'incorporation', t: 'Overview', badge: 'inc' }, { k: 'registrations', t: 'Registrations' }] },
    { g: 'compliances', t: 'Compliances', i: 'calendar-check', kids: [{ k: 'compliances', t: 'Calendar' }, { k: 'filings', t: 'Filings' }] },
    { k: 'documents', t: 'Documents', i: 'folder-open', badge: '6' },
    { k: 'knowledge-bank', t: 'Library', i: 'library' },
    { k: 'credentials', t: 'Credentials', i: 'key-round' },
    { k: 'team', t: 'Team', i: 'users' },
    { k: 'audit', t: 'Audit', i: 'history' }
  ];
  var ALIAS = { 'inc-phase-a': 'incorporation', 'inc-phase-3': 'incorporation', 'inc-phase-4': 'registrations', 'credentials': 'credentials', 'home-after': 'home', 'home-chat': 'home', 'ids-password': 'home', 'inc-phase': 'incorporation', 'inc-step7': 'incorporation', 'inc-step10': 'incorporation', 'board-resolution': 'incorporation', 'doc-viewer': 'documents', 'kb-reader': 'knowledge-bank' };
  function active() { var h = window.vcfoHere ? window.vcfoHere() : null; var sn = /^inc-step-?(\d+)/.exec(h || ''); if (sn) return +sn[1] >= 26 ? 'registrations' : 'incorporation'; return ALIAS[h] || h; }
  var TEAM = [
    { n: 'Priya Raman', r: 'Project Manager', ini: 'PR', c: ['wa', 'call', 'mail', 'teams'] },
    { n: 'Arjun Mehta', r: 'Project Lead', ini: 'AM', c: ['wa', 'call', 'mail', 'teams'] },
    { n: 'Customer support', r: 'SBC help desk', ini: 'CS', sup: true, c: ['wa', 'mail', 'teams', 'call'] }
  ];
  var VERB = { wa: 'WhatsApp', call: 'Call', mail: 'Email', teams: 'Teams' };
  var ME = { n: 'Rohan Kumar', r: 'Northwind · Client', ini: 'RK' };

  /* ---------- styles ---------- */
  var css = document.createElement('style'); css.id = 'vp-shell-css';
  css.textContent = [
    '.vps{position:fixed;top:0;z-index:45;height:100vh;display:flex;flex-direction:column;background:#0f2a4a;color:#fff;font:500 13px/1.4 Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;box-sizing:border-box}',
    '@supports (height:100dvh){#vp-side,#vp-drawer{height:100dvh}}',
    '.vps::-webkit-scrollbar{display:none}',
    '.vps div,.vps span,.vps a,.vps button,.vps b,.vps small,.vps nav,.vps img,.vps svg{margin:0;padding:0;border:0;background:none;box-shadow:none;position:static;float:none;min-width:0;max-width:none;letter-spacing:normal;text-transform:none;text-decoration:none;font-style:normal;box-sizing:border-box;opacity:1;filter:none}',
    '.vps svg{flex:0 0 auto;display:block}',
    '.vps a,.vps button{font:inherit;color:inherit;text-decoration:none}',
    '.vps button{border:0;background:none;cursor:pointer;padding:0}',
    '.vps :focus-visible{outline:2px solid #8fb4ff;outline-offset:2px;border-radius:8px}',
    '#vp-side{left:0;width:var(--vp-side-w,248px)}',
    '.vps .vps-logo{flex:0 0 auto;height:64px;display:flex;align-items:center;padding:0 18px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.vps .vps-logo img{display:block;height:34px;width:auto;max-width:100%;object-fit:contain;object-position:left center}',
    '.vps .vps-nav{position:relative;display:flex;flex-direction:column;gap:2px;padding:12px 8px}',
    '.vps .vps-pill{position:absolute;left:8px;right:8px;top:0;height:36px;border-radius:8px;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(110,150,255,.42),inset 0 1px 0 rgba(255,255,255,.12);pointer-events:none;will-change:transform;transition:transform .42s cubic-bezier(.22,1.2,.36,1),height .3s cubic-bezier(.22,1,.36,1),opacity .2s}',
    '.vps .vps-rail{position:absolute;left:8px;top:0;width:3px;height:20px;border-radius:99px;background:#6e96ff;pointer-events:none;will-change:transform;transition:transform .42s cubic-bezier(.22,1.2,.36,1)}',
    '.vps .vps-i{position:relative;z-index:1;display:flex;align-items:center;gap:11px;width:100%;height:36px;padding:0 10px;border-radius:8px;font-size:13.5px;font-weight:500;color:#c3cddc;text-align:left;transition:background .15s,color .15s}',
    '.vps .vps-i:hover{background:rgba(255,255,255,.06);color:#fff}',
    '.vps .vps-i .vps-ic{display:flex;color:#9aa8bd;transition:color .15s}',
    '.vps .vps-i:hover .vps-ic{color:#c9d6ea}',
    '.vps .vps-i .vps-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.vps .vps-i[aria-current=page],.vps .vps-i[data-cur]{color:#fff;font-weight:650}',
    '.vps .vps-i[aria-current=page] .vps-ic,.vps .vps-i[data-cur] .vps-ic{color:#a9c3ff}',
    '.vps .vps-b{flex:0 0 auto;min-width:20px;height:20px;padding:0 6px;border-radius:6px;display:grid;place-items:center;font:700 11px/1 Manrope,sans-serif;background:rgba(255,255,255,.1);color:#fff;transition:opacity .2s,transform .2s}',
    '.vps .vps-b.hot{background:#d93a3a}',
    '.vps .vps-cv{display:flex;color:#8c9ab0;transition:transform .28s cubic-bezier(.22,1,.36,1)}',
    '.vps .vps-g[aria-expanded=true] .vps-cv{transform:rotate(90deg)}',
    '.vps .vps-g[aria-expanded=true] .vps-b{opacity:0;transform:scale(.6)}',
    '.vps .vps-sub{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s cubic-bezier(.22,1,.36,1)}',
    '.vps .vps-sub.open{grid-template-rows:1fr}',
    '.vps .vps-sub>div{overflow:hidden;position:relative}',
    '.vps .vps-sub:not(.open)>div{visibility:hidden}',
    '.vps .vps-sub>div:before{content:"";position:absolute;left:18px;top:4px;bottom:4px;width:1px;background:rgba(255,255,255,.14)}',
    '.vps .vps-sub .vps-i{height:32px;padding-left:37px;font-size:13px;margin-top:2px}',
    '.vps .vps-sub .vps-i:after{content:"";position:absolute;left:16px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:#5b6e8a;transition:background .15s,box-shadow .15s}',
    '.vps .vps-sub .vps-i[aria-current=page]:after{background:#8fb0ff;box-shadow:0 0 0 3px rgba(110,150,255,.22)}',
    '.vps .vps-team{margin-top:auto;padding:10px 8px 8px;border-top:1px solid rgba(255,255,255,.1)}',
    '.vps .vps-lbl{font:800 11px Manrope,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#d8b25a;margin:0 8px 6px}',
    '.vps .vps-p{position:relative;display:flex;align-items:center;gap:9px;height:38px;padding:0 8px;border-radius:8px;transition:background .15s}',
    '.vps .vps-p:hover,.vps .vps-p:focus-within{background:rgba(255,255,255,.06)}',
    '.vps .vps-av{flex:0 0 auto;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);box-shadow:0 0 0 1.5px rgba(255,255,255,.22);color:#dbe3ef;font:700 11px Manrope,sans-serif}',
    '.vps .vps-nm{flex:1;min-width:0;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;line-height:1.3;color:#fff}',
    '.vps .vps-nm b{font-weight:700;color:#fff}',
    '.vps .vps-nm small{display:inline;font-size:11.5px;color:#9eadc3}',
    '.vps .vps-c{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;gap:3px;padding-left:14px;background:linear-gradient(90deg,rgba(22,50,80,0),#163250 14px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .15s,visibility 0s}',
    '.vps .vps-p:hover .vps-c,.vps .vps-p:focus-within .vps-c{opacity:1;visibility:visible;pointer-events:auto}',
    '.vps .vps-c button{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;background:rgba(255,255,255,.12);color:#fff;transition:background .15s,transform .15s}',
    '.vps .vps-c button:hover{background:rgba(255,255,255,.22)}',
    '.vps .vps-c button:active{transform:scale(.94)}',
    '.vps .vps-c button.wa{background:#1f8f5a}.vps .vps-c button.wa:hover{background:#25a468}',
    '.vps .vps-me{position:relative;padding:8px 10px 12px;border-top:1px solid rgba(255,255,255,.1)}',
    '.vps .vps-meb{width:100%;display:flex;align-items:center;gap:10px;padding:6px;border-radius:8px;text-align:left;transition:background .15s}',
    '.vps .vps-meb:hover,.vps .vps-meb[aria-current=page]{background:rgba(255,255,255,.08)}',
    '.vps .vps-a{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#2e5cff;font:800 11px Manrope,sans-serif;color:#fff;flex:0 0 auto}',
    '.vps .vps-meb .vps-nm{flex:1;min-width:0}.vps .vps-meb .vps-nm b{display:block;font-size:13px;font-weight:650}.vps .vps-meb .vps-nm small{display:block;font-size:11px;color:#a9b6c9}',
    '.vps .vps-meb .vps-cv{transform:rotate(-90deg)}.vps .vps-meb[aria-expanded=true] .vps-cv{transform:rotate(90deg)}',
    '.vps .vps-menu{position:absolute;left:10px;right:10px;bottom:calc(100% - 4px);padding:6px;border-radius:10px;background:#fff;color:#0f1b2d;box-shadow:0 18px 40px -12px rgba(8,20,40,.55);transform-origin:50% 100%;transform:translateY(6px) scale(.97);opacity:0;visibility:hidden;transition:transform .2s cubic-bezier(.22,1,.36,1),opacity .15s}',
    '.vps .vps-menu.on{transform:none;opacity:1;visibility:visible}',
    '.vps .vps-menu button{width:100%;display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:7px;color:#0f2a4a!important;font-weight:600}',
    '.vps .vps-menu button:hover{background:#f1f4f8}',
    '.vps .vps-menu button svg{color:#5b6b82}',
    '.vps .vps-sr,.vps.vps-icons .vps-i .vps-t{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}',
    /* tablet: the 72 px icon rail */
    '.vps.vps-icons .vps-logo{justify-content:center;height:58px;padding:0}',
    '.vps.vps-icons .vps-logo img{height:36px;max-width:48px;object-position:center}',
    '.vps.vps-icons .vps-nav{padding:8px 12px}',
    '.vps.vps-icons .vps-i{justify-content:center;gap:0;height:40px;padding:0}',
    '.vps.vps-icons .vps-pill{left:12px;right:12px}',
    '.vps.vps-icons .vps-rail{left:12px}',
    '.vps.vps-icons .vps-i .vps-b{position:absolute;top:3px;left:calc(50% + 3px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;font-size:11px;box-shadow:0 0 0 2px #0f2a4a}',
    '.vps.vps-icons .vps-g:after{content:"";position:absolute;right:5px;bottom:5px;border-style:solid;border-width:0 0 5px 5px;border-color:transparent transparent #7f90a9 transparent}',
    '.vps.vps-icons .vps-i[aria-expanded=true]{background:rgba(255,255,255,.1);color:#fff}',
    '.vps .vps-bar{flex:0 0 auto;padding:8px;border-top:1px solid rgba(255,255,255,.1)}',
    '.vps.vps-icons .vps-team{display:flex;flex-direction:column;gap:2px;padding:8px 12px 4px}',
    '.vps.vps-icons .vps-lbl{margin:0 0 4px;text-align:center;letter-spacing:.08em}',
    '.vps.vps-icons .vps-pa{height:40px}',
    '.vps.vps-icons .vps-pa .vps-av{width:30px;height:30px}',
    '.vps.vps-icons .vps-me{padding:6px 12px 8px}',
    '.vps.vps-icons .vps-meb{justify-content:center;height:44px;padding:0}',
    '.vps.vps-icons .vps-meb .vps-a{width:32px;height:32px}',
    '.vps .vps-fly{position:fixed;z-index:60;left:80px;top:8px;display:flex;flex-direction:column;gap:2px;min-width:212px;max-width:calc(100vw - 96px);max-height:calc(100vh - 16px);overflow:auto;padding:6px;border-radius:12px;background:#143457;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 22px 44px -14px rgba(4,12,28,.75);animation:vpsfly .18s cubic-bezier(.22,1,.36,1)}',
    '.vps .vps-fly[hidden]{display:none}',
    '@keyframes vpsfly{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}',
    '.vps .vps-fh{padding:8px 10px 6px;font:800 11px/1.3 Manrope,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#d8b25a}',
    '.vps .vps-fh.who{font:700 13.5px/1.3 Manrope,sans-serif;letter-spacing:normal;text-transform:none;color:#fff}',
    '.vps .vps-fh.who small{display:block;margin-top:1px;font:500 12px/1.35 Manrope,sans-serif;color:#a9b6c9}',
    '.vps .vps-fi{position:relative;display:flex;align-items:center;gap:10px;width:100%;height:40px;padding:0 10px;border-radius:8px;font-size:13.5px;font-weight:600;color:#d5deea;text-align:left;white-space:nowrap;transition:background .15s,color .15s}',
    '.vps .vps-fi:hover{background:rgba(255,255,255,.08);color:#fff}',
    '.vps .vps-fi[aria-current=page]{background:rgba(255,255,255,.13);color:#fff;box-shadow:inset 3px 0 0 #6e96ff}',
    '.vps .vps-fi .vps-ft{flex:1;min-width:0}',
    '.vps .vps-fi svg{color:#9fb0c8}.vps .vps-fi.wa svg{color:#4fd08f}',
    '.vps .vps-tip{position:fixed;z-index:61;left:80px;top:0;max-width:calc(100vw - 96px);overflow:hidden;text-overflow:ellipsis;padding:6px 10px;border-radius:7px;background:#08192f;color:#fff;font:700 12px/1.3 Manrope,system-ui,sans-serif;white-space:nowrap;pointer-events:none;opacity:0;transform:translateX(-4px);transition:opacity .12s,transform .12s;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 10px 24px -10px rgba(0,0,0,.6)}',
    '.vps .vps-tip.on{opacity:1;transform:none}',
    /* Before | After: horizontal in the top bar and the drawer, vertical in the rail */
    '.vp-ba,.vps .vp-ba{position:relative;display:grid;grid-template-columns:1fr 1fr;flex:none;width:168px;height:32px;margin:0;padding:3px;border:0;border-radius:9px;background:#e6eaf1;box-sizing:border-box}',
    '.vp-ba-th,.vps .vp-ba-th{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);margin:0;padding:0;border-radius:7px;background:#0f2a4a;box-shadow:0 2px 6px -2px rgba(15,42,74,.55);transition:transform .42s cubic-bezier(.22,1.2,.36,1);pointer-events:none}',
    '.vp-ba[data-on="1"] .vp-ba-th,.vps .vp-ba[data-on="1"] .vp-ba-th{transform:translateX(100%)}',
    '.vp-ba button,.vps .vp-ba button{position:relative;z-index:1;height:100%;margin:0;padding:0;border:0;border-radius:7px;background:none;box-shadow:none;font:700 12px/1 Manrope,system-ui,sans-serif;letter-spacing:normal;text-transform:none;color:#4a5a72;cursor:pointer;white-space:nowrap;transition:color .25s}',
    '.vp-ba button[aria-pressed="true"],.vps .vp-ba button[aria-pressed="true"]{color:#fff}',
    '.vp-ba button:focus-visible,.vps .vp-ba button:focus-visible{outline:2px solid #2e5cff;outline-offset:2px}',
    '.vps .vp-ba.vp-ba-v{grid-template-columns:1fr;grid-template-rows:1fr 1fr;width:56px;height:66px;margin:0 auto}',
    '@media (max-height:740px){.vps.vps-icons .vps-i,.vps.vps-icons .vps-pa{height:36px}.vps.vps-icons .vps-logo{height:52px}.vps.vps-icons .vps-lbl{display:none}}',
    '.vps .vp-ba.vp-ba-v .vp-ba-th{left:3px;right:3px;top:3px;bottom:auto;width:auto;height:calc(50% - 3px)}',
    '.vps .vp-ba.vp-ba-v[data-on="1"] .vp-ba-th{transform:translateY(100%)}',
    '.vps .vp-ba.vp-ba-v button{font-size:11.5px}',
    '.vp-ba-slot{display:inline-flex;align-items:center;vertical-align:middle;flex:none;margin:0 6px}',
    '.vps .vp-ba-drawer{padding:4px 12px 14px;margin:0;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.vps .vp-ba-drawer .vp-ba{width:100%;height:46px}',
    '.vps .vp-ba-drawer .vp-ba button{font-size:13px}',
    /* the drawer (phone; any size through vcfoOpenSide) */
    '#vp-drawer-scrim{position:fixed;inset:0;z-index:2147483100;background:rgba(8,20,40,.45);opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s}',
    '#vp-drawer-scrim.on{opacity:1;visibility:visible}',
    '#vp-drawer{z-index:2147483101;left:0;width:min(320px,88vw);transform:translateX(-102%);visibility:hidden;transition:transform .32s cubic-bezier(.22,1,.36,1),visibility 0s linear .32s;box-shadow:20px 0 50px -20px rgba(0,0,0,.5);will-change:transform;overscroll-behavior:contain}',
    '#vp-drawer:not(.on) *{visibility:hidden!important}',
    '#vp-drawer.on{transform:none;visibility:visible;transition:transform .32s cubic-bezier(.22,1,.36,1),visibility 0s}',
    '#vp-drawer .vps-hd{flex:0 0 auto;display:flex;align-items:center;gap:8px;height:60px;padding:0 10px 0 0;border-bottom:1px solid rgba(255,255,255,.08)}',
    '#vp-drawer .vps-hd .vps-logo{flex:1;min-width:0;height:100%;padding:0 0 0 16px;border:0}',
    '#vp-drawer .vps-hd .vps-logo img{height:30px}',
    '#vp-drawer .vps-x{flex:none;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.08)}',
    '#vp-drawer .vps-nav{padding:10px 8px}',
    '#vp-drawer .vps-i{height:44px;font-size:14px}',
    '#vp-drawer .vps-sub .vps-i{height:40px;font-size:13.5px}',
    '#vp-drawer .vps-team{padding:12px 8px 8px}',
    '#vp-drawer .vps-p{display:grid;grid-template-columns:32px minmax(0,1fr);align-items:center;gap:6px 10px;height:auto;padding:8px}',
    '#vp-drawer .vps-p .vps-av{width:32px;height:32px}',
    '#vp-drawer .vps-p .vps-nm{white-space:normal}',
    '#vp-drawer .vps-p .vps-nm b{display:block;font-size:13.5px}#vp-drawer .vps-p .vps-nm small{display:block;font-size:12px}',
    '#vp-drawer .vps-c{grid-column:2;position:static;transform:none;opacity:1;visibility:visible;pointer-events:auto;padding:0;background:none;gap:6px}',
    '#vp-drawer .vps-c button{width:40px;height:40px;border-radius:9px}',
    '#vp-drawer .vps-meb{min-height:48px}',
    '#vp-drawer .vps-menu button{height:44px}',
    /* phone fallback menu band (only when a board has no [data-vp-menu]) */
    '.vps.vps-mbar{top:0;left:0;right:0;width:auto;height:var(--vp-menu-offset,56px);z-index:44;flex-direction:row;align-items:center;gap:10px;padding:0 8px;overflow:visible;background:#fff;color:#0f2a4a;box-shadow:0 1px 0 #e3e8ef}',
    '.vps .vps-mb{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:#0f2a4a;color:#fff}',
    '.vps .vps-mbl{display:block;height:28px;width:auto;max-width:120px;object-fit:contain}',
    'html[data-vp-menu-fallback] body{padding-top:var(--vp-menu-offset,56px)!important}',
    'html[data-vp-menu-fallback] [data-vp="top"]{top:var(--vp-menu-offset,56px)!important}',
    'body:has(#vp-side) #vp-mini{left:calc(var(--vps-w,248px) + 16px)}',
    'body:has(#vp-side) [data-vp="side"]:not(.vps){visibility:hidden}',
    '.vp-mlogo{display:block;height:26px;width:auto;max-width:44px;object-fit:contain;margin:0 2px 0 0;flex:0 0 auto}',
    '@media (prefers-reduced-motion: reduce){.vps-pill,.vps-rail,.vps-sub,.vps-cv,#vp-drawer,.vps-menu,.vp-ba-th,.vp-ba button,.vps-tip{transition:none!important}.vps-fly{animation:none!important}}'
  ].join('\n');
  document.head.appendChild(css);

  /* favicon: the VCFO icon on every screen */
  if (!document.querySelector('link[rel="icon"]')) { var fi = document.createElement('link'); fi.rel = 'icon'; fi.type = 'image/png'; fi.href = B('brand/vcfo-icon.png'); document.head.appendChild(fi); }

  /* ---------- build ---------- */
  function incBadge() { return ls('after') === true ? '14/14' : '6/14'; }
  function badge(b, hot) { return b ? '<span class="vps-b' + (hot ? ' hot' : '') + '">' + b + '</span>' : ''; }
  function openGroups() { return ls('navOpen') || {}; }
  function logoA() { return '<a class="vps-logo" href="#" data-go="home" aria-label="VCFO Suite · Home"><img src="' + B(LOGO) + '" alt="VCFO Suite by SBC" height="34"></a>'; }
  function avatar(p) { return p.sup ? svg(I.head, 14) : p.ini; }
  function contactBtn(p, c, cls) { var who = p.sup ? 'support' : p.n; return '<button type="button" class="' + c + (cls ? ' ' + cls : '') + '" data-contact="' + VERB[c] + ' ' + who + '" aria-label="' + VERB[c] + ' ' + who + '">' + svg(I[c], cls ? 16 : 14) + (cls ? '<span class="vps-ft">' + VERB[c] + '</span>' : '') + '</button>'; }
  function meMenu() { return '<button type="button" role="menuitem" data-go="settings">' + lu('settings') + 'Settings</button><button type="button" role="menuitem" data-chat>' + svg(I.help) + 'Help · Ask VCFO</button><button type="button" role="menuitem" data-signout>' + svg(I.out) + 'Sign out</button>'; }

  /* full sidebar (desktop) and drawer */
  function build(drawerMode) {
    var act = active(), og = openGroups();
    var h = drawerMode ? '<div class="vps-hd">' + logoA() + '<button type="button" class="vps-x" data-close aria-label="Close menu">' + svg(I.x, 18) + '</button></div><div class="vp-ba-drawer">' + baHTML() + '</div>' : logoA();
    h += '<nav class="vps-nav" aria-label="Main"><span class="vps-pill" aria-hidden="true"></span><span class="vps-rail" aria-hidden="true"></span>';
    NAV.forEach(function (n) {
      if (n.kids) {
        var has = n.kids.some(function (c) { return c.k === act; });
        var open = og[n.g] === undefined ? has : og[n.g];
        h += '<button type="button" class="vps-i vps-g" data-group="' + n.g + '" aria-expanded="' + open + '"' + (has && !open ? ' data-holds="1"' : '') + '><span class="vps-ic">' + lu(n.i) + '</span><span class="vps-t">' + n.t + '</span>' + badge(n.badge === 'inc' ? incBadge() : n.badge, n.hot) + '<span class="vps-cv">' + svg(I.chev, 14) + '</span></button>';
        h += '<div class="vps-sub' + (open ? ' open' : '') + '" data-sub="' + n.g + '"><div' + (open ? '' : ' inert') + '>';
        n.kids.forEach(function (c) { h += '<a href="#" class="vps-i" data-go="' + c.k + '"' + (c.k === act ? ' aria-current="page"' : '') + (open ? '' : ' tabindex="-1"') + '><span class="vps-t">' + c.t + '</span>' + badge(c.badge === 'inc' ? incBadge() : c.badge, c.hot) + '</a>'; });
        h += '</div></div>';
      } else {
        h += '<a href="#" class="vps-i" data-go="' + n.k + '"' + (n.k === act ? ' aria-current="page"' : '') + '><span class="vps-ic">' + lu(n.i) + '</span><span class="vps-t">' + n.t + '</span>' + badge(n.badge === 'inc' ? incBadge() : n.badge) + '</a>';
      }
    });
    h += '</nav><div class="vps-team"><div class="vps-lbl">Your team</div>';
    TEAM.forEach(function (p) {
      h += '<div class="vps-p"' + (drawerMode ? '' : ' tabindex="0" role="group" aria-label="' + p.n + ', ' + p.r + ' · contact"') + '><span class="vps-av">' + avatar(p) + '</span><span class="vps-nm"><b>' + p.n + '</b> <small>' + (drawerMode ? '' : '· ') + p.r + '</small></span><span class="vps-c">';
      p.c.forEach(function (c) { h += contactBtn(p, c); });
      h += '</span></div>';
    });
    h += '</div><div class="vps-me"><div class="vps-menu" role="menu" inert>' + meMenu() + '</div>' +
      '<button type="button" class="vps-meb" aria-haspopup="menu" aria-expanded="false"' + (act === 'settings' ? ' aria-current="page"' : '') + '><span class="vps-a">' + ME.ini + '</span><span class="vps-nm"><b>' + ME.n + '</b><small>' + ME.r + '</small></span><span class="vps-cv">' + svg(I.chev, 14) + '</span></button></div>';
    return h;
  }

  /* tablet rail: icons only; each item has a tooltip (data-tip); groups, people and the account open a fly-out */
  function buildRail() {
    var act = active();
    var h = '<a class="vps-logo" href="#" data-go="home" aria-label="VCFO Suite · Home" data-tip="VCFO Suite · Home">' + markImg('', 'VCFO Suite') + '</a>';
    h += '<nav class="vps-nav" aria-label="Main"><span class="vps-pill" aria-hidden="true"></span><span class="vps-rail" aria-hidden="true"></span>';
    NAV.forEach(function (n) {
      if (n.kids) {
        var has = n.kids.some(function (c) { return c.k === act; });
        h += '<button type="button" class="vps-i vps-g" data-fly="g:' + n.g + '" aria-haspopup="true" aria-expanded="false"' + (has ? ' data-cur="1"' : '') + ' data-tip="' + n.t + (n.badge === 'inc' ? ' · ' + incBadge() + ' steps' : n.badge ? ' · ' + n.badge + ' new' : '') + '"><span class="vps-ic">' + lu(n.i, 20) + '</span><span class="vps-t">' + n.t + '</span>' + (n.badge === 'inc' ? '' : badge(n.badge, n.hot)) + '</button>';
      } else {
        h += '<a href="#" class="vps-i" data-go="' + n.k + '"' + (n.k === act ? ' aria-current="page"' : '') + ' data-tip="' + n.t + (n.badge === 'inc' ? ' · ' + incBadge() + ' steps' : n.badge ? ' · ' + n.badge : '') + '"><span class="vps-ic">' + lu(n.i, 20) + '</span><span class="vps-t">' + n.t + (n.badge === 'inc' ? ' · ' + incBadge() + ' steps' : '') + '</span>' + (n.badge && n.badge !== 'inc' ? badge(n.badge) : '') + '</a>';
      }
    });
    h += '</nav><div class="vps-bar" data-tip="Show the company before or after incorporation">' + baHTML(true) + '</div>';
    h += '<div class="vps-team"><div class="vps-lbl" aria-hidden="true">Team</div>';
    TEAM.forEach(function (p, i) {
      h += '<button type="button" class="vps-i vps-pa" data-fly="p:' + i + '" aria-haspopup="true" aria-expanded="false" aria-label="' + p.n + ', ' + p.r + ' · contact" data-tip="' + p.n + ' · ' + p.r + '"><span class="vps-av">' + avatar(p) + '</span></button>';
    });
    h += '</div><div class="vps-me"><button type="button" class="vps-meb" data-fly="me" aria-haspopup="menu" aria-expanded="false" aria-label="' + ME.n + ', ' + ME.r + ' · account menu" data-tip="' + ME.n + ' · ' + ME.r + '"' + (act === 'settings' ? ' aria-current="page"' : '') + '><span class="vps-a">' + ME.ini + '</span></button></div>';
    h += '<div class="vps-fly" role="menu" hidden></div><div class="vps-tip" aria-hidden="true"></div>';
    return h;
  }
  function flyHTML(key) {
    var act = active(), h = '', p;
    if (key.indexOf('g:') === 0) {
      var n = NAV.filter(function (x) { return x.g === key.slice(2); })[0];
      h = '<div class="vps-fh">' + n.t + '</div>';
      n.kids.forEach(function (c) { h += '<a href="#" class="vps-fi" role="menuitem" data-go="' + c.k + '"' + (c.k === act ? ' aria-current="page"' : '') + '><span class="vps-ft">' + c.t + '</span>' + badge(c.badge === 'inc' ? incBadge() : c.badge, c.hot) + '</a>'; });
    } else if (key.indexOf('p:') === 0) {
      p = TEAM[+key.slice(2)];
      h = '<div class="vps-fh who">' + p.n + '<small>' + p.r + '</small></div>';
      p.c.forEach(function (c) { h += contactBtn(p, c, 'vps-fi').replace('<button ', '<button role="menuitem" '); });
    } else {
      h = '<div class="vps-fh who">' + ME.n + '<small>' + ME.r + '</small></div>' + meMenu().replace(/<button type="button" role="menuitem"/g, '<button type="button" role="menuitem" class="vps-fi"').replace(/data-go="settings"/, 'data-go="settings"' + (act === 'settings' ? ' aria-current="page"' : ''));
    }
    return h;
  }

  /* active pill: slides from where it was on the last screen to the current item */
  function placePill(root, animate) {
    var nav = root.querySelector('.vps-nav'); if (!nav) return;
    var pill = nav.querySelector('.vps-pill'), rail = nav.querySelector('.vps-rail');
    var a = nav.querySelector('[aria-current=page]') || nav.querySelector('[data-cur]');
    if (a && a.closest('.vps-sub') && !a.closest('.vps-sub').classList.contains('open')) a = a.closest('.vps-sub').previousElementSibling;
    if (!a) { pill.style.opacity = '0'; rail.style.opacity = '0'; return; }
    var y = Math.round(a.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop), hgt = a.offsetHeight;
    if (!animate) { pill.style.transition = rail.style.transition = 'none'; }
    pill.style.opacity = rail.style.opacity = '1';
    pill.style.height = hgt + 'px';
    pill.style.transform = 'translateY(' + y + 'px)';
    rail.style.transform = 'translateY(' + (y + (hgt - 20) / 2) + 'px)';
    if (!animate) { pill.offsetWidth; pill.style.transition = rail.style.transition = ''; }
    if (root.id === 'vp-side') ss('pill-' + root.getAttribute('data-mode'), { y: y, h: hgt });
  }

  /* ---------- fly-outs (rail) ---------- */
  var flyBtn = null;
  function closeFly(keepFocus) {
    if (!flyBtn) return;
    var b = flyBtn, root = b.closest('.vps'), fly = root && root.querySelector('.vps-fly');
    flyBtn = null;
    quiet(function () { b.setAttribute('aria-expanded', 'false'); if (fly) { fly.hidden = true; fly.innerHTML = ''; } });
    if (keepFocus) b.focus({ preventScroll: true });
  }
  function openFly(root, btn, kb) {
    if (flyBtn === btn) { closeFly(kb); return; }
    closeFly(); hideTip(root);
    var fly = root.querySelector('.vps-fly'), key = btn.getAttribute('data-fly');
    fly.innerHTML = flyHTML(key); fly.hidden = false; flyBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    var r = btn.getBoundingClientRect(), sr = root.getBoundingClientRect(), fh = fly.offsetHeight;
    var top = key === 'me' ? r.bottom - fh : r.top - 6;
    fly.style.left = Math.round(sr.right + 8) + 'px';
    fly.style.top = Math.round(Math.max(8, Math.min(innerHeight - fh - 8, top))) + 'px';
    if (kb) { var f = fly.querySelector('a,button'); f && f.focus({ preventScroll: true }); }
  }

  /* ---------- rail tooltips ---------- */
  function hideTip(root) { var t = root && root.querySelector('.vps-tip'); if (t && t.classList.contains('on')) quiet(function () { t.classList.remove('on'); }); }
  function showTip(root, el) {
    var t = root.querySelector('.vps-tip'); if (!t || !el || el === flyBtn) return hideTip(root);
    quiet(function () {
      t.textContent = el.getAttribute('data-tip');
      var r = el.getBoundingClientRect(), sr = root.getBoundingClientRect();
      t.style.left = Math.round(sr.right + 8) + 'px';
      t.style.top = Math.round(Math.max(4, Math.min(innerHeight - t.offsetHeight - 4, r.top + r.height / 2 - t.offsetHeight / 2))) + 'px';
      t.classList.add('on');
    });
  }
  function wireTips(root) {
    root.addEventListener('mouseover', function (e) { var el = e.target.closest('[data-tip]'); if (el && !el.closest('.vps-fly')) showTip(root, el); else hideTip(root); });
    root.addEventListener('mouseleave', function () { hideTip(root); });
    root.addEventListener('focusin', function (e) { var el = e.target.closest('[data-tip]'); var fv = false; try { fv = e.target.matches(':focus-visible'); } catch (x) {} if (el && fv && !el.closest('.vps-fly')) showTip(root, el); });
    root.addEventListener('focusout', function () { hideTip(root); });
    root.addEventListener('scroll', function () { hideTip(root); closeFly(); }, { passive: true });
    root.addEventListener('pointerdown', function () { hideTip(root); });
  }

  function wire(root) {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-fly],[data-go],[data-group],[data-contact],.vps-meb,[data-close],[data-signout],[data-chat]');
      if (!t) { if (!e.target.closest('.vps-fly')) { closeMenu(root); closeFly(); } return; }
      e.preventDefault(); e.stopPropagation();
      if (!t.classList.contains('vps-meb')) closeMenu(root);
      if (t.hasAttribute('data-fly')) { openFly(root, t, e.detail === 0); return; }
      if (t.hasAttribute('data-group')) {
        var g = t.getAttribute('data-group'), sub = root.querySelector('[data-sub="' + g + '"]'), open = t.getAttribute('aria-expanded') !== 'true';
        t.setAttribute('aria-expanded', String(open)); sub.classList.toggle('open', open); sub.firstElementChild.toggleAttribute('inert', !open);
        [].forEach.call(sub.querySelectorAll('a'), function (x) { open ? x.removeAttribute('tabindex') : x.setAttribute('tabindex', '-1'); });
        var og = openGroups(); og[g] = open; ls('navOpen', og);
        var steps = 0; (function follow() { placePill(root, true); if (++steps < 20) requestAnimationFrame(follow); })();
        return;
      }
      if (t.classList.contains('vps-meb')) { var m = root.querySelector('.vps-menu'), on = !m.classList.contains('on'); m.classList.toggle('on', on); m.toggleAttribute('inert', !on); t.setAttribute('aria-expanded', String(on)); return; }
      if (t.hasAttribute('data-close')) { closeDrawer(); return; }
      if (t.hasAttribute('data-contact')) { closeFly(); toast('Opening ' + t.getAttribute('data-contact') + '…'); return; }
      if (t.hasAttribute('data-signout')) { closeMenu(root); closeFly(); toast('Signed out · this is a prototype, so you stay on the page'); return; }
      if (t.hasAttribute('data-chat')) { closeMenu(root); closeFly(); closeDrawer(); if (window.vcfoChat) window.vcfoChat(); return; }
      var k = t.getAttribute('data-go'); closeMenu(root); closeFly();
      if (t.getAttribute('aria-current') === 'page' && k !== 'home') { toast('You are already on ' + t.textContent.replace(/\s·\s.*$/, '').replace(/\d+(\/\d+)?$/, '').trim()); return; }
      closeDrawer(); go(k);
    });
  }
  function closeMenu(root) { var m = root.querySelector('.vps-menu'); if (m && m.classList.contains('on')) { m.classList.remove('on'); m.setAttribute('inert', ''); root.querySelector('.vps-meb').setAttribute('aria-expanded', 'false'); } }
  document.addEventListener('click', function (e) { [side, drawer].forEach(function (r) { if (r && !r.contains(e.target)) closeMenu(r); }); if (side && !side.contains(e.target)) closeFly(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (flyBtn) { closeFly(true); return; }
      [side, drawer].forEach(function (r) { r && closeMenu(r); }); closeDrawer();
    } else if (e.key === 'Tab' && drawer && drawer.classList.contains('on')) {   // focus trap
      var f = [].filter.call(drawer.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'), function (x) { return x.getAttribute('tabindex') !== '-1' && x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || !drawer.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !drawer.contains(a))) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- desktop + tablet: cover the board's sidebar placeholder, pinned to the left edge ---------- */
  var side = null, drawer = null, scrim = null, holder = null;
  var NAVY = /^rgba?\(15, 42, 74/;
  function findHolder() {
    var s = document.querySelector('[data-vp="side"]:not(.vps)'); if (s) return s;
    var c = [].filter.call(document.querySelectorAll('[style*="--vp-side-w"]'), function (e) { return /(^|[;\s])width\s*:\s*var\(--vp-side-w/.test(e.getAttribute('style')) && !e.closest('.vps'); })[0];
    if (c) return c;
    var w = SW[BP]; if (!w) return null;
    var all = document.body ? document.body.querySelectorAll('div,aside,nav,section') : [];
    for (var i = 0; i < all.length; i++) {
      var e = all[i], r = e.getBoundingClientRect();
      if (Math.abs(r.width - w) <= 2 && r.left <= 2 && r.height >= Math.min(400, innerHeight * .6) && !e.closest('.vps') && NAVY.test(getComputedStyle(e).backgroundColor)) return e;
    }
    return null;
  }
  function boardSide() {
    if (window.__vcfoSideBox) { var x = window.__vcfoSideBox(); if (!x) return null; return { el: x.el || document.querySelector('[data-vp="side"]:not(.vps)') }; }
    if (holder && !document.contains(holder)) holder = null;
    holder = holder || findHolder();
    return holder ? { el: holder } : null;
  }
  function unmountSide() { if (!side) return; closeFly(); var s = side; side = null; quiet(function () { s.remove(); }); }
  function mountSide() {
    if (BP === 'phone') { unmountSide(); return false; }
    var b = boardSide(); if (!b) return false;
    var mode = BP === 'tablet' ? 'rail' : 'full';
    quiet(function () {
      if (side && side.getAttribute('data-mode') !== mode) { closeFly(); side.remove(); side = null; }
      if (!side) {
        side = document.createElement('aside'); side.id = 'vp-side'; side.className = 'vps' + (mode === 'rail' ? ' vps-icons' : ''); side.setAttribute('data-mode', mode); side.setAttribute('aria-label', 'Sidebar');
        side.innerHTML = mode === 'rail' ? buildRail() : build(false); document.body.appendChild(side); wire(side); if (mode === 'rail') wireTips(side);
        var prev = ss('pill-' + mode); var pill = side.querySelector('.vps-pill'), rail = side.querySelector('.vps-rail');
        if (prev && !reduce) { pill.style.transition = rail.style.transition = 'none'; pill.style.height = prev.h + 'px'; pill.style.transform = 'translateY(' + prev.y + 'px)'; rail.style.transform = 'translateY(' + (prev.y + (prev.h - 20) / 2) + 'px)'; pill.offsetWidth; pill.style.transition = rail.style.transition = ''; requestAnimationFrame(function () { requestAnimationFrame(function () { side && placePill(side, true); }); }); }
        else placePill(side, false);
        var img = side.querySelector('.vps-logo img'); if (img && !img.complete) img.addEventListener('load', function () { side && placePill(side, false); });
      }
      if (b.el && b.el.style.visibility !== 'hidden') b.el.style.visibility = 'hidden';
    });
    return true;
  }

  /* ---------- the drawer: phone menu, opened by any [data-vp-menu] (or a legacy "Open menu") button ---------- */
  function ensureDrawer() {
    if (drawer) return;
    quiet(function () {
      scrim = document.createElement('div'); scrim.id = 'vp-drawer-scrim'; scrim.addEventListener('click', closeDrawer);
      drawer = document.createElement('aside'); drawer.id = 'vp-drawer'; drawer.className = 'vps'; drawer.setAttribute('aria-label', 'Menu'); drawer.setAttribute('inert', ''); drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-hidden', 'true');
      drawer.innerHTML = build(true); document.body.appendChild(scrim); document.body.appendChild(drawer); wire(drawer);
    });
  }
  var lastFocus = null;
  function openDrawer() {
    ensureDrawer(); closeFly(); if (drawer.classList.contains('on')) return;
    lastFocus = document.activeElement;
    drawer.removeAttribute('inert'); scrim.classList.add('on'); drawer.classList.add('on'); drawer.setAttribute('aria-hidden', 'false');
    document.documentElement.setAttribute('data-vp-drawer', 'open');   // outside quiet(): the board sees that the click did something
    requestAnimationFrame(function () { placePill(drawer, false); var f = drawer.querySelector('[data-close]'); f && f.focus({ preventScroll: true }); });
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('on')) return;
    [drawer, side].forEach(function (r) { r && closeMenu(r); }); drawer.classList.remove('on'); scrim.classList.remove('on'); drawer.setAttribute('aria-hidden', 'true'); drawer.setAttribute('inert', '');
    document.documentElement.removeAttribute('data-vp-drawer');
    lastFocus && lastFocus.focus && document.contains(lastFocus) && lastFocus.focus({ preventScroll: true });
  }
  window.vcfoOpenSide = openDrawer; window.vcfoCloseSide = closeDrawer;
  var MENU_SEL = '[data-vp-menu],[aria-label="Open menu"],[aria-label="Menu"]';
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest(MENU_SEL);
    if (!b || b.closest('.vps')) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); openDrawer();
  }, true);

  /* phone: a board without a visible menu button gets a fallback band at the top */
  function boardMenu() { return [].filter.call(document.querySelectorAll(MENU_SEL), function (b) { if (b.closest('.vps')) return false; var r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden'; })[0] || null; }
  function ensureMenu() {
    var bar = document.getElementById('vp-mbar'), need = BP === 'phone' && !!document.body && !boardMenu();
    if (need && !bar) quiet(function () {
      bar = document.createElement('div'); bar.id = 'vp-mbar'; bar.className = 'vps vps-mbar';
      bar.innerHTML = '<button type="button" class="vps-mb" aria-label="Open menu" aria-haspopup="dialog">' + svg(I.menu, 20) + '</button>' + markImg('vps-mbl', 'VCFO Suite');
      bar.querySelector('.vps-mb').addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openDrawer(); });
      document.body.appendChild(bar);
      document.documentElement.style.setProperty('--vp-menu-offset', '56px'); document.documentElement.setAttribute('data-vp-menu-fallback', '');
    });
    else if (!need && bar) quiet(function () { bar.remove(); document.documentElement.removeAttribute('data-vp-menu-fallback'); document.documentElement.style.removeProperty('--vp-menu-offset'); });
  }

  /* the VCFO mark next to the board's hamburger in phone top bars */
  function mobileLogo() {
    if (BP !== 'phone' || document.querySelector('.vp-mlogo')) return;
    var b = boardMenu(); if (!b || b.getBoundingClientRect().top > 80 || (b.parentElement && b.parentElement.querySelector('img'))) return;
    quiet(function () { var t = document.createElement('div'); t.innerHTML = markImg('vp-mlogo', 'VCFO Suite'); b.insertAdjacentElement('afterend', t.firstChild); });
  }

  /* Before | After: one sliding pill. Desktop: in the top bar before Announcements. Tablet: in the rail. Phone: top of the drawer. State: vcfo.after */
  function baHTML(vertical) {
    var on = ls('after') === true;
    return '<div class="vp-ba' + (vertical ? ' vp-ba-v' : '') + '" role="group" aria-label="Before or after incorporation" data-on="' + (on ? 1 : 0) + '"><span class="vp-ba-th" aria-hidden="true"></span><button type="button" data-ba="0" aria-pressed="' + (!on) + '">Before</button><button type="button" data-ba="1" aria-pressed="' + on + '">After</button></div>';
  }
  function syncBA() {
    var on = ls('after') === true;
    [].forEach.call(document.querySelectorAll('.vps [data-group="incorporation"] .vps-b, .vps [data-go="incorporation"] .vps-b, .vps-fly [data-go="incorporation"] .vps-b'), function (b) { b.textContent = incBadge(); });
    [].forEach.call(document.querySelectorAll('.vps-icons [data-fly="g:incorporation"]'), function (a) { a.setAttribute('data-tip', 'Incorporation · ' + incBadge() + ' steps'); var t = a.querySelector('.vps-t'); if (t) t.textContent = 'Incorporation · ' + incBadge() + ' steps'; });
    [].forEach.call(document.querySelectorAll('.vp-ba'), function (g) {
      g.setAttribute('data-on', on ? '1' : '0');
      [].forEach.call(g.querySelectorAll('button'), function (b, i) { b.setAttribute('aria-pressed', String((i === 1) === on)); });
    });
  }
  window.vcfoSyncBA = syncBA;
  /* top-bar slot: flow boards get the pill before Announcements; absolute boards get it just left of Search, re-placed on change */
  function placeTopSlot(slot, ann) {
    var par = ann.parentElement, pr = par.getBoundingClientRect();
    var anchor = [].filter.call(par.querySelectorAll('[aria-label^="Search"]'), function (x) { return x.parentElement === par; })[0] || ann;
    var ar = anchor.getBoundingClientRect(), W = slot.offsetWidth || 168, H = slot.offsetHeight || 32;
    var s = 'position:absolute;margin:0;left:' + Math.round(ar.left - pr.left - (par.clientLeft || 0) - W - 10) + 'px;top:' + Math.round(ar.top + ar.height / 2 - pr.top - (par.clientTop || 0) - H / 2) + 'px';
    if (slot.getAttribute('style') !== s) slot.setAttribute('style', s);
  }
  function topWanted() { return BP === 'desktop' || (BP === 'tablet' && !side); }
  function mountBA() {
    var slot = document.getElementById('vp-ba-top');
    if (!topWanted()) { if (slot) quiet(function () { slot.remove(); }); return; }
    if (slot) { if (slot.getAttribute('data-abs') === '1') { var an = [].filter.call(document.querySelectorAll('[aria-label="Announcements"]'), function (x) { return x.closest('#vp-ba-top') === null && x.parentElement === slot.parentElement; })[0]; if (an) quiet(function () { placeTopSlot(slot, an); }); } return; }
    var ann = [].filter.call(document.querySelectorAll('[aria-label="Announcements"]'), function (x) { return !x.closest('.vps,#vp-drawer,#vp-chat,#vp-bar') && x.getBoundingClientRect().top < 90 && x.getClientRects().length && x.parentElement; })[0];
    if (!ann) return;
    var abs = /absolute|fixed/.test(getComputedStyle(ann).position);
    quiet(function () {
      var w = document.createElement('div'); w.id = 'vp-ba-top'; w.className = 'vp-ba-slot'; w.innerHTML = baHTML();
      if (abs) { w.setAttribute('data-abs', '1'); ann.parentElement.appendChild(w); placeTopSlot(w, ann); }
      else ann.parentElement.insertBefore(w, ann);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.vp-ba button[data-ba]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var v = b.getAttribute('data-ba') === '1';
    if (v === (ls('after') === true)) { toast('Already showing the company ' + (v ? 'after' : 'before') + ' incorporation'); return; }
    if (window.vcfoSetAfter) window.vcfoSetAfter(v); else { ls('after', v); syncBA(); }
  });
  setInterval(function () { if (side) mountSide(); mountBA(); ensureMenu(); }, 600);   // re-hides a board sidebar that re-rendered   // boards may re-render their top bar; this only inserts when the pill is missing

  var tries = 0;
  function tick() {
    if (BP !== 'phone') mountSide(); else { unmountSide(); var b = boardSide(); if (b && b.el && b.el.style.visibility !== 'hidden') quiet(function () { b.el.style.visibility = 'hidden'; }); mobileLogo(); if (tries >= 3) ensureMenu(); }
    if (++tries < 40) setTimeout(tick, 150);
  }
  var rq = 0;
  addEventListener('resize', function () {
    if (rq) return;
    rq = requestAnimationFrame(function () {
      rq = 0; closeFly(); if (side) hideTip(side);
      if (applyBP()) {
        if (BP !== 'phone') closeDrawer();
        holder = null; mountSide(); mountBA(); ensureMenu(); if (BP === 'phone') mobileLogo();
        if (tries >= 40) { tries = 30; tick(); }   // boards re-render after a breakpoint change: look again for a while
      } else if (side) placePill(side, false);
    });
  });
  window.vcfoShell = { openDrawer: openDrawer, closeDrawer: closeDrawer, mount: mountSide, bp: function () { return BP; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
})();
