'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** Everything a person can click, type in or tab to. The robot never sits over one of these. */
const ACT =
  'a[href],button,[role=button],[role=link],[role=tab],[role=checkbox],[role=radio],[role=switch],[role=menuitem],[role=option],input,select,textarea,summary,label,[data-go],[onclick],[contenteditable=""],[contenteditable=true]';

/**
 * True when the robot's box (`.vpl-char` inside `launch`) sits over more than a fifth of a
 * control. The box is sampled on a 6 x 4 grid, as prototype proto.js does.
 */
function coversControl(launch: HTMLElement | null): boolean {
  const c = launch?.querySelector('.vpl-char');
  if (!c || !launch) return false;
  const r = c.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const seen: Element[] = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 4; j++) {
      const x = r.left + r.width * (0.08 + 0.168 * i);
      const y = r.top + r.height * (0.08 + 0.28 * j);
      for (const e of document.elementsFromPoint(x, y)) {
        if (launch.contains(e)) continue;
        const a = e.closest(ACT);
        if (!a || seen.includes(a)) break;
        seen.push(a);
        const b = a.getBoundingClientRect();
        const ow = Math.min(b.right, r.right) - Math.max(b.left, r.left);
        const oh = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
        if (ow > 0 && oh > 0 && (ow * oh) / Math.max(1, b.width * b.height) > 0.2) return true;
        break;
      }
    }
  return false;
}

/**
 * When the Ask VCFO robot should duck under the bottom edge: while the page scrolls, while
 * the chat is open, while `extra()` says so (for example a bottom sheet is open), or when it
 * would cover a control. Re-checked every second while the tab is visible. `lift` is how far
 * the launcher sits above the window's bottom edge, for a chat window that hangs above it.
 */
export function useAvatarYield(launchRef: RefObject<HTMLElement | null>, open: boolean, extra?: () => boolean) {
  const [yieldOn, setYield] = useState(false);
  const [lift, setLift] = useState('0px');
  const scrolling = useRef(false);
  const extraRef = useRef(extra);
  useEffect(() => {
    extraRef.current = extra;
  }, [extra]);

  const update = useCallback(() => {
    const l = launchRef.current;
    setYield(scrolling.current || open || Boolean(extraRef.current?.()) || coversControl(l));
    if (l) setLift(`${Math.max(0, Math.round(window.innerHeight - l.getBoundingClientRect().bottom))}px`);
  }, [launchRef, open]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (open) return;
      scrolling.current = true;
      update();
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        scrolling.current = false;
        update();
      }, 650);
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', update);
    const iv = setInterval(() => {
      if (!document.hidden) update();
    }, 1000);
    const first = setTimeout(update, 60);
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', update);
      clearInterval(iv);
      clearTimeout(first);
      if (t) clearTimeout(t);
    };
  }, [open, update]);

  return { yieldOn, lift };
}
