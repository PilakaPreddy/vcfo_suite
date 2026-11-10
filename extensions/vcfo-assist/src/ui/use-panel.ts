import { useCallback, useEffect, useRef, useState } from 'react';
import { PANEL_PORT, type PanelCommand, type PanelMessage, type PanelState } from '../shared/messages';

/** One long-lived port to the background. Reconnects when the service worker restarts. */
export function usePanel(): { state: PanelState | null; send: (cmd: PanelCommand) => void } {
  const [state, setState] = useState<PanelState | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      const port = chrome.runtime.connect({ name: PANEL_PORT });
      portRef.current = port;
      port.onMessage.addListener((msg: PanelMessage) => {
        if (msg.type === 'state') setState(msg.state);
      });
      port.onDisconnect.addListener(() => {
        portRef.current = null;
        if (!closed) retry = setTimeout(connect, 500);
      });
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      portRef.current?.disconnect();
    };
  }, []);

  const send = useCallback((cmd: PanelCommand) => {
    try {
      portRef.current?.postMessage(cmd);
    } catch {
      // The port reconnects on its own; the next click goes through.
    }
  }, []);

  // While a human gate waits on the page, nudge the engine (this also keeps the worker awake).
  const waiting = state?.run?.state === 'WAIT_LOGIN' || state?.run?.state === 'WAIT_SUBMIT_PAY';
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => send({ cmd: 'tick' }), 2000);
    return () => clearInterval(t);
  }, [waiting, send]);

  return { state, send };
}
