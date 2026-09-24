/**
 * Deterministic HTML scenes for Smart Stitch benchmark fixtures.
 * Content is synthetic (seeded PRNG) — no real people/data.
 */

export type SceneName = "chat" | "article" | "code" | "table";

export interface SceneOptions {
  seed: number;
  dark?: boolean;
  /** Fixed header/footer chrome (repeated in every screenshot). */
  stickyHeader?: boolean;
  stickyFooter?: boolean;
  /** Many near-identical items (ambiguity stress). */
  repetitive?: boolean;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const WORDS =
  "the quick brown fox jumps over lazy dog screenshot stitch overlap browser local private fast canvas worker pixel meeting tomorrow lunch project deadline update review design ship build test release coffee weekend plan photo send call later maybe sure thanks great okay invoice budget draft notes agenda chart report login server client".split(
    " ",
  );

function sentence(r: () => number, min: number, max: number) {
  const n = min + Math.floor(r() * (max - min + 1));
  const w: string[] = [];
  for (let i = 0; i < n; i++) w.push(WORDS[Math.floor(r() * WORDS.length)]);
  const s = w.join(" ");
  return s[0].toUpperCase() + s.slice(1) + (r() < 0.2 ? "?" : ".");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function renderScene(name: SceneName, o: SceneOptions): string {
  switch (name) {
    case "chat":
      return chat(o);
    case "article":
      return article(o);
    case "code":
      return code(o);
    case "table":
      return table(o);
  }
}

function page(css: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0}::-webkit-scrollbar{display:none}
body{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
${css}</style></head><body>${body}</body></html>`;
}

function chat(o: SceneOptions) {
  const r = rng(o.seed);
  const dark = !!o.dark;
  const bg = dark ? "#0b141a" : "#efeae2";
  const inBg = dark ? "#202c33" : "#ffffff";
  const outBg = dark ? "#005c4b" : "#d9fdd3";
  const fg = dark ? "#e9edef" : "#111b21";
  const meta = dark ? "#8696a0" : "#667781";
  let items = "";
  let minute = 8 * 60 + 2;
  for (let i = 0; i < 90; i++) {
    if (i % 23 === 0) items += `<div class="day"><span>${["Monday", "Tuesday", "Yesterday", "Today"][(i / 23) | 0]}</span></div>`;
    const out = r() < 0.45;
    minute += Math.floor(r() * 4);
    const text = o.repetitive ? (r() < 0.5 ? "ok 👍" : "Sounds good") : sentence(r, 1, r() < 0.3 ? 28 : 10);
    items += `<div class="msg ${out ? "out" : "in"}"><div class="b">${text}<span class="t">${pad((minute / 60) | 0)}:${pad(minute % 60)}${out ? " ✓✓" : ""}</span></div></div>`;
  }
  const css = `
body{background:${bg};color:${fg};font-size:15px}
.status{position:fixed;top:0;left:0;right:0;height:47px;background:${dark ? "#1f2c34" : "#f0f2f5"};display:flex;align-items:center;justify-content:space-between;padding:0 28px;font-weight:600;font-size:15px;z-index:3}
.bar{position:fixed;top:47px;left:0;right:0;height:60px;background:${dark ? "#1f2c34" : "#f0f2f5"};display:flex;align-items:center;gap:12px;padding:0 12px;border-bottom:1px solid ${dark ? "#2a3942" : "#d1d7db"};z-index:3}
.av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#6ab7ff,#9c6bff)}
.name{font-weight:600}.sub{font-size:12px;color:${meta}}
.input{position:fixed;bottom:0;left:0;right:0;height:80px;background:${dark ? "#1f2c34" : "#f0f2f5"};display:flex;align-items:flex-start;padding:10px 10px 0;gap:8px;z-index:3}
.input .f{flex:1;height:42px;border-radius:21px;background:${dark ? "#2a3942" : "#fff"};color:${meta};display:flex;align-items:center;padding:0 16px}
.input .m{width:42px;height:42px;border-radius:50%;background:#00a884}
.list{padding:115px 10px 90px}
.msg{display:flex;margin:3px 0}.msg.out{justify-content:flex-end}
.b{max-width:78%;padding:6px 9px 8px;border-radius:8px;line-height:1.35;box-shadow:0 1px .5px rgba(0,0,0,.13)}
.in .b{background:${inBg}}.out .b{background:${outBg}}
.t{font-size:11px;color:${meta};margin-left:8px;float:right;margin-top:6px}
.day{text-align:center;margin:10px 0}.day span{background:${dark ? "#182229" : "#fff"};color:${meta};font-size:12px;padding:5px 12px;border-radius:8px}`;
  return page(
    css,
    `<div class="status"><span id="clock">9:41</span><span id="batt">▂▄▆ 100%</span></div>
<div class="bar"><div class="av"></div><div><div class="name">Project group</div><div class="sub">Alex, Sam, Priya, You</div></div></div>
<div class="list">${items}</div>
<div class="input"><div class="f">Message</div><div class="m"></div></div>`,
  );
}

function article(o: SceneOptions) {
  const r = rng(o.seed);
  const dark = !!o.dark;
  let body = `<h1>${sentence(r, 5, 9).replace(/\.$/, "")}</h1><p class="lede">${sentence(r, 18, 30)}</p>`;
  for (let s = 0; s < 14; s++) {
    body += `<h2>${sentence(r, 3, 6).replace(/[.?]$/, "")}</h2>`;
    const paras = 2 + Math.floor(r() * 3);
    for (let p = 0; p < paras; p++) body += `<p>${sentence(r, 20, 40)} ${sentence(r, 10, 30)}</p>`;
    if (r() < 0.45) {
      const h1 = Math.floor(r() * 360);
      const h2 = (h1 + 60 + Math.floor(r() * 120)) % 360;
      body += `<figure style="height:${160 + Math.floor(r() * 160)}px;background:linear-gradient(${Math.floor(r() * 180)}deg,hsl(${h1} 70% 60%),hsl(${h2} 70% 45%))"><figcaption>Figure ${s + 1}. ${sentence(r, 4, 9)}</figcaption></figure>`;
    }
    if (r() < 0.3) body += `<ul>${Array.from({ length: 3 + Math.floor(r() * 3) }, () => `<li>${sentence(r, 4, 12)}</li>`).join("")}</ul>`;
    if (r() < 0.2) body += `<blockquote>${sentence(r, 12, 22)}</blockquote>`;
  }
  const hdr = o.stickyHeader
    ? `<header class="nav"><b>Daily Pixel</b><span>News</span><span>Tech</span><span>Design</span><span>Science</span><span class="cta">Subscribe</span></header>`
    : "";
  const ftr = o.stickyFooter ? `<div class="cookie">We use cookies to improve this site. <u>Settings</u> <b>Accept</b></div>` : "";
  const css = `
body{background:${dark ? "#121212" : "#fff"};color:${dark ? "#ddd" : "#1a1a1a"};font-family:Georgia,"Times New Roman",serif;font-size:18px;line-height:1.6}
main{max-width:720px;margin:0 auto;padding:${o.stickyHeader ? 96 : 40}px 24px ${o.stickyFooter ? 90 : 40}px}
h1{font-size:40px;line-height:1.15;margin:0 0 16px;font-family:"Segoe UI",Arial,sans-serif}
h2{font-family:"Segoe UI",Arial,sans-serif;font-size:26px;margin:36px 0 8px}
.lede{font-size:21px;color:${dark ? "#aaa" : "#555"}}
figure{margin:24px 0;border-radius:8px;position:relative}
figcaption{position:absolute;bottom:-26px;font-size:14px;color:#777}
blockquote{border-left:4px solid #3b82f6;margin:24px 0;padding:4px 16px;font-style:italic;color:${dark ? "#bbb" : "#444"}}
.nav{position:fixed;top:0;left:0;right:0;height:64px;background:${dark ? "#1d1d1d" : "#fff"};border-bottom:1px solid #ddd;display:flex;align-items:center;gap:28px;padding:0 40px;font-family:"Segoe UI",Arial,sans-serif;font-size:16px;z-index:2}
.nav b{font-size:22px;margin-right:30px}.nav .cta{margin-left:auto;background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px}
.cookie{position:fixed;left:0;right:0;bottom:0;height:56px;background:#1f2937;color:#fff;display:flex;align-items:center;justify-content:center;gap:18px;font-family:"Segoe UI",Arial,sans-serif;font-size:15px;z-index:2}
.cookie b{background:#10b981;padding:6px 14px;border-radius:5px}`;
  return page(css, `${hdr}<main>${body}</main>${ftr}`);
}

function code(o: SceneOptions) {
  const r = rng(o.seed);
  const kw = ["const", "let", "return", "if", "for", "await", "export", "function", "import", "type"];
  const ids = ["offset", "proxy", "score", "image", "width", "height", "result", "config", "matrix", "worker", "seam", "band"];
  let lines = "";
  let indent = 0;
  for (let i = 1; i <= 260; i++) {
    const roll = r();
    let txt: string;
    if (roll < 0.1 && indent > 0) {
      indent--;
      txt = "}";
    } else if (roll < 0.22) {
      txt = `<i>${kw[7]}</i> <b>${ids[Math.floor(r() * ids.length)]}${pad(i % 97)}</b>(${ids[Math.floor(r() * ids.length)]}: <u>number</u>) {`;
      indent = Math.min(indent + 1, 4);
    } else if (roll < 0.3) {
      txt = "";
    } else if (roll < 0.38) {
      txt = `<s>// ${sentence(r, 3, 9)}</s>`;
    } else {
      txt = `<i>${kw[Math.floor(r() * 3)]}</i> ${ids[Math.floor(r() * ids.length)]} = ${ids[Math.floor(r() * ids.length)]}.${ids[Math.floor(r() * ids.length)]}(<em>${Math.floor(r() * 1000)}</em>, <q>"${WORDS[Math.floor(r() * WORDS.length)]}"</q>);`;
    }
    lines += `<div class="l"><span class="n">${i}</span>${"&nbsp;&nbsp;".repeat(indent)}${txt}</div>`;
  }
  const css = `
body{background:#1e1e1e;color:#d4d4d4;font-family:Consolas,"Courier New",monospace;font-size:14px}
.tabs{position:fixed;top:0;left:0;right:0;height:36px;background:#252526;display:flex;z-index:2}
.tabs span{padding:9px 16px;color:#999;border-right:1px solid #1e1e1e}.tabs span.a{background:#1e1e1e;color:#fff}
.code{padding:44px 0 30px}.l{height:20px;line-height:20px;white-space:pre}
.n{display:inline-block;width:56px;text-align:right;padding-right:18px;color:#6e7681}
i{color:#569cd6;font-style:normal}b{color:#dcdcaa;font-weight:normal}u{color:#4ec9b0;text-decoration:none}s{color:#6a9955;text-decoration:none}em{color:#b5cea8;font-style:normal}q{color:#ce9178;quotes:none}
.statusbar{position:fixed;bottom:0;left:0;right:0;height:22px;background:#007acc;color:#fff;font-family:"Segoe UI",sans-serif;font-size:12px;padding:3px 10px;z-index:2}`;
  return page(
    css,
    `<div class="tabs"><span class="a">analyse.ts</span><span>plan.ts</span><span>config.ts</span></div><div class="code">${lines}</div><div class="statusbar">main  ⟳  TypeScript  UTF-8  LF</div>`,
  );
}

function table(o: SceneOptions) {
  const r = rng(o.seed);
  const first = ["Alex", "Sam", "Priya", "Jordan", "Mei", "Omar", "Lena", "Ravi", "Chen", "Ana"];
  const last = ["Park", "Singh", "Garcia", "Kim", "Novak", "Silva", "Ito", "Brown"];
  const status = ["Paid", "Pending", "Overdue", "Paid", "Paid"];
  let rows = "";
  for (let i = 1; i <= 140; i++) {
    const st = status[Math.floor(r() * status.length)];
    rows += `<tr><td>INV-${1000 + i}</td><td>${first[Math.floor(r() * first.length)]} ${last[Math.floor(r() * last.length)]}</td><td>2026-0${1 + Math.floor(r() * 9)}-${pad(1 + Math.floor(r() * 28))}</td><td class="num">$${(r() * 5000).toFixed(2)}</td><td><span class="s ${st}">${st}</span></td></tr>`;
  }
  const css = `
body{background:#f8fafc;color:#0f172a;font-size:14px}
.top{position:fixed;top:0;left:0;right:0;height:56px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;padding:0 24px;font-weight:600;z-index:2}
.wrap{padding:72px 24px 24px}
table{width:100%;border-collapse:collapse;background:#fff}
th,td{padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:left}th{background:#f1f5f9;font-size:12px;text-transform:uppercase;color:#475569}
tr:nth-child(even) td{background:#fafcff}.num{text-align:right;font-variant-numeric:tabular-nums}
.s{padding:2px 8px;border-radius:10px;font-size:12px}.Paid{background:#dcfce7;color:#166534}.Pending{background:#fef9c3;color:#854d0e}.Overdue{background:#fee2e2;color:#991b1b}`;
  return page(
    css,
    `<div class="top">Invoices</div><div class="wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`,
  );
}
