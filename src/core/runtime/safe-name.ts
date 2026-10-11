/**
 * A screenshot's name follows it everywhere: into the file tray, into derived artifact names,
 * into the download attribute and into ZIP entries. Browsers already hand us a bare basename
 * from a file input or a drop, so this is defence in depth rather than a known hole — but it
 * is the one place every later use can rely on, so it is worth being exact here.
 *
 * It keeps ordinary names byte for byte: only path separators, control characters, device
 * names and absurd lengths are touched.
 */

/** Characters that are illegal in a filename on Windows, or dangerous in an archive entry. */
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
/** Reserved DOS device names, which Windows still refuses to write even with an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const MAX_LENGTH = 120;

export function safeFileName(name: string, fallback = "screenshot.png"): string {
  // Take the last path component: "../../x.png" and "C:\\tmp\\x.png" both become "x.png".
  const base = String(name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(ILLEGAL, "-")
    .replace(/\s+/g, " ")
    .trim()
    // A leading dot hides the file on Unix and makes "..", "..." meaningless as names.
    .replace(/^\.+/, "")
    .trim();
  if (!base || base === "-") return fallback;
  const guarded = RESERVED.test(base) ? `file-${base}` : base;
  if (guarded.length <= MAX_LENGTH) return guarded;
  // Keep the extension when shortening, so the result still opens in the right application.
  const dot = guarded.lastIndexOf(".");
  const ext = dot > 0 && guarded.length - dot <= 12 ? guarded.slice(dot) : "";
  return guarded.slice(0, MAX_LENGTH - ext.length) + ext;
}
