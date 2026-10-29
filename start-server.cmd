@echo off
cd /d "%~dp0"
set "DEVICE_TOKEN_MACHINE_1=local-demo-machine-1-change-this"
node server.js
pause
