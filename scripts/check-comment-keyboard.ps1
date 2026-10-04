# Run with a post or vote detail open in Expo Go on Android USB.
$ErrorActionPreference = 'Stop'
adb shell uiautomator dump /sdcard/diggin-comment-keyboard.xml | Out-Null
[xml]$commentUi = adb shell cat /sdcard/diggin-comment-keyboard.xml
$inputNode = $commentUi.SelectNodes('//node') |
  Where-Object { $_.class -eq 'android.widget.EditText' } | Select-Object -First 1
if (!$inputNode) { throw 'Open a detail screen with a comment input.' }
$inputBounds = [regex]::Match($inputNode.bounds, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
$inputX = ([int]$inputBounds.Groups[1].Value + [int]$inputBounds.Groups[3].Value) / 2
$inputY = ([int]$inputBounds.Groups[2].Value + [int]$inputBounds.Groups[4].Value) / 2
adb shell input tap ([int]$inputX) ([int]$inputY)
adb shell uiautomator dump /sdcard/diggin-comment-keyboard.xml | Out-Null
[xml]$commentUi = adb shell cat /sdcard/diggin-comment-keyboard.xml
$imeDump = (adb shell dumpsys window) -join [Environment]::NewLine
$imeMatch = [regex]::Match($imeDump, 'type=ime frame=\[0,(\d+)\]\[\d+,\d+\].*visible=true')
$sendLabel = [string][char]0xB313 + [char]0xAE00 + ' ' + [char]0xB4F1 + [char]0xB85D
$sendNode = $commentUi.SelectNodes('//node') |
  Where-Object { $_.'content-desc' -eq $sendLabel } | Select-Object -First 1
if (!$imeMatch.Success -or !$sendNode) { throw 'Keyboard or comment send button not found.' }
$sendBounds = [regex]::Match($sendNode.bounds, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
$imeTop = [int]$imeMatch.Groups[1].Value
$sendBottom = [int]$sendBounds.Groups[4].Value
Write-Output "Keyboard top=$imeTop, send button bottom=$sendBottom"
if ($sendBottom -gt $imeTop) { throw 'Comment input is covered by the keyboard.' }
Write-Output 'PASS: Comment input and send button are above the keyboard.'
