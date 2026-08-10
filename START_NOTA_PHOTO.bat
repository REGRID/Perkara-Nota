@echo off
title Perkara Nota Server - Port 3001
cd /d "%~dp0"
echo ======================================================
echo    MEMULAI SERVER PERKARA NOTA (PORT 3001)...
echo ======================================================
node scripts\start-nota.js
pause
