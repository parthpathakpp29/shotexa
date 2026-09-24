/**
 * Spike C — OCR fixture scenes. Original, synthetic content (no real people/data).
 * Each scene is plain HTML; ground truth is extracted from the rendered DOM by generate.ts.
 * Elements marked `data-ocr-ignore` are excluded from ground truth (decorative only).
 */

export const SENTENCES = [
  "The team shipped the new release on Tuesday after a long week of testing.",
  "Please review the attached notes before the meeting tomorrow morning.",
  "Screenshots stay on your device and are never uploaded to a server.",
  "We moved the weekly planning call to Thursday at half past ten.",
  "Battery usage dropped by twelve percent after the latest update.",
  "Remember to export the report as a PDF before sending it to the client.",
  "The new dashboard shows daily totals, weekly trends and monthly goals.",
  "Our office will be closed on Friday for the public holiday.",
  "If the upload fails, check your connection and try again in a minute.",
  "She suggested a shorter title and a clearer summary for the article.",
  "The invoice includes three items, one discount and the local tax.",
  "Coffee with the design team is booked for eleven in the small room.",
  "Most people read the first two lines and skim the rest of the page.",
  "The quick brown fox jumps over the lazy dog near the quiet river.",
  "Keep the original file safe and work on a copy whenever possible.",
  "Travel costs are reimbursed within five working days of approval.",
  "The library opens at nine and closes at six on weekdays.",
  "A clear heading and short paragraphs make instructions easier to follow.",
  "Tickets for the conference go on sale next Monday at noon.",
  "The printer on the second floor is out of paper again.",
];

export const HINDI = [
  "आज मौसम बहुत सुहावना है।",
  "कृपया अपना पासवर्ड किसी के साथ साझा न करें।",
  "हमारी बैठक कल सुबह दस बजे होगी।",
  "नया संस्करण अब डाउनलोड के लिए उपलब्ध है।",
  "आपका ऑर्डर सफलतापूर्वक भेज दिया गया है।",
  "इस सप्ताह बारिश की संभावना है।",
  "मैं शाम को तुम्हें फोन करूँगा।",
  "यह जानकारी केवल आपके उपकरण पर रहती है।",
  "धन्यवाद, आपका दिन शुभ हो।",
  "कृपया नीचे दिए गए बटन पर क्लिक करें।",
];

export const MIXED_EN_HI = [
  "Meeting कल सुबह 10 बजे है, please confirm.",
  "मैंने report भेज दी है, check कर लेना।",
  "Payment successful हो गया, धन्यवाद!",
  "आज office नहीं आऊँगा, work from home.",
  "Order #4521 कल deliver होगा।",
  "Photos WhatsApp पर भेज दो please.",
];

