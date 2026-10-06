# Finds the settlement dots on the map image (solid white dots and white-ring dots) and writes
# their pixel centres to quartz/static/map/candidates.json. The map page shows these as numbered
# markers while the "Coordinates" button is on, so unnamed places can be named quickly.
#
#   .\tools\map\find-dots.ps1 -Source "C:\path\to\Eryndor Full Map 02.jpg"
param(
  [string]$Source = "C:\Users\roger\OneDrive\Champions Guild\Eryndor\Eryndor Full Map 01.jpg",
  [string]$Out = "$PSScriptRoot\..\..\quartz\static\map\candidates.json"
)
$ErrorActionPreference = "Stop"
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class DotFinder {
  // returns rows of {cx, cy, area, boxW, boxH, kind}  kind: 1 = solid white dot, 2 = white ring with dark centre
  public static List<int[]> Find(string path, int minArea, int maxArea, int maxDim) {
    var res = new List<int[]>();
    using (var bmp = new Bitmap(path)) {
      int w = bmp.Width, h = bmp.Height;
      var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
      int stride = data.Stride;
      byte[] px = new byte[stride * h];
      Marshal.Copy(data.Scan0, px, 0, px.Length);
      bmp.UnlockBits(data);
      var mask = new bool[w * h];
      for (int y = 0; y < h; y++) {
        int row = y * stride;
        for (int x = 0; x < w; x++) {
          int i = row + x * 3;
          int b = px[i], g = px[i + 1], r = px[i + 2];
          int mx = Math.Max(r, Math.Max(g, b)), mn = Math.Min(r, Math.Min(g, b));
          if (mn > 185 && mx - mn < 40) mask[y * w + x] = true;   // near-white, low saturation
        }
      }
      var seen = new bool[w * h];
      var stack = new Stack<int>();
      for (int s = 0; s < w * h; s++) {
        if (!mask[s] || seen[s]) continue;
        stack.Push(s); seen[s] = true;
        long sx = 0, sy = 0; int n = 0; int minx = w, maxx = 0, miny = h, maxy = 0;
        while (stack.Count > 0) {
          int p = stack.Pop();
          int x = p % w, y = p / w;
          n++; sx += x; sy += y;
          if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
          if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = true; stack.Push(p - 1); }
          if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = true; stack.Push(p + 1); }
          if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = true; stack.Push(p - w); }
          if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = true; stack.Push(p + w); }
        }
        int bw = maxx - minx + 1, bh = maxy - miny + 1;
        if (n < minArea || n > maxArea || bw > maxDim || bh > maxDim) continue;
        if (Math.Abs(bw - bh) > Math.Max(3, bw / 3)) continue;        // roughly square box
        double fill = n / (double)(bw * bh);
        int ccx = (int)(sx / n), ccy = (int)(sy / n);
        int cj = ccy * stride + ccx * 3; int clum = (px[cj] + px[cj + 1] + px[cj + 2]) / 3;
        int kind;
        if (fill >= 0.6 && clum > 150) kind = 1;                                   // solid white disc
        else if (fill >= 0.25 && fill < 0.65 && clum < 90 && bw >= 16) kind = 2;  // white ring, dark centre
        else continue;
        // settlement symbols have a dark outline just outside the white; snow blobs do not
        double rr = bw / 2.0 + 3.5; int dark = 0, tot = 0;
        for (int k = 0; k < 24; k++) {
          double a = k * Math.PI / 12;
          int qx = ccx + (int)Math.Round(rr * Math.Cos(a)), qy = ccy + (int)Math.Round(rr * Math.Sin(a));
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          int j = qy * stride + qx * 3; int lum = (px[j] + px[j + 1] + px[j + 2]) / 3;
          tot++; if (lum < 110) dark++;
        }
        if (tot == 0 || dark < tot * 0.6) continue;
        res.Add(new[] { ccx, ccy, n, bw, bh, kind });
      }
    }
    return res;
  }
}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

$sw = [Diagnostics.Stopwatch]::StartNew()
$rows = [DotFinder]::Find($Source, 60, 1500, 40)
"scanned in $([int]$sw.Elapsed.TotalSeconds)s, $($rows.Count) raw candidates"

# keep plausible symbol sizes only (tuned for a 10240 px wide export)
$good = @($rows | Where-Object { ($_[5] -eq 1 -and $_[3] -ge 10 -and $_[3] -le 22) -or ($_[5] -eq 2 -and $_[3] -ge 16 -and $_[3] -le 34) })
$list = @($good | ForEach-Object { [pscustomobject]@{ x = $_[0]; y = $_[1]; style = $(if ($_[5] -eq 2) { "ring" } else { "solid" }) } } | Sort-Object y, x)
$solid = @($list | Where-Object style -eq "solid").Count
$ring = @($list | Where-Object style -eq "ring").Count
$list | ConvertTo-Json -Compress | Set-Content -Encoding utf8 $Out
"wrote $($list.Count) dots ($solid solid, $ring ring) to $Out"
