/**
 * Spike D — long-screenshot scenes for pagination benchmarks. Synthetic, original content.
 * Content regions are tagged with data-region="<type>" so ground truth is exact.
 */
import { CODE_LINES, SENTENCES } from "../ocr-fixtures/scenes";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pick = <T,>(a: T[], i: number) => a[((i % a.length) + a.length) % a.length];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function page(css: string, body: string, bodyStyle = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0}::-webkit-scrollbar{display:none}
body{font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;${bodyStyle}}
${css}</style></head><body>${body}</body></html>`;
}

const para = (r: () => number, n = 3) => Array.from({ length: n }, () => pick(SENTENCES, Math.floor(r() * 1000))).join(" ");

export function article(opts: { sections: number; seed: number; photos?: boolean }) {
  const r = rng(opts.seed);
  let body = `<h1 data-region="heading">A practical guide to working with screenshots</h1>`;
  for (let s = 0; s < opts.sections; s++) {
    body += `<h2 data-region="heading">${s + 1}. ${pick(SENTENCES, s * 7).split(" ").slice(0, 5).join(" ")}</h2>`;
    const n = 2 + Math.floor(r() * 3);
    for (let p = 0; p < n; p++) body += `<p data-region="paragraph">${para(r, 2 + Math.floor(r() * 3))}</p>`;
    if (r() < 0.4) body += `<ul>${Array.from({ length: 3 + Math.floor(r() * 3) }, () => `<li data-region="list-item">${pick(SENTENCES, Math.floor(r() * 99))}</li>`).join("")}</ul>`;
    if (r() < 0.25) body += `<blockquote data-region="paragraph">${para(r, 1)}</blockquote>`;
    if (opts.photos && s % 2 === 0) {
      const h = 260 + Math.floor(r() * 260);
      body += `<figure data-region="image" style="height:${h}px;background:linear-gradient(${Math.floor(r() * 180)}deg,hsl(${Math.floor(r() * 360)} 60% 55%),hsl(${Math.floor(r() * 360)} 60% 35%))"></figure>`;
    }
  }
  return page(
    `main{padding:20px 18px 40px}h1{font-size:26px;line-height:1.2;margin:0 0 14px}h2{font-size:20px;margin:26px 0 8px}
     p,blockquote{font-size:16px;line-height:1.55;margin:0 0 12px}ul{padding-left:22px;margin:0 0 12px}li{font-size:16px;line-height:1.5;margin:4px 0}
     blockquote{border-left:3px solid #3b82f6;padding-left:12px;color:#444;font-style:italic}figure{margin:16px 0;border-radius:8px}`,
    `<main>${body}</main>`,
    "background:#fff;color:#1a1a1a;font-family:Georgia,serif",
  );
}

export function chat(opts: { messages: number; seed: number; dark?: boolean; giantAt?: number }) {
  const r = rng(opts.seed);
  const dark = !!opts.dark;
  let items = "";
  let minute = 8 * 60;
  for (let i = 0; i < opts.messages; i++) {
    if (i % 14 === 0) items += `<div class="day"><span data-region="chat-message">${["Monday", "Tuesday", "Yesterday", "Today"][(i / 14) % 4 | 0]}</span></div>`;
    const out = r() < 0.45;
    minute += 1 + Math.floor(r() * 5);
    const big = opts.giantAt === i;
    const len = big ? 40 : r() < 0.25 ? 3 + Math.floor(r() * 4) : 1;
    const text = r() < 0.3 && !big ? pick(SENTENCES, i).split(" ").slice(0, 3 + Math.floor(r() * 3)).join(" ") : para(r, len);
    items += `<div class="msg ${out ? "out" : "in"}"><div class="b" data-region="chat-message"><span>${esc(text)}</span><span class="ts">${String((minute / 60) | 0).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}</span></div></div>`;
  }
  return page(
    `.bar{height:56px;background:${dark ? "#1f2c34" : "#f0f2f5"};display:flex;align-items:center;padding:0 14px;font-weight:600}
     .list{padding:8px 10px 20px}.msg{display:flex;margin:5px 0}.msg.out{justify-content:flex-end}
     .b{max-width:80%;padding:7px 10px 8px;border-radius:8px;line-height:1.38;font-size:15px;display:flex;flex-wrap:wrap;align-items:flex-end;gap:0 10px}
     .in .b{background:${dark ? "#202c33" : "#fff"}}.out .b{background:${dark ? "#005c4b" : "#d9fdd3"}}
     .ts{font-size:11px;color:${dark ? "#8696a0" : "#667781"};margin-left:auto}
     .day{text-align:center;margin:12px 0}.day span{background:${dark ? "#182229" : "#fff"};color:${dark ? "#8696a0" : "#54656f"};font-size:12px;padding:4px 10px;border-radius:7px}`,
    `<div class="bar" data-region="heading">Project group</div><div class="list">${items}</div>`,
    `background:${dark ? "#0b141a" : "#efeae2"};color:${dark ? "#e9edef" : "#111b21"}`,
  );
}

