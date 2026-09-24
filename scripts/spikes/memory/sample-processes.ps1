# Fast memory sampler for a given set of processes.
# The PID list ("<pid>:<type>" per line) is written by the Node runner to $PidFile after
# it discovers the browser's processes; this loop only reads the file and polls counters.
# Output, one line per sample:  <epochMs>|<pid>:<type>:<privateBytes>:<workingSet>,...
param([int]$IntervalMs = 50, [string]$PidFile)
$ErrorActionPreference = 'SilentlyContinue'
$lastStamp = $null
$entries = @()
while ($true) {
  $stamp = (Get-Item $PidFile).LastWriteTimeUtc
  if ($stamp -ne $lastStamp) {
    $entries = @(Get-Content $PidFile | Where-Object { $_ -match '^\d+:' } | ForEach-Object { $a = $_ -split ':', 2; [pscustomobject]@{ Id = [int]$a[0]; Type = $a[1] } })
    $lastStamp = $stamp
  }
  $parts = foreach ($e in $entries) {
    try {
      $p = [System.Diagnostics.Process]::GetProcessById($e.Id)
      "$($e.Id):$($e.Type):$($p.PrivateMemorySize64):$($p.WorkingSet64)"
      $p.Dispose()
    } catch {}
  }
  $t = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  $joined = $parts -join ','
  [Console]::Out.WriteLine("$t|$joined")
  Start-Sleep -Milliseconds $IntervalMs
}
