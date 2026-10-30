@echo off
cd /d "%~dp0"
set "DEVICE_TOKEN_MACHINE_1=local-demo-machine-1-change-this"
set /p SUPABASE_URL=Enter Supabase project URL: 
set /p SUPABASE_PUBLISHABLE_KEY=Enter Supabase publishable key: 
node server.js
pause
