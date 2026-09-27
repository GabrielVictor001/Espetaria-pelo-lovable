@echo off
color 0E
title Espetaria PDV - Computador da Espetaria
cd /d "%~dp0"

echo ==========================================================
echo             ESPETARIA PDV  -  INICIANDO
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] O programa Node.js nao esta instalado neste computador.
  echo.
  echo      Faca o seguinte:
  echo        1. Abra o site:  https://nodejs.org
  echo        2. Clique no botao verde "LTS" e instale clicando Next, Next, Finish
  echo        3. Reinicie o computador
  echo        4. Clique de novo neste arquivo
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo  [1 de 3] Instalando os componentes do PDV...
  echo            Isso demora 1 ou 2 minutos e acontece SO NA PRIMEIRA VEZ.
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erro
  echo.
)

if not exist dist\index.html (
  echo  [2 de 3] Preparando a tela do PDV...
  call npm run build
  if errorlevel 1 goto erro
  echo.
)

echo  [3 de 3] Ligando o PDV. Aguarde alguns segundos...
echo.
echo  ==========================================================
echo    O PDV esta pronto no navegador:   http://localhost:3000
echo.
echo    Login do administrador:  admin
echo    Senha:                   admin123
echo.
echo    IMPORTANTE: NAO FECHE ESTA JANELA PRETA enquanto
echo    estiver usando o PDV na espetaria.
echo  ==========================================================
echo.

start "" http://localhost:3000
call npx tsx server/index.ts
pause
exit /b 0

:erro
echo.
echo  [X] Algo deu errado na instalacao.
echo      Tire uma foto desta tela e envie para o seu programador.
echo.
pause
exit /b 1
