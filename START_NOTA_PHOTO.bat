@echo off
title Nota-Photo AI Server - Port 3001
cd /d "%~dp0"
echo ======================================================
echo    MEMULAI SERVER NOTA-PHOTO AI (PORT 3001)...
echo ======================================================
node scripts\start-nota.js
pause
