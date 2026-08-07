Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strDesktop = WshShell.SpecialFolders("Desktop")
strProjectDir = "d:\WEBSITE BUILDING\Nota-Photo"

' 1. Main Server Shortcut
strBatPath1 = strProjectDir & "\START_NOTA_PHOTO.bat"
strShortcutPath1 = strDesktop & "\Nota Photo AI.lnk"
Set oShellLink1 = WshShell.CreateShortcut(strShortcutPath1)
oShellLink1.TargetPath = strBatPath1
oShellLink1.WorkingDirectory = strProjectDir
oShellLink1.Description = "Jalankan Server Nota-Photo AI (Port 3001)"
oShellLink1.WindowStyle = 1
oShellLink1.IconLocation = "shell32.dll, 135"
oShellLink1.Save

' 2. Ngrok HTTPS PWA Tunnel Shortcut
strBatPath2 = strProjectDir & "\START_HTTPS_NGROK.bat"
strShortcutPath2 = strDesktop & "\Nota Photo HTTPS PWA.lnk"
Set oShellLink2 = WshShell.CreateShortcut(strShortcutPath2)
oShellLink2.TargetPath = strBatPath2
oShellLink2.WorkingDirectory = strProjectDir
oShellLink2.Description = "Aktifkan Ngrok HTTPS Tunnel untuk PWA Standalone Tablet"
oShellLink2.WindowStyle = 1
oShellLink2.IconLocation = "shell32.dll, 14"
oShellLink2.Save
