"use client";
import * as React from "react";

export const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Inline style from a CSS string, so the markup stays the same as the old landing ("left:16.7%;--i:1"). */
export function st(css: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const part of css.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    out[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out as React.CSSProperties;
}

/**
 * The old landing's page script, scoped to the landing root:
 * scroll reveal with count-up, the sticky story, and the nav shadow sentinel.
 */
export function useLandingMotion(root: React.RefObject<HTMLElement | null>, setScrolled: (v: boolean) => void) {
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = reduceMotion();
    const hasIO = "IntersectionObserver" in window;
    const cleanups: (() => void)[] = [];

    const countUp = (n: HTMLElement) => {
      const target = parseInt(n.getAttribute("data-count") || "0", 10);
      if (reduce || !target) {
        n.textContent = String(target);
        return;
      }
      let start = 0;
      const tick = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / 1200);
        n.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const show = (r: Element) => {
      r.classList.add("in");
      r.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
    };
    const revealed = Array.from(el.querySelectorAll(".reveal"));
    if (reduce || !hasIO) revealed.forEach(show);
    else {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              show(e.target);
              io.unobserve(e.target);
            }
          }),
        { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
      );
      revealed.forEach((r) => io.observe(r));
      cleanups.push(() => io.disconnect());
    }

    el.querySelectorAll("[data-story]").forEach((story) => {
      const steps = Array.from(story.querySelectorAll(".story-step"));
      const groups = Array.from(story.querySelectorAll(".sg"));
      const activate = (n: number) => {
        steps.forEach((s, i) => s.classList.toggle("is-active", i + 1 === n));
        groups.forEach((g, i) => {
          g.classList.toggle("done", i + 1 < n);
          g.classList.toggle("cur", i + 1 === n);
        });
      };
      activate(1);
      if (!hasIO) return;
      const sio = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) activate(parseInt(e.target.getAttribute("data-step") || "1", 10));
          }),
        { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
      );
      steps.forEach((s) => sio.observe(s));
      cleanups.push(() => sio.disconnect());
    });

    const sentinel = el.querySelector(".nav-sentinel");
    if (hasIO && sentinel) {
      const nio = new IntersectionObserver((entries) => setScrolled(!entries[0].isIntersecting));
      nio.observe(sentinel);
      cleanups.push(() => nio.disconnect());
    }
    return () => cleanups.forEach((c) => c());
  }, [root, setScrolled]);
}