export const CODE_LINES = [
  "export function mapBox(box: Box, t: Transform): Box {",
  "  const x = (box.x - t.offsetX) / t.scale;",
  "  const y = (box.y - t.offsetY) / t.scale;",
  "  return { x, y, w: box.w / t.scale, h: box.h / t.scale };",
  "}",
  "",
  'const isReady = (state) => state.status === "ready" && !state.error;',
  'const paths = ["C:\\\\tmp\\\\shots", "/var/data/ocr_out"];',
  "for (let i = 0; i < items.length; i++) {",
  "  if (items[i]?.id !== undefined) total += items[i].size ?? 0;",
  "}",
  "// TODO: handle [0] and {} edge-cases -> fallback",
  "type Result = { ok: true; value: number[] } | { ok: false; error: string };",
  "const pct = Math.round((done / total) * 100) + '%';",
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(css: string, body: string, bodyStyle = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0}::-webkit-scrollbar{display:none}
body{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;${bodyStyle}}
${css}</style></head><body>${body}</body></html>`;
}

const pick = (arr: string[], i: number) => arr[i % arr.length];

// ---------------------------------------------------------------------------

export function webClean() {
  return page(
    `.nav{display:flex;gap:28px;align-items:center;padding:18px 48px;border-bottom:1px solid #e5e7eb;font-size:15px}
     .nav b{font-size:20px;margin-right:24px}.hero{padding:48px 48px 24px;max-width:900px}
     h1{font-size:44px;margin:0 0 14px}.lead{font-size:20px;color:#374151;line-height:1.5}
     .btns{display:flex;gap:14px;margin:24px 0}.btn{padding:12px 22px;border-radius:8px;font-size:16px;font-weight:600}
     .p{background:#2563eb;color:#fff}.s{border:1px solid #d1d5db;color:#111}
     .feat{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:12px 48px 48px}
     .feat h3{margin:0 0 6px;font-size:18px}.feat p{margin:0;font-size:15px;color:#4b5563;line-height:1.5}`,
    `<div class="nav"><b>Brightpath</b><span>Product</span><span>Pricing</span><span>Docs</span><span>Blog</span><span>Sign in</span></div>
     <div class="hero"><h1>Plan your week in minutes</h1>
     <div class="lead">${SENTENCES[6]} ${SENTENCES[12]}</div>
     <div class="btns"><span class="btn p">Start free trial</span><span class="btn s">Book a demo</span></div></div>
     <div class="feat">
       <div><h3>Shared calendars</h3><p>${SENTENCES[3]}</p></div>
       <div><h3>Smart reminders</h3><p>${SENTENCES[1]}</p></div>
       <div><h3>Private by default</h3><p>${SENTENCES[2]}</p></div>
     </div>`,
    "color:#111827;background:#fff",
  );
}

export function article(opts: { dark?: boolean; lowContrast?: boolean; blur?: boolean; paragraphs?: number; seed?: number } = {}) {
  const n = opts.paragraphs ?? 4;
  const s = opts.seed ?? 0;
  let body = `<h1>How small teams stay organised</h1><div class="meta">By the editorial team · 6 min read · March 14, 2026</div>`;
  for (let i = 0; i < n; i++) {
    if (i === 2) body += `<h2>Start with one shared list</h2>`;
    body += `<p>${pick(SENTENCES, s + i * 3)} ${pick(SENTENCES, s + i * 3 + 1)} ${pick(SENTENCES, s + i * 3 + 2)}</p>`;
  }
  const fg = opts.lowContrast ? "#8f8f8f" : opts.dark ? "#d4d4d4" : "#1a1a1a";
  const bg = opts.lowContrast ? "#c9c9c9" : opts.dark ? "#121212" : "#ffffff";
  return page(
    `main{max-width:760px;padding:40px 48px}
     h1{font-family:"Segoe UI",Arial,sans-serif;font-size:36px;margin:0 0 8px}
     h2{font-family:"Segoe UI",Arial,sans-serif;font-size:24px;margin:28px 0 4px}
     .meta{font-size:14px;opacity:.75;margin-bottom:18px}
     p{font-family:Georgia,"Times New Roman",serif;font-size:18px;line-height:1.6;margin:0 0 16px}`,
    `<main${opts.blur ? ' style="filter:blur(0.8px)"' : ""}>${body}</main>`,
    `color:${fg};background:${bg}`,
  );
}

export function twoColumn() {
  const col = (k: number) =>
    `<div class="col"><h2>${k === 0 ? "Left column" : "Right column"}</h2>${[0, 1, 2]
      .map((i) => `<p>${pick(SENTENCES, k * 7 + i * 2)} ${pick(SENTENCES, k * 7 + i * 2 + 1)}</p>`)
      .join("")}</div>`;
  return page(
    `main{padding:36px 48px;max-width:1100px}h1{font-size:32px;margin:0 0 18px}
     .cols{display:grid;grid-template-columns:1fr 1fr;gap:48px}h2{font-size:20px;margin:0 0 8px}
     p{font-family:Georgia,serif;font-size:17px;line-height:1.55;margin:0 0 14px}`,
    `<main><h1>Quarterly update</h1><div class="cols">${col(0)}${col(1)}</div></main>`,
    "color:#111;background:#fff",
  );
}

export function settingsDesktop() {
  const nav = ["General", "Account", "Notifications", "Privacy", "Storage", "Language", "About"];
  const rows = [
    ["Display name", "Shown to people you share with", "Alex Morgan"],
    ["Email address", "Used for sign-in and receipts", "alex@example.com"],
    ["Time zone", "Affects reminders and due dates", "UTC+05:30"],
    ["Start of week", "First day shown in calendars", "Monday"],
    ["Auto-save drafts", "Save changes every 30 seconds", "On"],
    ["Download quality", "Higher quality uses more data", "High"],
    ["Storage used", "Across all devices", "3.2 GB of 15 GB"],
  ];
  return page(
    `.wrap{display:grid;grid-template-columns:220px 1fr;min-height:640px}
     .side{background:#f3f4f6;padding:24px 16px;font-size:15px}.side div{padding:9px 12px;border-radius:6px}
     .side .on{background:#e0e7ff;color:#3730a3;font-weight:600}
     .main{padding:28px 40px}h1{font-size:26px;margin:0 0 20px}
     .row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #e5e7eb}
     .l b{display:block;font-size:15px}.l span{font-size:13px;color:#6b7280}.v{font-size:15px;color:#111}`,
    `<div class="wrap"><div class="side">${nav.map((n, i) => `<div class="${i === 0 ? "on" : ""}">${n}</div>`).join("")}</div>
     <div class="main"><h1>General settings</h1>${rows.map(([a, b, c]) => `<div class="row"><div class="l"><b>${a}</b><span>${b}</span></div><div class="v">${c}</div></div>`).join("")}</div></div>`,
    "color:#111827;background:#fff",
  );
}

export function chat(opts: { dark?: boolean; messages?: number; seed?: number; lang?: "en" | "hi" | "mixed"; fontPx?: number } = {}) {
  const dark = !!opts.dark;
  const n = opts.messages ?? 12;
  const seed = opts.seed ?? 0;
  const emojis = ["👍", "😂", "🎉", "🙏", "☕"];
  let items = "";
  let minute = 9 * 60 + 5;
  for (let i = 0; i < n; i++) {
    if (i % 9 === 0) items += `<div class="day"><span>${["Yesterday", "Today", "Monday"][(i / 9) % 3 | 0]}</span></div>`;
    const out = (i * 7 + seed) % 3 === 0;
    minute += 1 + ((i * 5 + seed) % 4);
    let text: string;
    if (opts.lang === "hi") text = pick(HINDI, i + seed);
    else if (opts.lang === "mixed") text = pick(MIXED_EN_HI, i + seed);
    else {
      const long = i % 4 === 1;
      text = long ? `${pick(SENTENCES, i + seed)} ${pick(SENTENCES, i + seed + 5)}` : pick(SENTENCES, i + seed).split(" ").slice(0, 3 + (i % 5)).join(" ");
      if (i % 5 === 2) text += ` ${emojis[i % emojis.length]}`;
    }
    const hh = String((minute / 60) | 0).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    items += `<div class="msg ${out ? "out" : "in"}"><div class="b"><span class="t">${esc(text)}</span><span class="ts">${hh}:${mm}</span></div></div>`;
  }
  const bg = dark ? "#0b141a" : "#efeae2";
  const fs = opts.fontPx ?? 15;
  return page(
    `.bar{height:58px;background:${dark ? "#1f2c34" : "#f0f2f5"};display:flex;align-items:center;gap:12px;padding:0 12px;border-bottom:1px solid ${dark ? "#2a3942" : "#d1d7db"}}
     .av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6ab7ff,#9c6bff)}
     .name{font-weight:600;font-size:16px}.sub{font-size:12px;color:${dark ? "#8696a0" : "#667781"}}
     .list{padding:8px 10px 16px}.msg{display:flex;margin:4px 0}.msg.out{justify-content:flex-end}
     .b{max-width:78%;padding:6px 9px 7px;border-radius:8px;line-height:1.35;font-size:${fs}px;display:flex;flex-wrap:wrap;align-items:flex-end;gap:0 10px}
     .in .b{background:${dark ? "#202c33" : "#fff"}}.out .b{background:${dark ? "#005c4b" : "#d9fdd3"}}
     .ts{font-size:11px;color:${dark ? "#8696a0" : "#667781"};margin-left:auto}
     .day{text-align:center;margin:10px 0}.day span{background:${dark ? "#182229" : "#fff"};color:${dark ? "#8696a0" : "#54656f"};font-size:12px;padding:4px 10px;border-radius:7px}`,
    `<div class="bar"><div class="av" data-ocr-ignore></div><div><div class="name">Project group</div><div class="sub">Alex, Sam, Priya, You</div></div></div><div class="list">${items}</div>`,
    `background:${bg};color:${dark ? "#e9edef" : "#111b21"}${opts.lang && opts.lang !== "en" ? ';font-family:"Nirmala UI","Mangal","Segoe UI",sans-serif' : ""}`,
  );
}

export function phoneSettings(opts: { fontPx: number; rows?: number; dense?: boolean }) {
  const labels = [
    ["Airplane Mode", "Off"], ["Wi-Fi", "HomeNet-5G"], ["Bluetooth", "On"], ["Mobile Data", "4G"], ["Personal Hotspot", "Off"],
    ["Notifications", ""], ["Sounds & Haptics", ""], ["Focus", "Work"], ["Screen Time", "2h 14m"], ["General", ""],
    ["Display & Brightness", "Auto"], ["Wallpaper", ""], ["Battery", "82%"], ["Privacy & Security", ""], ["Passwords", ""],
    ["Storage", "41.3 GB used"], ["Software Update", "v18.2.1"], ["Keyboard", "English (US)"], ["Date & Time", "24-hour"], ["VPN", "Not Connected"],
  ];
  const n = opts.rows ?? labels.length;
  const pad = opts.dense ? 7 : 11;
  return page(
    `h1{font-size:${Math.round(opts.fontPx * 2)}px;margin:14px 16px 8px}.grp{background:#fff;margin:8px 12px;border-radius:10px}
     .r{display:flex;justify-content:space-between;padding:${pad}px 14px;border-bottom:1px solid #e5e5ea;font-size:${opts.fontPx}px}
     .r span:last-child{color:#8e8e93}.note{font-size:${Math.max(9, opts.fontPx - 2)}px;color:#6d6d72;margin:6px 26px 12px;line-height:1.35}`,
    `<h1>Settings</h1><div class="grp">${labels
      .slice(0, n)
      .map(([a, b]) => `<div class="r"><span>${a}</span>${b ? `<span>${b}</span>` : ""}</div>`)
      .join("")}</div><div class="note">${SENTENCES[2]} ${SENTENCES[8]}</div>`,
    "background:#f2f2f7;color:#000",
  );
}

export function codeEditor(opts: { dark: boolean; lineNumbers: boolean }) {
  const lines = CODE_LINES.map(
    (l, i) =>
      `<div class="l">${opts.lineNumbers ? `<span class="n">${i + 1}</span>` : ""}<span class="c">${l === "" ? "&nbsp;" : esc(l)}</span></div>`,
  ).join("");
  const d = opts.dark;
  return page(
    `.tabs{display:flex;background:${d ? "#252526" : "#f3f3f3"};font-size:13px}.tabs span{padding:8px 16px;color:${d ? "#969696" : "#616161"}}
     .tabs span.a{background:${d ? "#1e1e1e" : "#fff"};color:${d ? "#fff" : "#333"}}
     .code{padding:12px 0 24px;font-family:Consolas,"Courier New",monospace;font-size:14px}
     .l{height:21px;line-height:21px;white-space:pre}.n{display:inline-block;width:44px;text-align:right;padding-right:16px;color:${d ? "#858585" : "#237893"}}
     .c{color:${d ? "#d4d4d4" : "#1f1f1f"}}`,
    `<div class="tabs"><span class="a">transform.ts</span><span>index.ts</span></div><div class="code">${lines}</div>`,
    `background:${d ? "#1e1e1e" : "#ffffff"}`,
  );
}

export function table() {
  const first = ["Alex", "Sam", "Priya", "Jordan", "Mei", "Omar", "Lena", "Ravi", "Chen", "Ana", "Tom", "Ivy"];
  const last = ["Park", "Singh", "Garcia", "Kim", "Novak", "Silva", "Ito", "Brown"];
  const status = ["Paid", "Pending", "Overdue", "Paid"];
  let rows = "";
  for (let i = 0; i < 12; i++) {
    const amount = ((i * 7919) % 500000) / 100 + 12;
    rows += `<tr><td>INV-${1041 + i}</td><td>${first[i]} ${last[(i * 3) % last.length]}</td><td>2026-0${1 + (i % 9)}-${String(3 + ((i * 5) % 25)).padStart(2, "0")}</td><td class="num">$${amount.toFixed(2)}</td><td>${status[i % status.length]}</td></tr>`;
  }
  return page(
    `.wrap{padding:28px 32px}h1{font-size:22px;margin:0 0 14px}table{width:100%;border-collapse:collapse;font-size:15px}
     th,td{padding:9px 14px;text-align:left;border-bottom:1px solid #e2e8f0}th{background:#f1f5f9;color:#334155;font-size:13px}
     tr:nth-child(even) td{background:#f8fafc}.num{text-align:right;font-variant-numeric:tabular-nums}`,
    `<div class="wrap"><h1>Invoices — March 2026</h1><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    "color:#0f172a;background:#fff",
  );
}

export function receipt() {
  const items: [string, number, number][] = [
    ["Flat white", 2, 3.8],
    ["Blueberry muffin", 1, 2.95],
    ["Sparkling water 500ml", 3, 1.5],
    ["Avocado toast", 1, 7.25],
    ["Oat milk extra", 2, 0.4],
  ];
  const sub = items.reduce((s, [, q, p]) => s + q * p, 0);
  const tax = sub * 0.08;
  const line = (a: string, b: string, cls = "") => `<div class="ln ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return page(
    `.r{width:380px;margin:24px auto;background:#fff;padding:26px 24px;box-shadow:0 2px 10px rgba(0,0,0,.15);font-family:Consolas,"Courier New",monospace;font-size:14px;color:#222}
     .h{text-align:center;font-family:Georgia,serif;font-size:26px;font-weight:bold}.c{text-align:center;font-size:13px;margin:2px 0}
     .ln{display:flex;justify-content:space-between;margin:3px 0}.sep{border-top:1px dashed #999;margin:10px 0}
     .tot{font-size:18px;font-weight:bold}.ft{text-align:center;margin-top:14px;font-size:13px}`,
    `<div class="r"><div class="h">Corner Cafe</div><div class="c">12 Market Street, Springfield</div><div class="c">Tel 555-0142</div>
     <div class="sep"></div>${line("Date: 2026-03-14", "Time: 08:42")}${line("Order #7731", "Table 4")}<div class="sep"></div>
     ${items.map(([n, q, p]) => line(`${q} x ${n}`, (q * p).toFixed(2))).join("")}
     <div class="sep"></div>${line("Subtotal", sub.toFixed(2))}${line("Tax 8%", tax.toFixed(2))}${line("TOTAL", `$${(sub + tax).toFixed(2)}`, "tot")}
     ${line("Card **** 4417", "APPROVED")}<div class="ft">Thank you for visiting!</div></div>`,
    "background:#e5e7eb",
  );
}

export function mixedCards() {
  const cards = [
    ["Recent uploads", "12 files this week", "Active"],
    ["Shared with you", "4 new folders", "New"],
    ["Storage", "3.2 GB of 15 GB used", "21%"],
  ];
  return page(
    `main{padding:32px 40px;max-width:1100px}h1{font-size:30px;margin:0 0 6px}.lead{font-size:17px;color:#4b5563;margin:0 0 18px;max-width:720px;line-height:1.5}
     .btns{display:flex;gap:12px;margin-bottom:26px}.btn{padding:10px 18px;border-radius:8px;font-size:15px;font-weight:600;background:#111827;color:#fff}
     .btn.o{background:#fff;color:#111827;border:1px solid #d1d5db}
     .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card{border:1px solid #e5e7eb;border-radius:12px;padding:18px}
     .card h3{margin:0 0 6px;font-size:18px}.card p{margin:0 0 12px;color:#6b7280;font-size:15px}
     .badge{display:inline-block;background:#dcfce7;color:#166534;font-size:12px;padding:3px 9px;border-radius:999px;font-weight:600}
     .foot{margin-top:24px;font-size:14px;color:#6b7280}`,
    `<main><h1>Your workspace</h1><p class="lead">${SENTENCES[14]} ${SENTENCES[17]}</p>
     <div class="btns"><span class="btn">Upload files</span><span class="btn o">Create folder</span><span class="btn o">Invite people</span></div>
     <div class="cards">${cards.map(([a, b, c]) => `<div class="card"><h3>${a}</h3><p>${b}</p><span class="badge">${c}</span></div>`).join("")}</div>
     <p class="foot">Last synced 2 minutes ago · Version 4.7.2</p></main>`,
    "color:#111827;background:#fff",
  );
}

export function hindiArticle() {
  return page(
    `main{max-width:760px;padding:36px 44px}h1{font-size:32px;margin:0 0 14px}p{font-size:20px;line-height:1.7;margin:0 0 14px}`,
    `<main><h1>आज की मुख्य खबरें</h1><p>${HINDI.slice(0, 4).join(" ")}</p><p>${HINDI.slice(4, 8).join(" ")}</p><p>${HINDI.slice(8).join(" ")}</p></main>`,
    'font-family:"Nirmala UI","Mangal",sans-serif;color:#111;background:#fff',
  );
}
