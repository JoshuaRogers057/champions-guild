param(
  [string]$Source = "C:\Users\roger\OneDrive\Champions Guild\Eryndor\Eryndor Full Map 01.jpg",
  [string]$OutRoot = "$PSScriptRoot\..\..\quartz\static\map\tiles",
  [int]$TileSize = 256,
  [int]$MaxZoom = 5,
  [long]$Quality = 82
)
# Slices a large map image into a Leaflet-style tile pyramid: {z}/{x}/{y}.jpg
#   .\tools\map\make-tiles.ps1 -Source "C:\path\to\Eryndor Full Map 02.jpg"
# Zoom MaxZoom is native resolution; each lower zoom is half the size.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

if (Test-Path $OutRoot) { Remove-Item -Recurse -Force $OutRoot }
New-Item -ItemType Directory -Force $OutRoot | Out-Null

$img = [System.Drawing.Image]::FromFile($Source)
$W = $img.Width; $H = $img.Height
"source: ${W}x${H}"

$full = New-Object System.Drawing.Bitmap $img
$img.Dispose()
$pad = $full.GetPixel(4, $H - 5)   # ocean colour used to pad edge tiles
"pad colour: $($pad.R),$($pad.G),$($pad.B)"

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$enc = New-Object System.Drawing.Imaging.EncoderParameters 1
$enc.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, $Quality)

$level = $full
$count = 0
for ($z = $MaxZoom; $z -ge 0; $z--) {
  if ($z -lt $MaxZoom) {
    # progressive halving for clean downsampling
    $w = [int][math]::Ceiling($level.Width / 2); $h = [int][math]::Ceiling($level.Height / 2)
    $next = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($next)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.CompositingQuality = 'HighQuality'
    $g.DrawImage($level, 0, 0, $w, $h)
    $g.Dispose()
    $level.Dispose()
    $level = $next
  }
  $w = $level.Width; $h = $level.Height
  $cols = [int][math]::Ceiling($w / $TileSize); $rows = [int][math]::Ceiling($h / $TileSize)
  for ($x = 0; $x -lt $cols; $x++) {
    $dir = Join-Path $OutRoot "$z\$x"
    New-Item -ItemType Directory -Force $dir | Out-Null
    for ($y = 0; $y -lt $rows; $y++) {
      $sw = [math]::Min($TileSize, $w - $x * $TileSize)
      $sh = [math]::Min($TileSize, $h - $y * $TileSize)
      $t = New-Object System.Drawing.Bitmap $TileSize, $TileSize
      $g = [System.Drawing.Graphics]::FromImage($t)
      $g.Clear($pad)
      $g.InterpolationMode = 'NearestNeighbor'
      $g.PixelOffsetMode = 'Half'
      $srcRect = New-Object System.Drawing.Rectangle ($x * $TileSize), ($y * $TileSize), $sw, $sh
      $dstRect = New-Object System.Drawing.Rectangle 0, 0, $sw, $sh
      $g.DrawImage($level, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose()
      $t.Save((Join-Path $dir "$y.jpg"), $codec, $enc)
      $t.Dispose()
      $count++
    }
  }
  "zoom $z : ${w}x${h} -> ${cols}x${rows} tiles"
}
$level.Dispose()
"total tiles: $count"
$bytes = (Get-ChildItem $OutRoot -Recurse -File | Measure-Object Length -Sum).Sum
"total size: {0:N1} MB" -f ($bytes / 1MB)

