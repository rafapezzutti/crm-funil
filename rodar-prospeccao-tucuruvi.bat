@echo off
chcp 65001 > nul
echo.
echo ========================================
echo  Prospecção Condomínios Tucuruvi
echo  Escola de Futebol - CRM Funil
echo ========================================
echo.
cd /d "%~dp0"
set GOOGLE_PLACES_KEY=AIzaSyCsGilpVMhFPI-yKoJkXEATOE9LJmWx8bM
node backend\scripts\busca-condominios-tucuruvi.js
echo.
echo Pressione qualquer tecla para fechar...
pause > nul
