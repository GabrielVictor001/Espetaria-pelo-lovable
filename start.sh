#!/usr/bin/env bash
# Espetaria PDV - partida em um comando.
#
# Uso normal (produção/local):
#     bash start.sh
# Modo desenvolvimento (recarrega sozinho quando o código muda):
#     bash start.sh dev
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "▸ Instalando dependências (primeira vez pode levar ~1 min)..."
  npm install --no-audit --no-fund
fi

if [ "$1" = "dev" ]; then
  echo "▸ Modo desenvolvimento: interface em http://localhost:5173 (recarrega automaticamente)"
  exec npm run dev
fi

if [ ! -f dist/index.html ]; then
  echo "▸ Compilando a interface..."
  npm run build
fi

echo "▸ Iniciando o PDV em http://localhost:${PORT:-3000}"
exec npx tsx server/index.ts
