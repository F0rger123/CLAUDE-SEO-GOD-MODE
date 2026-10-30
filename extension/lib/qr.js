/**
 * QR codes for pairing: the extension shows its sync code as a QR code, and the Android app scans it.
 * Drawn as one SVG path, black on white with a quiet border, so any phone camera reads it in light or dark mode.
 * Uses qrcode-generator by Kazuhiko Arase (MIT, vendor/qrcode.js).
 */
import qrcode from "./vendor/qrcode.js";

/** An SVG QR code for `text`. label: what a screen reader says. */
export function qrSvg(text, label = "QR code") {
  const q = qrcode(0, "M");
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount(), pad = 4, size = n + pad * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  const safe = String(label).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
