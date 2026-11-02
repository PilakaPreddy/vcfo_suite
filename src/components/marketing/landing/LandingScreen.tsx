"use client";
/* eslint-disable @next/next/no-img-element -- the landing shows fixed screenshots at their own sizes, as the old v6 landing did */
/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role -- the journey and 180-day list rows are click-through items (role="button", tabIndex 0, Enter and Space handled on the root), kept as list items so the lists still read as lists */
import "./landing.css";
import * as React from "react";
import Link from "next/link";
import { SIGN_IN_HREF, SWAP_WORDS } from "./content";
import { CompareSection, ComplianceRing, Ic, SwapWord } from "./LandingParts";
import { st, useLandingMotion } from "./landing-motion";
import { playIntro } from "./intro";
import { AskGuide } from "./AskGuide";
import { BookDemoDialog } from "../BookDemoDialog";

type Tab = "client" | "lead" | "manager" | "admin" | "super";
const TABS: Tab[] = ["client", "lead", "manager", "admin", "super"];
type Intro = "pre" | "logo" | "done";

/**
 * The public landing, ported from the prototype's design/spectrum landing (C-0111), which is the old v6 landing
 * (reference/vcfo-suite-v6.html) with the comparison section added: same sections, copy, look and motion.
 * The prototype's click-through items keep their `data-app` marks, but there are no public demo portals,
 * so a click or Enter on any of them opens the Book a demo dialog (G-30), and the hover pill on a
 * screenshot says "Book a demo". Every "Book a demo" button opens the same dialog, which posts to
 * `/api/public/demo-request`; /contact keeps the same form as a page. "Sign in" goes to the real login page.
 */