export function code(opts: { repeats: number; dense?: boolean }) {
  const lines: string[] = [];
  for (let k = 0; k < opts.repeats; k++) {
    lines.push(`// Section ${k + 1}: coordinate helpers (generated for the benchmark)`);
    for (const l of CODE_LINES) if (!opts.dense || l.trim() !== "") lines.push(l.replace("mapBox", `mapBox${k}`));
    if (!opts.dense) lines.push("");
  }
  const lh = opts.dense ? 16 : 21;
  return page(
    `.code{padding:10px 0 24px;font-family:Consolas,"Courier New",monospace;font-size:14px}
     .l{height:${lh}px;line-height:${lh}px;white-space:pre}.n{display:inline-block;width:48px;text-align:right;padding-right:16px;color:#858585}
     .c{color:#d4d4d4}.cm{color:#6a9955}`,
    `<div class="code">${lines
      .map((l, i) => `<div class="l"${l.trim() ? ' data-region="code-line"' : ""}><span class="n">${i + 1}</span><span class="${l.trim().startsWith("//") ? "cm" : "c"}">${l ? esc(l) : "&nbsp;"}</span></div>`)
      .join("")}</div>`,
    "background:#1e1e1e",
  );
}

export function table(opts: { rows: number; dense?: boolean; seed: number }) {
  const r = rng(opts.seed);
  const names = ["Alex Park", "Sam Singh", "Priya Garcia", "Jordan Kim", "Mei Novak", "Omar Silva", "Lena Ito", "Ravi Brown"];
  let rows = "";
  for (let i = 0; i < opts.rows; i++) {
    rows += `<tr data-region="table-row"><td>INV-${2001 + i}</td><td>${pick(names, i * 3)}</td><td class="num">$${(r() * 900 + 10).toFixed(2)}</td><td>${["Paid", "Due", "Late"][i % 3]}</td></tr>`;
  }
  const pad = opts.dense ? "3px 8px" : "10px 10px";
  return page(
    `.w{padding:14px 10px}h1{font-size:20px;margin:4px 4px 12px}table{width:100%;border-collapse:collapse;font-size:14px}
     th,td{padding:${pad};text-align:left;border-bottom:1px solid ${opts.dense ? "#eef2f7" : "#d7dee8"}}th{background:#eef2f7;font-size:12px}
     tr:nth-child(even) td{background:${opts.dense ? "#fbfcfe" : "#f6f8fb"}}.num{text-align:right}`,
    `<div class="w"><h1 data-region="heading">Invoices</h1><table><thead><tr data-region="table-row"><th>Invoice</th><th>Customer</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    "background:#fff;color:#0f172a",
  );
}

export function settings(opts: { sections: number; seed: number; dense?: boolean }) {
  const r = rng(opts.seed);
  const labels = ["Display name", "Email", "Phone", "Language", "Time zone", "Theme", "Notifications", "Backup", "Storage", "Password", "Two-step login", "Devices"];
  let body = "";
  for (let s = 0; s < opts.sections; s++) {
    body += `<h2 data-region="heading">${pick(["Account", "Preferences", "Privacy", "Security", "Storage", "About"], s)}</h2>`;
    const n = 3 + Math.floor(r() * 3);
    body += `<div class="card" data-region="card">${Array.from({ length: n }, (_, i) => `<div class="field" data-region="field"><label>${pick(labels, s * 5 + i)}</label><div class="v">${pick(SENTENCES, s * 3 + i).split(" ").slice(0, 3).join(" ")}</div></div>`).join("")}</div>`;
    body += `<p class="hint" data-region="paragraph">${pick(SENTENCES, s + 4)}</p>`;
  }
  const gap = opts.dense ? 2 : 18;
  return page(
    `main{padding:10px 12px}h2{font-size:14px;text-transform:uppercase;color:#6b7280;margin:${gap}px 6px 6px}
     .card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;margin-bottom:${gap}px}
     .field{padding:${opts.dense ? 6 : 12}px 14px;border-bottom:1px solid #eef0f3}.field:last-child{border-bottom:0}
     label{display:block;font-size:12px;color:#6b7280}.v{font-size:16px}.hint{font-size:13px;color:#6b7280;margin:0 6px ${gap}px;line-height:1.4}`,
    `<main>${body}</main>`,
    "background:#f3f4f6;color:#111827",
  );
}

export function receipt(opts: { items: number; seed: number }) {
  const r = rng(opts.seed);
  const products = ["Flat white", "Oat latte", "Croissant", "Bagel", "Orange juice", "Granola bowl", "Sparkling water", "Muffin", "Tea", "Sandwich"];
  let total = 0;
  const line = (a: string, b: string, region = "receipt-row") => `<div class="ln" data-region="${region}"><span>${a}</span><span>${b}</span></div>`;
  let rows = "";
  for (let i = 0; i < opts.items; i++) {
    const q = 1 + Math.floor(r() * 3);
    const p = 1 + Math.floor(r() * 900) / 100;
    total += q * p;
    rows += line(`${q} x ${pick(products, i * 3 + q)}`, (q * p).toFixed(2));
    if (i % 12 === 11) rows += `<div class="sep"></div>`;
  }
  return page(
    `.r{margin:10px;background:#fff;padding:18px 16px;font-family:Consolas,monospace;font-size:14px;color:#222}
     .h{text-align:center;font-family:Georgia,serif;font-size:22px;font-weight:bold}.c{text-align:center;font-size:12px}
     .ln{display:flex;justify-content:space-between;margin:4px 0}.sep{border-top:1px dashed #999;margin:10px 0}.tot{font-size:17px;font-weight:bold}`,
    `<div class="r"><div class="h" data-region="heading">Corner Cafe</div><div class="c" data-region="paragraph">12 Market Street · Order #7731 · 2026-03-14 08:42</div><div class="sep"></div>${rows}<div class="sep"></div>${line("TOTAL", `$${total.toFixed(2)}`)}<div class="c" data-region="paragraph">Thank you for visiting!</div></div>`,
    "background:#e5e7eb",
  );
}
