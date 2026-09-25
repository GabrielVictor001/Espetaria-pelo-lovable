# 🍢 Site da Espetaria — Cardápio Digital + Painel do Dono

Site completo e pronto para usar na sua espetaria, sem mensalidade e sem precisar de programador:

- **📱 Cardápio digital** (`index.html`): cliente monta o pedido e envia pronto para o seu **WhatsApp**.
- **⚙️ Painel do dono** (`admin.html`): altere nome, WhatsApp, preços, fotos, horários e mais.
- **🎨 Tema escuro moderno**, feito para celular.
- **💾 Funciona sem servidor**: os dados ficam salvos no navegador (com backup em arquivo).

## 🚀 Como começar a usar HOJE (5 minutos)

1. Abra o **`admin.html`** no navegador (ou toque na engrenagem ⚙️ no topo da loja).
2. Entre com a senha inicial: **`admin123`**.
3. Na aba **Início**, siga o checklist:
   - ✅ Cadastre o **WhatsApp** que vai receber os pedidos (só números, com DDD. Ex: `83999998888`).
   - ✅ Troque o **nome** da espetaria e a **frase de apresentação**.
   - ✅ Confira **preços, taxa de entrega e horários** de funcionamento.
   - ✅ Troque a **senha** do painel.
4. Pronto! Envie o link do `index.html` para os clientes (WhatsApp, Instagram, QR Code na mesa).

## 📲 Como o cliente faz o pedido

1. Abre o cardápio, escolhe os itens e monta a sacola 🛒.
2. Preenche nome, endereço (ou retirada) e pagamento.
3. Toca em **“Enviar pedido no WhatsApp”** → o pedido chega prontinho no seu WhatsApp, com itens, total e endereço.

## ✏️ Tarefas do dia a dia (no painel)

| Quero... | Onde faço |
|---|---|
| Abrir/fechar a loja agora | Aba **Início** → 🟢 Abrir / 🔴 Fechar |
| Mudar preço ou nome de um item | Aba **Cardápio** → ✏️ no item |
| Marcar item como esgotado | Aba **Cardápio** → botão ✅/🚫 do item |
| Adicionar foto (do celular) | Editar item → **📤 Enviar foto** |
| Mudar WhatsApp, endereço, horários | Aba **Loja** → Salvar |
| Levar tudo para outro celular | Aba **Backup** → ⬇️ Baixar e ⬆️ Restaurar |

## 🌐 Como colocar na internet (grátis)

Opção mais fácil — **Netlify Drop**:

1. Acesse [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arraste **esta pasta inteira** para a página.
3. Pronto: você ganha um link (ex: `sua-espetaria.netlify.app`) para divulgar.

Outras opções grátis: Vercel, GitHub Pages ou Cloudflare Pages — é só enviar os mesmos arquivos.

> ⚠️ **Importante:** os dados (cardápio, preços) ficam salvos **no navegador de cada aparelho**. Depois de publicar, abra o `admin.html` no seu celular, configure tudo e baixe um **backup** (aba Backup e senha). Se trocar de celular, restaure o backup.

## 🛠️ Detalhes técnicos

- Feito em **HTML + CSS + JavaScript puro** — sem build, sem dependências, abre até sem internet (depois do 1º acesso).
- Imagens de exemplo em `assets/img/` — troque pelas fotos reais dos seus pratos no painel.
- Arquivos principais:
  - `index.html` + `css/styles.css` + `js/app.js` → loja
  - `admin.html` + `css/admin.css` + `js/admin.js` → painel
  - `js/data.js` → dados iniciais e regras (compartilhado)