export function LandingScreen({ fontClass = "" }: { fontClass?: string }) {
  const root = React.useRef<HTMLDivElement>(null);
  const [menu, setMenu] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [demo, setDemo] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("client");
  const [intro, setIntro] = React.useState<Intro>("pre");
  const tabsRef = React.useRef<HTMLDivElement>(null);
  useLandingMotion(root, setScrolled);
  const openDemo = () => setDemo(true);
  const closeMenu = () => setMenu(false);
  const heroReady = intro !== "pre";

  // The logo reveal plays on every load, from the top of the page, and never under reduced motion.
  // A link from another page to a section ("/#journey" from /roles) lands on that section once the reveal ends.
  React.useEffect(() => {
    const el = root.current;
    const hero = el?.querySelector<HTMLElement>(".hero");
    const navImg = el?.querySelector<HTMLElement>(".nav-logo img");
    if (!el || !hero || !navImg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIntro("done");
      return;
    }
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
    scrollTo(0, 0);
    const finish = () => {
      setIntro("done");
      target?.scrollIntoView({ block: "start" });
    };
    return playIntro({ root: el, hero, navImg, release: () => setIntro("logo"), finish });
  }, []);

  const tabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length];
    setTab(t);
    tabsRef.current?.querySelector<HTMLButtonElement>(`#tab-${t}`)?.focus();
  };

  // Cards, chips and screenshots carry `data-app`: a click, or Enter on a focused item, opens Book a demo.
  const open = (target: EventTarget | null, e: React.SyntheticEvent) => {
    const el = (target as Element | null)?.closest?.("[data-app]");
    if (!el) return;
    e.preventDefault();
    openDemo();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target as Element;
    if (el.hasAttribute("data-app") && !/^(A|BUTTON)$/.test(el.tagName)) open(el, e);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- one delegated handler for the data-app items; each item is focusable with role="button" and the keys are handled by onKeyDown
    <div ref={root} className={`lp ${fontClass} ${intro === "pre" ? "pre-reveal reveal-logo" : intro === "logo" ? "reveal-logo" : ""}`} onClick={(e) => open(e.target, e)} onKeyDown={onKeyDown}>
      <div className="nav-sentinel" aria-hidden="true" />
      <header className={`nav${scrolled ? " scrolled" : ""}${menu ? " open" : ""}`} id="top">
        <div className="container nav-row">
          <a className="nav-logo" href="#top" aria-label="VCFO Suite by SBC, home">
            <img src="/landing/vcfo-logo-on-black.webp" alt="VCFO Suite by SBC" width="138" height="30" />
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#journey">How it works</a>
            <a href="#incorporate">Incorporation</a>
            <a href="#comply">Compliance</a>
            <a href="#portals">Portals</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-actions">
            <Link className="btn btn-ghost btn-sm" href={SIGN_IN_HREF}>Sign in</Link>
            <button className="btn btn-primary btn-sm" type="button" onClick={openDemo}>Book a demo</button>
            <button className="nav-toggle" type="button" aria-expanded={menu} aria-controls="nav-mobile" aria-label="Menu" onClick={() => setMenu((m) => !m)}>
              <span className="icon ic-menu"><Ic><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /></Ic></span>
              <span className="icon ic-close"><Ic><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Ic></span>
            </button>
          </div>
        </div>
        <div className="nav-mobile container" id="nav-mobile">
          <a onClick={closeMenu} href="#journey">How it works</a>
          <a onClick={closeMenu} href="#incorporate">Incorporation</a>
          <a onClick={closeMenu} href="#comply">Compliance</a>
          <a onClick={closeMenu} href="#portals">Portals</a>
          <a onClick={closeMenu} href="#faq">FAQ</a>
          <Link onClick={closeMenu} href={SIGN_IN_HREF}>Sign in</Link>
        </div>
      </header>

      <main>

      {/* Hero */}
      <section className="hero">
        <svg className="hero-beams" viewBox="0 0 1440 800" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="spotG" cx="30%" cy="0%" r="60%"><stop offset="0" className="spot-stop" stopOpacity=".18" /><stop offset="1" className="spot-stop" stopOpacity="0" /></radialGradient></defs><ellipse className="spot" cx="420" cy="0" rx="700" ry="420" /><path d="M-40 640 C 320 420, 760 700, 1480 260" /><path d="M-40 700 C 380 520, 820 760, 1480 380" /><path d="M-40 560 C 260 360, 700 620, 1480 160" /></svg>
        <div className="glow glow-brand glow-a"></div>
        <div className="glow glow-info glow-b"></div>
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="kicker enter d1">Incorporate. Register. Comply.</p>
            <h1 className="h1 enter d2">Your complete <span className="swap-line"><SwapWord words={SWAP_WORDS} start={heroReady} /></span> companion.</h1>
            <p className="lead enter d3">One record from the first form to every filing after. Your firm runs it. Your clients see it.</p>
            <div className="hero-ctas enter d4">
              <button className="btn btn-primary" type="button" onClick={openDemo}>Book a demo <span className="icon"><Ic><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Ic></span></button>
              <a className="btn btn-secondary" href="#journey">See how it works</a>
              <Link className="btn btn-secondary" href={SIGN_IN_HREF}>Try it live <span className="icon"><Ic><path d="M14 4.1 12 6" /><path d="m5.1 8-2.9-.8" /><path d="m6 12-1.9 2" /><path d="M7.2 2.2 8 5.1" /><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" /></Ic></span></Link>
            </div>
          </div>
          <div className="hero-shot enter d4">
            <div className="float float-a" data-app="filings" aria-label="Book a demo to see the filings screen" role="button" aria-haspopup="dialog" tabIndex={0}><span className="pill pill-positive">Filed</span><span className="t"><span>GSTR-3B, September</span><span className="mono">Acknowledgement attached</span></span></div>
            <div className="float float-b" data-app="inc-step-7" aria-label="Book a demo to see step 7, registered office address" role="button" aria-haspopup="dialog" tabIndex={0}><span className="pill pill-highlight">Needs you</span><span className="t"><span>Utility bill for the office</span><span className="mono">Due 9 Oct</span></span></div>
            <div className="frame" data-app="incorporation" aria-label="Book a demo to see the incorporation screen" role="button" aria-haspopup="dialog" tabIndex={0}>
              <img src="/landing/hero-incorporation.webp" alt="VCFO Suite client portal, incorporation view for Northwind Technologies India Pvt Ltd: 22 days to the Certificate of Incorporation, 6 of 25 steps done, the current steps with who holds each one, this week's tasks and the incorporation status." width="2400" height="1375" fetchPriority="high" />
            </div>
          </div>
        </div>
      </section>

      {/* Facts */}
      <section className="facts" aria-label="What the product tracks">
        <div className="container">
          <div className="facts-grid reveal">
            <div className="fact" data-stagger style={st("--i:0")} data-app="incorporation" role="button" aria-haspopup="dialog" tabIndex={0}><div className="num" data-count="25">0</div><p className="what">steps in every incorporation, from the name application to the post-incorporation filings. Registrations have their own page.</p></div>
            <div className="fact" data-stagger style={st("--i:1")} data-app="inc-phase-4" role="button" aria-haspopup="dialog" tabIndex={0}><div className="num" data-count="23">0</div><p className="what">registrations and RBI reportings after the certificate, from PAN and GST to FC-GPR.</p></div>
            <div className="fact" data-stagger style={st("--i:2")} data-app="compliances" role="button" aria-haspopup="dialog" tabIndex={0}><div className="num" data-count="6">0</div><p className="what">regulators on one statutory calendar: MCA, GST, Income tax, Payroll, FEMA and Labour.</p></div>
            <div className="fact" data-stagger style={st("--i:3")} data-app="audit" role="button" aria-haspopup="dialog" tabIndex={0}><div className="num" data-count="1">0</div><p className="what">record that the client, the parent entity and the firm all read, with the same status words.</p></div>
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="section" id="journey">
        <div className="glow glow-brand" style={st("width:800px;height:500px;right:-200px;top:0")}></div>
        <div className="container">
          <div className="section-head reveal">
            <h2 className="h2">What happens to a company, start to finish.</h2>
            <p className="body">Four stages happen once. The calendar repeats every year. The firm runs every step; the client sees every step, with who holds it and when it is due.</p>
          </div>
          <div className="journey reveal" data-reveal="journey">
            <svg viewBox="-30 0 1180 230" role="img" aria-label="The journey: name and papers, incorporation, certificate of incorporation, the first 180 days, registrations, then compliance every year.">
              <path className="line-glow" d="M 60 130 C 162 130 162 80 264 80 S 366 130 468 130 S 570 80 672 80 S 774 130 876 130 S 978 80 1080 80" />
              <path className="line" d="M 60 130 C 162 130 162 80 264 80 S 366 130 468 130 S 570 80 672 80 S 774 130 876 130 S 978 80 1080 80" />
              <g className="node" style={st("--i:0")} data-app="inc-phase-a" role="button" aria-haspopup="dialog" tabIndex={0}>
                <circle className="halo" cx="60" cy="130" r="30" /><circle className="c" cx="60" cy="130" r="18" /><text className="n" x="60" y="135">1</text>
                <text className="t" x="60" y="178">Name and papers</text><text className="s" x="60" y="196">5 steps, about 2 weeks</text><text className="w" x="60" y="214">CLIENT + FIRM</text>
              </g>
              <g className="node" style={st("--i:1")} data-app="inc-phase" role="button" aria-haspopup="dialog" tabIndex={0}>
                <circle className="halo" cx="264" cy="80" r="30" /><circle className="c" cx="264" cy="80" r="18" /><text className="n" x="264" y="85">2</text>
                <text className="t" x="264" y="30">Incorporation</text><text className="s" x="264" y="48">11 steps, SPICe+ with MCA</text><text className="w" x="264" y="14">FIRM + MCA</text>
              </g>
              <g className="node coi" style={st("--i:2")} data-app="inc-step-14" role="button" aria-haspopup="dialog" tabIndex={0}>
                <circle className="pulse" cx="468" cy="130" r="20" />
                <path className="d" d="M 468 112 L 486 130 L 468 148 L 450 130 Z" />
                <text className="t" x="468" y="178">Certificate of Incorporation</text><text className="s" x="468" y="196">CIN, PAN and TAN arrive</text><text className="w" x="468" y="214">DAY 0</text>
              </g>
              <g className="node" style={st("--i:3")} data-app="inc-phase-3" role="button" aria-haspopup="dialog" tabIndex={0}>
                <circle className="halo" cx="672" cy="80" r="30" /><circle className="c" cx="672" cy="80" r="18" /><text className="n" x="672" y="85">3</text>
                <text className="t" x="672" y="30">The first 180 days</text><text className="s" x="672" y="48">11 steps with statutory clocks</text><text className="w" x="672" y="14">FIRM</text>
              </g>
              <g className="node" style={st("--i:4")} data-app="inc-phase-4" role="button" aria-haspopup="dialog" tabIndex={0}>
                <circle className="halo" cx="876" cy="130" r="30" /><circle className="c" cx="876" cy="130" r="18" /><text className="n" x="876" y="135">4</text>
                <text className="t" x="876" y="178">Registrations</text><text className="s" x="876" y="196">23 items, only the ones that apply</text><text className="w" x="876" y="214">FIRM</text>
              </g>
              <g className="node loop" style={st("--i:5")} data-app="compliances" role="button" aria-haspopup="dialog" tabIndex={0}>
                <circle className="halo" cx="1080" cy="80" r="30" /><circle className="c" cx="1080" cy="80" r="18" />
                <path d="M 1072 80 a 8 8 0 1 1 3 6.3" className="loop-i" /><path d="M 1075 84 l 0 4 l -4 0" className="loop-i" />
                <text className="t" x="1080" y="30">Compliance, every year</text><text className="s" x="1080" y="48">monthly, quarterly, annual</text><text className="w" x="1080" y="14">FIRM + CLIENT</text>
              </g>
            </svg>
            <ol className="journey-list">
              <li data-n="1" data-app="inc-phase-a" role="button" aria-haspopup="dialog" tabIndex={0}><b>Name and papers</b><span>5 steps, about 2 weeks. Client and firm.</span></li>
              <li data-n="2" data-app="inc-phase" role="button" aria-haspopup="dialog" tabIndex={0}><b>Incorporation</b><span>11 steps, SPICe+ with MCA. Firm and MCA.</span></li>
              <li className="coi" data-app="inc-step-14" role="button" aria-haspopup="dialog" tabIndex={0}><b>Certificate of Incorporation</b><span>Day 0. CIN, PAN and TAN arrive.</span></li>
              <li data-n="3" data-app="inc-phase-3" role="button" aria-haspopup="dialog" tabIndex={0}><b>The first 180 days</b><span>11 steps with statutory clocks. The firm.</span></li>
              <li data-n="4" data-app="inc-phase-4" role="button" aria-haspopup="dialog" tabIndex={0}><b>Registrations</b><span>23 items, only the ones that apply. The firm.</span></li>
              <li className="loop" data-app="compliances" role="button" aria-haspopup="dialog" tabIndex={0}><b>Compliance, every year</b><span>Monthly, quarterly and annual filings. Firm and client.</span></li>
            </ol>
          </div>
          <p className="caption reveal"><span className="icon"><Ic><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="1" /></Ic></span>Every node on this line is a page in the portal, and every step on that page shows the same three things: who holds it, when it is due, and the document that proves it.</p>
        </div>
      </section>

      {/* Incorporation story */}
      <section className="section" id="incorporate">
        <div className="container">
          <div className="section-head reveal">
            <span className="stage"><b>1</b>Stages 1 and 2</span>
            <h2 className="h2">From a name on a wish list to a certificate from MCA.</h2>
            <p className="body">Sixteen steps pass between the client, the firm and the Ministry of Corporate Affairs. The diagram follows one document at a time. Scroll, and watch it move.</p>
          </div>
          <div className="story" data-story>
            <div className="story-steps">
              <div className="story-step" data-step="1">
                <h3 className="h3">The client tells you about the company</h3>
                <p>Names they like, the directors, the share capital, the registered office and the parent company. One questionnaire, answered once. Every document after this is generated from it.</p>
                <div className="whos"><span className="who who-you"><i>C</i>Client</span><span className="who who-sbc"><i>F</i>Firm reviews</span></div>
              </div>
              <div className="story-step" data-step="2">
                <h3 className="h3">A board resolution, drafted and signed</h3>
                <p>You draft the resolution from their answers. The client prints it on the parent letterhead, signs, and uploads. The project lead checks it the same day.</p>
                <div className="whos"><span className="who who-sbc"><i>F</i>Firm drafts</span><span className="who who-you"><i>C</i>Client signs</span></div>
              </div>
              <div className="story-step" data-step="3">
                <h3 className="h3">The name is reserved with MCA</h3>
                <p>You file the name application. MCA usually answers within a week, and the approved name is held for 20 days while the rest is prepared.</p>
                <div className="whos"><span className="who who-sbc"><i>F</i>Firm files</span><span className="who who-mca"><i>M</i>MCA approves</span></div>
              </div>
              <div className="story-step" data-step="4">
                <h3 className="h3">Documents generated, signed with a digital signature</h3>
                <p>The memorandum, the articles, each director&apos;s consent (DIR-2) and declaration (INC-9), the subscriber sheets: all generated, not retyped. Directors get a digital signature and sign.</p>
                <div className="whos"><span className="who who-sbc"><i>F</i>Firm generates</span><span className="who who-you"><i>C</i>Directors sign</span></div>
              </div>
              <div className="story-step" data-step="5">
                <h3 className="h3">SPICe+ filed, certificate issued</h3>
                <p>You file SPICe+ Part B with AGILE-PRO-S. If MCA raises remarks, you answer them. Then the Certificate of Incorporation arrives with the CIN, PAN and TAN, and the clock for stage 3 starts.</p>
                <div className="whos"><span className="who who-sbc"><i>F</i>Firm files</span><span className="who who-mca"><i>M</i>MCA issues</span></div>
              </div>
            </div>
            <div className="story-stage">
              <div className="card stage-panel">
                <svg className="swim" viewBox="0 0 600 560" role="img" aria-label="Swimlane diagram with three columns, Client, Firm and MCA, showing how documents move between them during incorporation.">
                  <defs>
                    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path className="ah" d="M 0 0 L 10 5 L 0 10 z" /></marker>
                    <marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path className="ah2" d="M 0 0 L 10 5 L 0 10 z" /></marker>
                  </defs>
                  {/* columns */}
                  <rect className="col-h" x="20" y="14" width="160" height="34" rx="8" /><text className="col-t" x="100" y="36">CLIENT</text>
                  <rect className="col-h" x="220" y="14" width="160" height="34" rx="8" /><text className="col-t" x="300" y="36">FIRM</text>
                  <rect className="col-h" x="420" y="14" width="160" height="34" rx="8" /><text className="col-t" x="500" y="36">MCA</text>
                  <line className="lane" x1="100" y1="60" x2="100" y2="548" /><line className="lane" x1="300" y1="60" x2="300" y2="548" /><line className="lane" x1="500" y1="60" x2="500" y2="548" />
                  {/* step 1: questionnaire */}
                  <g className="sg s1">
                    <rect className="doc" x="30" y="72" width="140" height="58" rx="8" />
                    <line className="doc-l" x1="46" y1="90" x2="140" y2="90" /><line className="doc-l" x1="46" y1="102" x2="118" y2="102" /><line className="doc-l" x1="46" y1="114" x2="130" y2="114" />
                    <text className="lbl" x="100" y="148" textAnchor="middle">Company details</text>
                    <path className="arrow" d="M 176 101 L 222 101" />
                    <rect className="doc" x="228" y="83" width="144" height="36" rx="8" />
                    <text className="lbl" x="300" y="105" textAnchor="middle">Firm reviews</text>
                  </g>
                  {/* step 2: board resolution */}
                  <g className="sg s2">
                    <rect className="doc" x="225" y="166" width="150" height="48" rx="8" />
                    <text className="lbl" x="300" y="186" textAnchor="middle">Board resolution</text><text className="sub" x="300" y="202" textAnchor="middle">drafted from the answers</text>
                    <path className="arrow back" d="M 219 190 L 181 190" />
                    <rect className="doc" x="25" y="166" width="150" height="48" rx="8" />
                    <text className="lbl" x="100" y="186" textAnchor="middle">Signed, uploaded</text><text className="sub" x="100" y="202" textAnchor="middle">on letterhead</text>
                    <circle className="badge" cx="171" cy="168" r="9" /><path className="tick" d="M 167 168 l 3 3 l 5.5 -6" />
                  </g>
                  {/* step 3: name reservation */}
                  <g className="sg s3">
                    <rect className="doc" x="225" y="242" width="150" height="48" rx="8" />
                    <text className="lbl" x="300" y="262" textAnchor="middle">Name application</text><text className="sub" x="300" y="278" textAnchor="middle">RUN, Part A</text>
                    <path className="arrow" d="M 381 266 L 419 266" />
                    <rect className="badge" x="425" y="242" width="150" height="48" rx="8" />
                    <text className="badge-t" x="500" y="262">Name approved</text><text className="sub" x="500" y="278" textAnchor="middle">held for 20 days</text>
                  </g>
                  {/* step 4: generated documents + DSC */}
                  <g className="sg s4">
                    <rect className="doc" x="231" y="318" width="150" height="48" rx="8" transform="rotate(-5 306 342)" />
                    <rect className="doc" x="228" y="321" width="150" height="48" rx="8" transform="rotate(-2.5 303 345)" />
                    <rect className="doc" x="225" y="324" width="150" height="48" rx="8" />
                    <text className="lbl" x="300" y="344" textAnchor="middle">MOA, AOA, DIR-2</text><text className="sub" x="300" y="360" textAnchor="middle">INC-9, declarations</text>
                    <path className="arrow back" d="M 219 348 L 181 348" />
                    <rect className="doc" x="25" y="324" width="150" height="48" rx="8" />
                    <text className="lbl" x="100" y="344" textAnchor="middle">Signed with DSC</text><text className="sub" x="100" y="360" textAnchor="middle">each director</text>
                    <circle className="badge" cx="171" cy="326" r="9" /><path className="tick" d="M 167 326 l 3 3 l 5.5 -6" />
                  </g>
                  {/* step 5: SPICe+ and certificate */}
                  <g className="sg s5">
                    <rect className="doc" x="225" y="400" width="150" height="48" rx="8" />
                    <text className="lbl" x="300" y="420" textAnchor="middle">SPICe+ Part B</text><text className="sub" x="300" y="436" textAnchor="middle">with AGILE-PRO-S</text>
                    <path className="arrow" d="M 381 424 L 500 424 L 500 456" />
                    <rect className="cert-glow" x="418" y="460" width="164" height="88" rx="14" />
                    <rect className="cert" x="428" y="468" width="144" height="72" rx="10" />
                    <text className="lbl" x="500" y="492" textAnchor="middle">Certificate</text>
                    <text className="sub" x="500" y="508" textAnchor="middle">of Incorporation</text>
                    <text className="sub" x="500" y="526" textAnchor="middle" style={st("font-family: var(--lp-font-mono); font-size: 10px; letter-spacing: .06em")}>CIN · PAN · TAN</text>
                    <circle className="badge" cx="568" cy="470" r="9" /><path className="tick" d="M 564 470 l 3 3 l 5.5 -6" />
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Post-incorporation timeline */}
      <section className="section" id="after">
        <div className="glow glow-info" style={st("width:700px;height:500px;left:-200px;top:20%")}></div>
        <div className="container">
          <div className="section-head reveal">
            <span className="stage"><b>3</b>Stage 3</span>
            <h2 className="h2">The first 180 days after the certificate.</h2>
            <p className="body">Eleven steps, most with a statutory clock. They start the day the certificate arrives; the portal counts the days and sends a reminder before each one runs out.</p>
          </div>
          <div className="tl reveal" data-reveal="tl" aria-label="Timeline of the first 180 days after incorporation">
            <div className="axis"><div className="axis-fill"></div>
              <span className="tick" style={st("left:0%")}>DAY 0</span><span className="tick" style={st("left:16.7%")}>30</span><span className="tick" style={st("left:33.3%")}>60</span><span className="tick" style={st("left:50%")}>90</span><span className="tick" style={st("left:66.7%")}>120</span><span className="tick" style={st("left:83.3%")}>150</span><span className="tick" style={st("left:100%")}>180</span>
            </div>
            <div className="pin coi up first" style={st("left:0%;--i:0")}><div className="card pc" data-app="inc-step-14" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Day 0</span><b>Certificate of Incorporation</b><span>The company exists. Every clock below starts today.</span></div><span className="stem"></span><span className="dot"></span></div>
            <div className="pin down" style={st("left:16.7%;--i:1")}><div className="card pc" data-app="inc-step-15" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Within 30 days</span><b>Five things at once</b><ul><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>First board meeting</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Auditor appointed (ADT-1)</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Registered office confirmed (INC-22)</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Letterhead and name board</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Nominee shareholder forms</li></ul></div><span className="stem"></span><span className="dot"></span></div>
            <div className="pin up" style={st("left:33.3%;--i:2")}><div className="card pc" data-app="inc-step-19" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Within 60 days</span><b>Share certificates (SH-1)</b><span>Issued to every subscriber once the capital is in.</span></div><span className="stem"></span><span className="dot"></span></div>
            <div className="pin down" style={st("left:56%;--i:3")}><div className="card pc" data-app="inc-step-17" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">No statutory clock</span><b>Bank account, then capital</b><span>The account opens when the bank clears KYC. The subscription money comes in from the parent.</span></div><span className="stem"></span><span className="dot"></span></div>
            <div className="pin up" style={st("left:78%;--i:4")}><div className="card pc" data-app="inc-step-22" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">30 days after shares are allotted</span><b>FC-GPR to the RBI</b><span>For foreign capital. Reported through the FIRMS portal.</span></div><span className="stem"></span><span className="dot"></span></div>
            <div className="pin down last" style={st("left:100%;--i:5")}><div className="card pc" data-app="inc-step-20" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Within 180 days</span><b>Capital in, commencement filed (INC-20A)</b><span>The company may start business. Stage 4 begins.</span></div><span className="stem"></span><span className="dot"></span></div>
          </div>
          <ol className="tl-list reveal">
            <li className="card" data-app="inc-step-14" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Day 0</span><b>Certificate of Incorporation</b><span>Every clock starts today.</span></li>
            <li className="card" data-app="inc-step-15" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Within 30 days</span><b>First board meeting, auditor (ADT-1), registered office (INC-22), letterhead and name board, nominee shareholder forms</b></li>
            <li className="card" data-app="inc-step-19" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Within 60 days</span><b>Share certificates (SH-1)</b><span>Issued once the capital is in.</span></li>
            <li className="card" data-app="inc-step-17" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">No statutory clock</span><b>Bank account, then capital</b><span>Opens when the bank clears KYC.</span></li>
            <li className="card" data-app="inc-step-22" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">30 days after allotment</span><b>FC-GPR to the RBI</b><span>For foreign capital.</span></li>
            <li className="card" data-app="inc-step-20" role="button" aria-haspopup="dialog" tabIndex={0}><span className="mono">Within 180 days</span><b>Commencement filed (INC-20A)</b><span>The company may start business.</span></li>
          </ol>
          <p className="caption reveal"><span className="icon"><Ic><line x1="10" x2="14" y1="2" y2="2" /><line x1="12" x2="15" y1="14" y2="11" /><circle cx="12" cy="14" r="8" /></Ic></span>Each pin is a step in the portal with a due date computed from the certificate date. The client sees the same countdown the project lead sees.</p>
        </div>
      </section>

      {/* Registrations hub */}
      <section className="section" id="register">
        <div className="container">
          <div className="section-head reveal">
            <span className="stage"><b>4</b>Stage 4</span>
            <h2 className="h2">Every registration the company needs, and none it does not.</h2>
            <p className="body">Twenty-three registrations and reportings sit behind five regulators. The firm switches on the ones that apply to the company, and each becomes a step with an owner and a date.</p>
          </div>
          <div className="hub reveal" data-reveal="hub">
            <svg className="wires" viewBox="0 0 1120 560" preserveAspectRatio="none" aria-hidden="true">
              <path className="wire" style={st("--i:0")} d="M 560 280 C 460 280 300 123 157 123" />
              <path className="wire" style={st("--i:1")} d="M 560 280 C 660 280 820 123 963 123" />
              <path className="wire" style={st("--i:2")} d="M 560 280 C 460 280 300 437 157 437" />
              <path className="wire" style={st("--i:3")} d="M 560 280 C 660 280 820 437 963 437" />
              <path className="wire" style={st("--i:4")} d="M 560 280 L 560 515" />
            </svg>
            <div className="card centre"><span className="ring1"></span><span className="ring2"></span><b>Your company</b><span className="mono">CIN · PAN · TAN</span></div>
            <div className="card cluster c-tax card-hover" data-app="inc-phase-4" style={st("--i:0")} role="button" aria-haspopup="dialog" tabIndex={0}><header><span className="tile"><span className="icon"><Ic><path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" /><path d="M8 11h8" /><path d="M8 7h8" /><path d="M9 7a4 4 0 0 1 0 8H8l3 2" /></Ic></span></span><b>Tax</b><span>4</span></header><div className="chips"><span className="chip">PAN and TAN</span><span className="chip" data-app="inc-step-26" role="button" aria-haspopup="dialog" tabIndex={0}>GST</span><span className="chip" data-app="inc-step-34" role="button" aria-haspopup="dialog" tabIndex={0}>LUT for exports</span><span className="chip" data-app="inc-step-29" role="button" aria-haspopup="dialog" tabIndex={0}>Professional tax</span></div></div>
            <div className="card cluster c-lab card-hover" data-app="inc-phase-4" style={st("--i:1")} role="button" aria-haspopup="dialog" tabIndex={0}><header><span className="tile"><span className="icon"><Ic><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></Ic></span></span><b>Labour</b><span>5</span></header><div className="chips"><span className="chip" data-app="inc-step-27" role="button" aria-haspopup="dialog" tabIndex={0}>PF</span><span className="chip" data-app="inc-step-28" role="button" aria-haspopup="dialog" tabIndex={0}>ESI</span><span className="chip" data-app="inc-step-36" role="button" aria-haspopup="dialog" tabIndex={0}>Shops and Establishment</span><span className="chip" data-app="inc-step-37" role="button" aria-haspopup="dialog" tabIndex={0}>CLRA</span><span className="chip" data-app="inc-step-38" role="button" aria-haspopup="dialog" tabIndex={0}>POSH committee</span></div></div>
            <div className="card cluster c-trade card-hover" data-app="inc-phase-4" style={st("--i:2")} role="button" aria-haspopup="dialog" tabIndex={0}><header><span className="tile"><span className="icon"><Ic><path d="M12 16h.01" /><path d="M16 16h.01" /><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M8 16h.01" /></Ic></span></span><b>Trade</b><span>6</span></header><div className="chips"><span className="chip" data-app="inc-step-33" role="button" aria-haspopup="dialog" tabIndex={0}>IEC</span><span className="chip" data-app="inc-step-32" role="button" aria-haspopup="dialog" tabIndex={0}>ICEGATE</span><span className="chip" data-app="inc-step-39" role="button" aria-haspopup="dialog" tabIndex={0}>Trade licence</span><span className="chip" data-app="inc-step-31" role="button" aria-haspopup="dialog" tabIndex={0}>MSME</span><span className="chip" data-app="inc-step-30" role="button" aria-haspopup="dialog" tabIndex={0}>LEI</span><span className="chip" data-app="inc-step-35" role="button" aria-haspopup="dialog" tabIndex={0}>STPI</span></div></div>
            <div className="card cluster c-rbi card-hover" data-app="inc-phase-4" style={st("--i:3")} role="button" aria-haspopup="dialog" tabIndex={0}><header><span className="tile"><span className="icon"><Ic><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></Ic></span></span><b>RBI and FEMA</b><span>5</span></header><div className="chips"><span className="chip" data-app="inc-step-44" role="button" aria-haspopup="dialog" tabIndex={0}>FC-GPR</span><span className="chip" data-app="inc-step-45" role="button" aria-haspopup="dialog" tabIndex={0}>FDI reporting</span><span className="chip" data-app="inc-step-46" role="button" aria-haspopup="dialog" tabIndex={0}>ODI reporting</span><span className="chip" data-app="inc-step-47" role="button" aria-haspopup="dialog" tabIndex={0}>FLA return</span><span className="chip" data-app="inc-step-48" role="button" aria-haspopup="dialog" tabIndex={0}>FC-TRS</span></div></div>
            <div className="card cluster c-ip card-hover" data-app="inc-phase-4" style={st("--i:4")} role="button" aria-haspopup="dialog" tabIndex={0}><header><span className="tile"><span className="icon"><Ic><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13" /><path d="M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z" /><path d="M5 22h14" /></Ic></span></span><b>Intellectual property</b><span>3</span></header><div className="chips"><span className="chip" data-app="inc-step-40" role="button" aria-haspopup="dialog" tabIndex={0}>Trademark</span><span className="chip" data-app="inc-step-41" role="button" aria-haspopup="dialog" tabIndex={0}>Trademark renewal</span><span className="chip" data-app="inc-step-42" role="button" aria-haspopup="dialog" tabIndex={0}>Patent</span></div></div>
          </div>
          <p className="caption reveal"><span className="icon"><Ic><path d="M13 5h8" /><path d="M13 12h8" /><path d="M13 19h8" /><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /></Ic></span>A software subsidiary with no exports never sees IEC or ICEGATE. A company with no foreign capital never sees FC-GPR. The checklist is cut to the company.</p>
        </div>
      </section>

      {/* Compliance ring */}
      <section className="section" id="comply">
        <div className="glow glow-brand" style={st("width:900px;height:600px;left:-300px;top:10%")}></div>
        <div className="container">
          <div className="section-head reveal">
            <span className="stage loop"><b>∞</b>Every year</span>
            <h2 className="h2">Then the calendar takes over.</h2>
            <p className="body">A private company files something almost every week of the year. Every filing on this ring has a due date, an owner and a reminder in the portal. Nothing depends on someone remembering.</p>
          </div>
          <div className="comply-grid">
            <div className="ring-wrap reveal" data-reveal="ring" data-app="compliances" aria-label="Book a demo to see the compliance calendar" role="button" aria-haspopup="dialog" tabIndex={0}>
              <ComplianceRing />
            </div>
            <div className="reveal">
              <h3 className="h3">What a financial year looks like</h3>
              <ul className="legend">
                <li><i style={st("background:var(--lp-d3)")}></i><span><b>GST.</b> GSTR-1 by the 11th and GSTR-3B by the 20th, every month. GSTR-9 once a year.</span></li>
                <li><i style={st("background:var(--lp-d1)")}></i><span><b>Income tax.</b> TDS paid by the 7th each month, TDS returns each quarter, advance tax in June, September, December and March, Form 16 in June.</span></li>
                <li><i style={st("background:var(--lp-d5)")}></i><span><b>MCA.</b> MBP-1 and DIR-8 in April, MSME-1 twice a year, DPT-3 in June, DIR-3 KYC in September, AOC-4 and MGT-7 after the annual general meeting.</span></li>
                <li><i style={st("background:var(--lp-d4)")}></i><span><b>Labour.</b> Professional tax by the 10th, PF and ESI by the 15th, every month.</span></li>
                <li><i style={st("background:var(--lp-d2)")}></i><span><b>RBI.</b> The FLA return by 15 July for every company with foreign capital.</span></li>
              </ul>
              <div className="card nudge" data-app="notifications" aria-label="How a reminder works. Book a demo to see notifications." role="button" aria-haspopup="dialog" tabIndex={0}>
                <div className="box"><span className="icon"><Ic><path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M8 13h.01" /><path d="M12 13h.01" /><path d="M16 13h.01" /><path d="M8 17h.01" /><path d="M12 17h.01" /><path d="M16 17h.01" /></Ic></span><b>Due date</b><span>from the calendar</span></div>
                <div className="arr a"><i></i></div>
                <div className="box"><span className="icon"><Ic><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M22 8c0-2.3-.8-4.3-2-6" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /><path d="M4 2C2.8 3.7 2 5.7 2 8" /></Ic></span><b>Reminder</b><span>email is the record, WhatsApp the reminder</span></div>
                <div className="arr b"><i></i></div>
                <div className="box"><span className="icon"><Ic><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Ic></span><b>Filed</b><span>acknowledgement attached</span></div>
              </div>
            </div>
          </div>
          <div className="cal-ui">
            <div className="reveal">
              <h3 className="h3">The same year, inside the portal</h3>
              <div className="frame" data-app="compliances" aria-label="Book a demo to see the compliance calendar" role="button" aria-haspopup="dialog" tabIndex={0}>
                <img src="/landing/calendar-client.webp" alt="Client compliance calendar for Northwind Technologies: October grid with TDS, GST, PF and ESI dates, the next deadline GSTR-1 in 3 days, and the coming-up list with status words." width="2000" height="1146" />
              </div>
              <p className="caption"><span className="icon"><Ic><path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M8 13h.01" /><path d="M12 13h.01" /><path d="M16 13h.01" /><path d="M8 17h.01" /><path d="M12 17h.01" /><path d="M16 17h.01" /></Ic></span>What the client sees: one month at a time, filtered by regulator, with the next deadline counting down and every filing after it in a list.</p>
            </div>
            <div className="cal-two reveal">
              <figure className="card" data-stagger style={st("--i:0")}>
                <div className="frame" data-app="filings" aria-label="Book a demo to see the filings screen" role="button" aria-haspopup="dialog" tabIndex={0}><img src="/landing/filings-client.webp" alt="Client filings view for a quarter: donut of filed, due soon, overdue and upcoming, bars by area, and a table with due date, filing, frequency, status and proof." width="1600" height="732" /></div>
                <figcaption><b>Filings, with proof.</b> Each row carries its due date, frequency, status word and the acknowledgement once filed. Overdue is a word in red, never a surprise.</figcaption>
              </figure>
              <figure className="card" data-stagger style={st("--i:1")}>
                <div className="frame" data-app="lead-compliances" aria-label="Book a demo to see the project lead calendar" role="button" aria-haspopup="dialog" tabIndex={0}><img src="/landing/calendar-lead.webp" alt="Project lead's statutory calendar: October deadlines listed by day across GST, income tax and labour, with a month picker and a legend by regulator." width="1600" height="917" /></div>
                <figcaption><b>The firm&apos;s side.</b> The project lead sees every statutory date across every company, grouped by day, with a reminder button on each.</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* The record */}
      <section className="section" id="record">
        <div className="container">
          <div className="split">
            <div className="reveal">
              <h2 className="h2">Every step has an owner, a date and a proof.</h2>
              <p className="body" style={st("margin-top:16px")}>Work enters as a step, a filing or a document request. The firm reviews it. It leaves as a status word with a date behind it, and the client reads the same word the firm reads.</p>
              <div className="facts-mini">
                <div data-stagger style={st("--i:0")}><span className="mono">Owner</span><p>The client, the firm or MCA. Never &quot;someone&quot;.</p></div>
                <div data-stagger style={st("--i:1")}><span className="mono">Due date</span><p>Statutory where the law sets one, agreed where it does not.</p></div>
                <div data-stagger style={st("--i:2")}><span className="mono">Document</span><p>The upload, the generated form or the filed acknowledgement.</p></div>
                <div data-stagger style={st("--i:3")}><span className="mono">Audit entry</span><p>Who changed what, and when. Clients can read their own trail.</p></div>
              </div>
            </div>
            <div className="lanes reveal" aria-hidden="true">
              <div className="lane"></div><div className="lane"></div><div className="lane"></div><div className="lane"></div><div className="lane"></div>
              <div className="boundary"></div>
              <span className="mono boundary-label">Firm review</span>
              <span className="mono boundary-label right">On record</span>
              <div className="rec l1"><span className="mono">Step</span><span className="t">KYC review and DSC</span></div>
              <div className="rec l2"><span className="mono">Filing</span><span className="t">GSTR-3B, Sept</span></div>
              <div className="rec l3"><span className="mono">Document</span><span className="t">Proof of address</span></div>
              <div className="rec l4"><span className="mono">Filing</span><span className="t">ADT-1 appointment</span></div>
              <div className="rec l5"><span className="mono">Step</span><span className="t">Subscriber details</span></div>
              <div className="out l1"><span className="pill pill-brand">In progress</span></div>
              <div className="out l2"><span className="pill pill-positive">Filed 20 Oct</span></div>
              <div className="out l3"><span className="pill pill-highlight">Needs you</span></div>
              <div className="out l4"><span className="pill pill-warning">Due 14 Nov</span></div>
              <div className="out l5"><span className="pill pill-positive">Completed</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* The VCFO way vs. the old way (board C2) */}
      <CompareSection onDemo={openDemo} />

      {/* Portals */}
      <section className="section" id="portals">
        <div className="glow glow-info" style={st("width:800px;height:500px;right:-250px;top:30%")}></div>
        <div className="container">
          <div className="section-head reveal">
            <h2 className="h2">Three portals. One engagement.</h2>
            <p className="body">The whole firm for the partner, oversight for the admin, overview for the manager, focus for the project lead, clarity for the client. Nobody forwards a spreadsheet.</p>
          </div>
          <div className="reveal">
            <div className="tab-head">
              <div className="tabs" role="tablist" aria-label="Portals" ref={tabsRef}>
                <button className="tab" type="button" role="tab" id="tab-client" aria-selected={tab === "client"} aria-controls="panel-client" tabIndex={tab === "client" ? 0 : -1} onClick={() => setTab("client")} onKeyDown={tabKey}>Client</button>
                <button className="tab" type="button" role="tab" id="tab-lead" aria-selected={tab === "lead"} aria-controls="panel-lead" tabIndex={tab === "lead" ? 0 : -1} onClick={() => setTab("lead")} onKeyDown={tabKey}>Project lead</button>
                <button className="tab" type="button" role="tab" id="tab-manager" aria-selected={tab === "manager"} aria-controls="panel-manager" tabIndex={tab === "manager" ? 0 : -1} onClick={() => setTab("manager")} onKeyDown={tabKey}>Manager</button>
                <button className="tab" type="button" role="tab" id="tab-admin" aria-selected={tab === "admin"} aria-controls="panel-admin" tabIndex={tab === "admin" ? 0 : -1} onClick={() => setTab("admin")} onKeyDown={tabKey}>Admin</button>
                <button className="tab" type="button" role="tab" id="tab-super" aria-selected={tab === "super"} aria-controls="panel-super" tabIndex={tab === "super" ? 0 : -1} onClick={() => setTab("super")} onKeyDown={tabKey}>Super admin</button>
              </div>
              <div className="tab-desc">
                <div hidden={tab !== "client"}><p>What is waiting on the client, what the firm holds, and when the certificate is expected.</p><ul><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Upload and approve in place</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Timeline with the expected date</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Ask VCFO for the next step</li></ul><button className="btn btn-secondary btn-sm" type="button" style={st("margin-top:14px")} onClick={openDemo}>See the client portal</button></div>
                <div hidden={tab !== "lead"}><p>Today&apos;s action queue across every company the lead runs.</p><ul><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>This week&apos;s statutory filings</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Compliance health ring per company</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Who each step is waiting on</li></ul><button className="btn btn-secondary btn-sm" type="button" style={st("margin-top:14px")} onClick={openDemo}>See the project lead portal</button></div>
                <div hidden={tab !== "manager"}><p>Every task your team owns, by project lead, company and status, and each lead&apos;s workload side by side.</p><ul><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Team tasks with a live status breakdown</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Each project lead&apos;s work, by area and by status</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Assign a to-do to a project lead in one click</li></ul><button className="btn btn-secondary btn-sm" type="button" style={st("margin-top:14px")} onClick={openDemo}>See the manager portal</button></div>
                <div hidden={tab !== "admin"}><p>Every client, every manager, and where things are stuck, on one screen.</p><ul><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Each client&apos;s stage, owner and next date</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Managers&apos; load and on-time rate</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Assign a client to a manager</li></ul><button className="btn btn-secondary btn-sm" type="button" style={st("margin-top:14px")} onClick={openDemo}>See the admin portal</button></div>
                <div hidden={tab !== "super"}><p>The whole firm at one place: clients, admins, managers, work and risk.</p><ul><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Incorporations, registrations and filings side by side</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>Risks, team load and growth on one screen</li><li><span className="icon"><Ic><path d="M20 6 9 17l-5-5" /></Ic></span>A monthly partner report in one click</li></ul><button className="btn btn-secondary btn-sm" type="button" style={st("margin-top:14px")} onClick={openDemo}>See the super admin portal</button></div>
              </div>
            </div>
            <div className="tabpanel">
              <div className="frame" role="tabpanel" id="panel-client" aria-labelledby="tab-client" hidden={tab !== "client"} data-app="home">
                <img src="/landing/portal-client.webp" alt="Client portal home for Northwind Technologies India Pvt Ltd: the home card with five numbers, the incorporation steps with who holds each one, what is needed from Northwind and the timeline." width="2000" height="1146" />
              </div>
              <div className="frame" role="tabpanel" id="panel-lead" aria-labelledby="tab-lead" hidden={tab !== "lead"} data-app="lead-home">
                <img src="/landing/portal-lead.webp" alt="Project lead Today screen for Bharath: the home card with five numbers, the action queue by company, the inbox and phase progress." width="2000" height="1146" />
              </div>
              <div className="frame" role="tabpanel" id="panel-manager" aria-labelledby="tab-manager" hidden={tab !== "manager"} data-app="mgr-home">
                <img src="/landing/portal-manager.webp" alt="Manager Today screen for Pranay: the home card with five numbers, team tasks with filters, approvals, the task status donut and workload by project lead." width="2000" height="1146" />
              </div>
              <div className="frame" role="tabpanel" id="panel-admin" aria-labelledby="tab-admin" hidden={tab !== "admin"} data-app="admin-home">
                <img src="/landing/portal-admin.webp" alt="Admin Today screen for Krishna: the home card, the practice areas, fourteen clients with their stage, manager and health, and the managers' load." width="2000" height="1146" />
              </div>
              <div className="frame" role="tabpanel" id="panel-super" aria-labelledby="tab-super" hidden={tab !== "super"} data-app="super-home">
                <img src="/landing/portal-super.webp" alt="Super admin overview for Mithilesh: the home card with the firm's numbers, the practice areas side by side, top risks and clients needing attention." width="2000" height="1146" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ask VCFO */}
      <section className="section" id="ask">
        <div className="container">
          <div className="ask">
            <div className="reveal">
              <div className="panel" data-app="home-chat" aria-label="Book a demo to try Ask VCFO" role="button" aria-haspopup="dialog" tabIndex={0}>
                <img src="/landing/ask-vcfo.webp" alt="Ask VCFO panel inside the client portal, answering from Northwind's project data, with suggested questions." width="779" height="1150" />
              </div>
            </div>
            <div className="reveal">
              <h2 className="h2">Ask VCFO answers from the project, not from a brochure.</h2>
              <p className="body" style={st("margin-top:16px")}>A client asks where the incorporation stands, which documents are missing or when a filing is due, and gets the answer from their own engagement data. Anything the assistant cannot answer is handed to the firm&apos;s team with the context attached.</p>
              <ul className="qs" aria-label="Example questions">
                <li data-stagger style={st("--i:0")} data-app="home-chat" role="button" aria-haspopup="dialog" tabIndex={0}><span className="icon"><Ic><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" /></Ic></span>What is my next step?</li>
                <li data-stagger style={st("--i:1")} data-app="home-chat" role="button" aria-haspopup="dialog" tabIndex={0}><span className="icon"><Ic><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" /></Ic></span>Where is my incorporation now?</li>
                <li data-stagger style={st("--i:2")} data-app="home-chat" role="button" aria-haspopup="dialog" tabIndex={0}><span className="icon"><Ic><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" /></Ic></span>Which documents are missing?</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="section" id="trust">
        <div className="container">
          <div className="section-head reveal" style={st("margin-bottom:0")}>
            <h2 className="h2">Built by a firm that files, for firms that file.</h2>
            <p className="body">SBC, a company secretarial and compliance practice, built VCFO Suite and runs its own engagements on it every day. Your firm gets the same system: your people, your clients, one record.</p>
          </div>
          <div className="trust reveal">
            <div className="card card-hover" data-stagger style={st("--i:0")}><div className="tile"><span className="icon"><Ic><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></Ic></span></div><h3 className="h3">Hosted in India</h3><p>AWS Mumbai region, encrypted storage. Client data does not leave the country.</p></div>
            <div className="card card-hover" data-stagger style={st("--i:1")} data-app="credentials" role="button" aria-haspopup="dialog" tabIndex={0}><div className="tile"><span className="icon"><Ic><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r=".5" fill="currentColor" /></Ic></span></div><h3 className="h3">Credentials stay sealed</h3><p>Portal and registration logins are stored encrypted and shown only to the people on the engagement.</p></div>
            <div className="card card-hover" data-stagger style={st("--i:2")} data-app="audit" role="button" aria-haspopup="dialog" tabIndex={0}><div className="tile"><span className="icon"><Ic><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></Ic></span></div><h3 className="h3">An audit trail you can read</h3><p>Every change is logged with who and when. Clients see their own trail in the portal.</p></div>
            <div className="card card-hover" data-stagger style={st("--i:3")}><div className="tile"><span className="icon"><Ic><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" /><rect x="2" y="4" width="20" height="16" rx="2" /></Ic></span></div><h3 className="h3">Email is the record</h3><p>Every notice goes by email. WhatsApp is a reminder on top, never the only copy.</p></div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="container">
          <div className="section-head reveal">
            <h2 className="h2">Questions clients ask before the first step.</h2>
          </div>
          <div className="faq reveal">
            <details><summary>Who is VCFO Suite for?<span className="icon"><Ic><path d="m6 9 6 6 6-6" /></Ic></span></summary><p className="a">Firms that incorporate and keep companies compliant in India, and their clients: Indian founders, and foreign parents setting up a subsidiary or a global capability centre. The firm, the Indian team and the parent entity all log in to the same record.</p></details>
            <details><summary>Is it only for SBC?<span className="icon"><Ic><path d="m6 9 6 6 6-6" /></Ic></span></summary><p className="a">No. SBC built it and runs its engagements on it, which is why every screen on this page is a real one. Another firm gets its own workspace, with its own people, clients and calendar.</p></details>
            <details><summary>What does the client actually do in the portal?<span className="icon"><Ic><path d="m6 9 6 6 6-6" /></Ic></span></summary><p className="a">Answer the questionnaire, upload the documents each step asks for, approve board resolutions, sign with a DSC, and watch the timeline. Questions go to Ask VCFO or to the people named on the engagement.</p></details>
            <details><summary>Which filings does the calendar cover?<span className="icon"><Ic><path d="m6 9 6 6 6-6" /></Ic></span></summary><p className="a">MCA, GST, Income tax, Payroll, FEMA and Labour obligations for the financial year, generated from the certificate date and the registrations the company holds. Each one carries its statutory due date.</p></details>
            <details><summary>How are we reminded?<span className="icon"><Ic><path d="m6 9 6 6 6-6" /></Ic></span></summary><p className="a">Every due date emails the owner of the step. With consent, a WhatsApp reminder goes out as well. The email is always the record; WhatsApp never replaces it.</p></details>
            <details><summary>Where is our data hosted, and who can see it?<span className="icon"><Ic><path d="m6 9 6 6 6-6" /></Ic></span></summary><p className="a">On AWS in the Mumbai region, with encrypted storage. Access is scoped by role, so a client sees only their own companies and the firm&apos;s people assigned to them.</p></details>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section cta" id="demo">
        <div className="glow glow-brand glow-a"></div>
        <div className="container reveal">
          <p className="big"><span style={st("--i:0")}>Your clients.</span><span style={st("--i:1")}>Their filings.</span><span style={st("--i:2")}>Your team.</span><span className="last" style={st("--i:3")}>All on one record.</span></p>
          <div className="cta-actions">
            <button className="btn btn-primary" type="button" onClick={openDemo}>Book a demo <span className="icon"><Ic><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Ic></span></button>
            <Link className="btn btn-secondary" href={SIGN_IN_HREF}>Try it live <span className="icon"><Ic><path d="M14 4.1 12 6" /><path d="m5.1 8-2.9-.8" /><path d="m6 12-1.9 2" /><path d="M7.2 2.2 8 5.1" /><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" /></Ic></span></Link>
          </div>
        </div>
      </section>

      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-logo">
              <img src="/landing/vcfo-logo-on-black.webp" alt="VCFO Suite by SBC" width="156" height="34" />
              <p>Company secretarial, incorporation and compliance for India companies, on one record.</p>
            </div>
            <div>
              <span className="mono">Product</span>
              <ul>
                <li><a href="#journey">How it works</a></li>
                <li><a href="#incorporate">Incorporation</a></li>
                <li><a href="#comply">Compliance calendar</a></li>
                <li><a href="#portals">Portals</a></li>
                <li><a href="#ask">Ask VCFO</a></li>
              </ul>
            </div>
            <div>
              <span className="mono">Account</span>
              <ul>
                <li><Link href={SIGN_IN_HREF}>Sign in</Link></li>
                <li><a href="#demo" onClick={(e) => { e.preventDefault(); openDemo(); }}>Book a demo</a></li>
              </ul>
            </div>
            <div>
              <span className="mono">SBC</span>
              <ul>
                <li><a href="https://sbcllp.in">sbcllp.in</a></li>
                <li><a href="mailto:info@sbcllp.in">info@sbcllp.in</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>&copy; 2026 SBC. VCFO Suite is a product of SBC.</span>
            <span>Local connect. Global outlook.</span>
          </div>
        </div>
      </footer>

      <AskGuide onDemo={openDemo} />
      <BookDemoDialog open={demo} onOpenChange={setDemo} />
    </div>
  );
}
