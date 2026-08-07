@echo off
title Izin Firewall Windows - Nota-Photo Port 3001
:: Check for administrative privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ======================================================
    echo   MEMINTA HAK AKSES ADMINISTRATOR UNTUK FIREWALL...
    echo ======================================================
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ======================================================
echo   MEMBUKA IZIN FIREWALL PORT 3001 UNTUK HP / TABLET...
echo ======================================================
netsh advfirewall firewall delete rule name="NOTA_PHOTO_3001" >nul 2>&1
netsh advfirewall firewall add rule name="NOTA_PHOTO_3001" dir=in action=allow protocol=TCP localport=3001 profile=any

echo.
echo ✓ BERHASIL! Port 3001 telah diizinkan di Windows Firewall.
echo Sekarang HP dan Tablet di jaringan Wi-Fi lokal dapat mengakses server.
echo.
pause
