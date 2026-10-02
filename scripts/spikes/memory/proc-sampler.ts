import { execFile, spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

export interface ProcSample {
  t: number;
  total: { priv: number; ws: number };
  procs: { pid: number; name: string; priv: number; ws: number }[];
}

const DISCOVER = `
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "ExecutablePath like '%ms-playwright%'" | ForEach-Object {
  $cl = [string]$_.CommandLine
  $m = [regex]::Match($cl, '--type=([\\w-]+)')
  if ($m.Success) { $t = $m.Groups[1].Value }
  elseif ($cl -match '-contentproc') { $t = 'content-' + (($cl.Trim() -split '\\s+')[-1]) }
  else { $t = ($_.Name -replace '\\.exe$', '') }
  "$($_.ProcessId):$t"
}`;

/**
 * OS-level memory sampler for the Playwright browser process tree (Windows).
 * Private bytes (commit charge) is the primary metric; working set is recorded too.
 */
export class ProcSampler {
  private child: ChildProcess | null = null;
  readonly samples: ProcSample[] = [];
  private readonly pidFile = join(process.cwd(), ".cache", "spike-b", "sampler-pids.txt");

  start(intervalMs = 50): Promise<void> {
    writeFileSync(this.pidFile, "");
    const script = join(process.cwd(), "scripts", "spikes", "memory", "sample-processes.ps1");
    this.child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-IntervalMs", String(intervalMs), "-PidFile", this.pidFile], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const rl = createInterface({ input: this.child.stdout! });
    return new Promise((resolve) => {
      rl.on("line", (line) => {
        const [t, rest] = line.split("|");
        const procs = (rest ?? "")
          .split(",")
          .filter(Boolean)
          .map((s) => {
            const [pid, name, priv, ws] = s.split(":");
            return { pid: +pid, name, priv: +priv, ws: +ws };
          });
        const total = procs.reduce((a, p) => ({ priv: a.priv + p.priv, ws: a.ws + p.ws }), { priv: 0, ws: 0 });
        this.samples.push({ t: +t, total, procs });
        resolve(); // first line (possibly before any browser process exists)
      });
    });
  }

  /** Re-discover the browser's processes (slow CIM query, ~0.5–1 s). Call when idle. */
  async discover(): Promise<number> {
    const { stdout } = await promisify(execFile)("powershell", ["-NoProfile", "-Command", DISCOVER], { maxBuffer: 1 << 20 });
    const lines = stdout.split(/\r?\n/).filter((l) => /^\d+:/.test(l));
    writeFileSync(this.pidFile, lines.join("\n") + "\n");
    return lines.length;
  }

  async waitFor(t: number, timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if ((this.samples.at(-1)?.t ?? 0) >= t) return;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  window(from: number, to: number) {
    return this.samples.filter((s) => s.t >= from && s.t <= to);
  }

  stop() {
    this.child?.kill();
    this.child = null;
  }
}
