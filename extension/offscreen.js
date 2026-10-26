/**
 * Offscreen document: the background worker has no DOM parser, so the Google hover cards' page breakdowns run here.
 * Only answers messages addressed to it ({target: "offscreen"}) from this extension.
 */
import { breakdown } from "./lib/breakdown.js";

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target !== "offscreen" || sender.id !== chrome.runtime.id) return false;
  breakdown(msg.serp, msg.url).then(reply, (e) => reply({ error: String(e.message || e) }));
  return true;
});
