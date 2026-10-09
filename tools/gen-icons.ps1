<#
  生成 App 桌面图标 / PWA 图标（只改图标，不动开屏页）
  ------------------------------------------------------------------------------
  输入：仓库根目录的 icon-source.jpg（唯一图源，正方形或接近正方形，建议边长 >= 512）
  输出（全部写在仓库根目录，文件名保持不变 —— 所以 manifest.json / index.html /
        js/app-02.js / .github/workflows/build-apk.yml 都不需要跟着改）：
          icon-512.png          APK 桌面图标 + PWA 图标（workflow 会把它复制到所有 mipmap-*）
          icon-192.png          PWA 图标
          apple-touch-icon.png  iOS「添加到主屏幕」
          favicon-32x32.png     浏览器标签页
          favicon.ico           16/32/48 三帧（帧数据为 PNG，Win7+/现代浏览器均支持）
  用法（任何目录下都可以跑，路径以脚本位置为准）：
          powershell -ExecutionPolicy Bypass -File tools/gen-icons.ps1
          powershell -ExecutionPolicy Bypass -File tools/gen-icons.ps1 -Source 新图.jpg
  样式：居中裁成正方形 → HighQualityBicubic 缩放 → 按 0.1992*边长 的圆角切掉四个角（透明）。
        0.1992 是改造前 icon-512.png 实测出来的：第 0 行首个不透明像素在 x=102（102/512）。
  注意：本脚本用 Windows 自带的 System.Drawing，不需要任何第三方依赖（不联网、不占体积）。
#>
param(
    [string]$Source = 'icon-source.jpg',
    [double]$RadiusRatio = 0.1992
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repo    = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $repo $Source
if (-not (Test-Path $srcPath)) { throw "找不到图源：$srcPath" }

$img  = [System.Drawing.Image]::FromFile($srcPath)
$side = [Math]::Min($img.Width, $img.Height)
$sx   = [int](($img.Width  - $side) / 2)
$sy   = [int](($img.Height - $side) / 2)
Write-Host ("图源 {0}  {1}x{2} → 居中方形裁切 {3}x{3} @ ({4},{5})" -f $Source, $img.Width, $img.Height, $side, $sx, $sy)

function New-IconBitmap {
    param([int]$Size, [double]$RadiusRatio)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # 四条直边向外扩 0.5px，让裁剪边界落在像素中心之外，减少边缘半透明。
    # 注意：GDI+ 的 SetClip 抗锯齿在「上/下」两条边上仍会留 1 行 A≈236(92.5%) 的软边
    #（左/右为 A=255），这是 GDI+ 的取整行为，白底上肉眼不可见，实测把外扩量加到 1.0px 也无效。
    $e    = [float]0.5
    $d    = [float]($Size * $RadiusRatio * 2)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(-$e, -$e, $d, $d, 180, 90)
    $path.AddArc($Size - $d + $e, -$e, $d, $d, 270, 90)
    $path.AddArc($Size - $d + $e, $Size - $d + $e, $d, $d, 0, 90)
    $path.AddArc(-$e, $Size - $d + $e, $d, $d, 90, 90)
    $path.CloseFigure()

    $g.SetClip($path)
    $dest = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $g.DrawImage($script:img, $dest, $script:sx, $script:sy, $script:side, $script:side, [System.Drawing.GraphicsUnit]::Pixel)
    $g.ResetClip()
    $path.Dispose()
    $g.Dispose()
    return $bmp
}

$targets = @(
    @{ name = 'icon-512.png';         size = 512 },
    @{ name = 'icon-192.png';         size = 192 },
    @{ name = 'apple-touch-icon.png'; size = 180 },
    @{ name = 'favicon-32x32.png';    size = 32  }
)
foreach ($t in $targets) {
    $bmp = New-IconBitmap -Size $t.size -RadiusRatio $RadiusRatio
    $p   = Join-Path $repo $t.name
    $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("写出 {0,-20} {1}x{1}" -f $t.name, $t.size)
}

# favicon.ico：16/32/48 三帧，帧数据用 PNG（手写 ICONDIR + ICONDIRENTRY）
$sizes  = @(16, 32, 48)
$frames = @()
foreach ($s in $sizes) {
    $bmp = New-IconBitmap -Size $s -RadiusRatio $RadiusRatio
    $ms  = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += ,$ms.ToArray()
    $ms.Dispose(); $bmp.Dispose()
}
$ico = New-Object System.IO.MemoryStream
$bw  = New-Object System.IO.BinaryWriter($ico)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $data = $frames[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }        # ICO 里 256 用 0 表示
    $bw.Write([byte]$dim); $bw.Write([byte]$dim)    # bWidth / bHeight
    $bw.Write([byte]0);    $bw.Write([byte]0)       # bColorCount / bReserved
    $bw.Write([uint16]1);  $bw.Write([uint16]32)    # wPlanes / wBitCount
    $bw.Write([uint32]$data.Length); $bw.Write([uint32]$offset)
    $offset += $data.Length
}
foreach ($data in $frames) { $bw.Write($data) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $repo 'favicon.ico'), $ico.ToArray())
$bw.Dispose(); $ico.Dispose()
Write-Host ("写出 {0,-20} {1} 帧 {2}" -f 'favicon.ico', $sizes.Count, ($sizes -join '/'))

# 回读校验：尺寸 / 像素格式 / 四角透明度 + 输出 sha256（与 build-apk.yml 的自检对应）
Write-Host ''
foreach ($n in @('icon-512.png','icon-192.png','apple-touch-icon.png','favicon-32x32.png','favicon.ico')) {
    $p = Join-Path $repo $n
    if ($n -eq 'favicon.ico') {
        $h = (Get-FileHash $p -Algorithm SHA256).Hash.ToLower()
        Write-Host ("{0,-20} {1} bytes sha256={2}" -f $n, (Get-Item $p).Length, $h)
        continue
    }
    $b = New-Object System.Drawing.Bitmap($p)
    Write-Host ("{0,-20} {1}x{2} {3} 四角A={4} 大小={5} bytes sha256={6}" -f `
        $n, $b.Width, $b.Height, $b.PixelFormat, $b.GetPixel(0, 0).A, (Get-Item $p).Length, (Get-FileHash $p -Algorithm SHA256).Hash.ToLower())
    $b.Dispose()
}
$img.Dispose()
Write-Host '图标生成完成'
