Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strDesktop = WshShell.SpecialFolders("Desktop")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strProjectDir = fso.GetParentFolderName(scriptDir)

' 1. Main Server Shortcut
strBatPath1 = strProjectDir & "\START_NOTA_PHOTO.bat"
strShortcutPath1 = strDesktop & "\Nota Photo AI.lnk"
Set oShellLink1 = WshShell.CreateShortcut(strShortcutPath1)
oShellLink1.TargetPath = strBatPath1
oShellLink1.WorkingDirectory = strProjectDir
oShellLink1.Description = "Jalankan Server Nota-Photo AI"
oShellLink1.WindowStyle = 1
oShellLink1.IconLocation = "shell32.dll, 135"
oShellLink1.Save

' Cleanup old Ngrok shortcut if exists
strOldNgrokShortcut = strDesktop & "\Nota Photo HTTPS PWA.lnk"
If fso.FileExists(strOldNgrokShortcut) Then
    On Error Resume Next
    fso.DeleteFile(strOldNgrokShortcut)
    On Error GoTo 0
End If
