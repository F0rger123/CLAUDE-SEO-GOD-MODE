/**
 * Runs inside the ChatGPT page the app opens (native.js injects it), so it must stay self-contained (no imports).
 * Waits for the newest answer to finish (no stop button, text unchanged for 3 seconds), then returns its text and
 * links. It only reads the page; if ChatGPT asks you to log in or verify, you do that in the window.
 */
export async function readChat() {
  if (window.__sgmChat) return { kind: "wait" };
  window.__sgmChat = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let last = "", same = 0;
  try {
    for (let i = 0; i < 150; i++) {
      await sleep(1000);
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const m = msgs[msgs.length - 1];
      const text = (m?.innerText || "").trim();
      const busy = !!document.querySelector('[data-testid="stop-button"], button[aria-label^="Stop"]');
      if (text && text === last && !busy) {
        if (++same >= 3) return { kind: "chat", text: text.slice(0, 8000), links: [...m.querySelectorAll("a[href]")].map((a) => a.href).slice(0, 40) };
      } else same = 0;
      last = text;
    }
    return { kind: "wait" };
  } finally { window.__sgmChat = false; }
}
