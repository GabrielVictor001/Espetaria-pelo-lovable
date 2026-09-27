# 🍢 Espetaria PDV

PDV completo para espetaria: **mesas (1–70), comandas por cliente, lançamento em poucos cliques, botão de limpeza para o admin e IA integrada** (com motor local offline + suporte a OpenAI/Gemini/chaves externas).

Feito sobre a **sua estrutura de banco** (PostgreSQL): `users`, `tables`, `products`, `orders`, `order_items` — colunas originais preservadas, com acréscimos marcados com `-- [+]` em `server/db/schema.sql`.

---

## ▶️ Como rodar

```bash
npm install
npm run dev        # desenvolvimento (API 3000 + interface 5173 com hot reload)
# ou
npm run build && npm run serve   # produção: interface + API na mesma porta (3000)
```

Abra `http://localhost:3000`.

### Acessos de demonstração

| Usuário | Senha      | Perfil                                        |
| ------- | ---------- | --------------------------------------------- |
| `admin` | `admin123` | Administrador (painel, cardápio, limpeza, IA) |
| `joao`  | `123456`   | Atendente                                     |
| `maria` | `123456`   | Atendente                                     |
| `carla` | `123456`   | Atendente                                     |

> Na primeira execução o sistema cria o banco, as 70 mesas, 75 produtos, os usuários e um **histórico de 3 semanas** (para relatórios e IA já terem o que analisar), além de 4 mesas abertas de exemplo.

### Banco de dados

- **Padrão:** PostgreSQL embutido (PGlite/WASM) — zero instalação, dados em `data/pgdata`.
- **Postgres real:** basta definir `DATABASE_URL` no `.env` (Neon, Supabase, Railway, Docker, VPS…). O mesmo `schema.sql` roda lá sem alteração.
- Recriar tudo: `npm run db:reset -- --yes`.

---

## 🧭 O fluxo principal (exatamente o que você pediu)

1. **Login → direto para o mapa das 70 mesas.** Não há menu intermediário.
2. **Abrir mesa = 1 clique** na mesa livre. Ela já abre e o **campo de busca de itens** aparece focado.
3. **Lançar item pelo search:** digite `picanha`, `2 cerveja`, `farofa`… e aperte **Enter**.
   - A busca é **inteligente**: entende erro de digitação (`xpeto de carne` → Espeto de Carne Bovina), apelidos (`orig` → Original 600ml) e quantidade na frente (`3 caipirinha`).
   - Sem querer digitar? Existe a **grade rápida por categoria** (Favoritos, Espetos, Bebidas…): 1 toque lança.
4. **Botão “Adicionar”** no topo da lista de itens (ou toque na mesa de novo) para continuar lançando — o foco volta para a busca.
5. **Botão “X” ao lado de cada item** cancela na hora. O item fica marcado como *cancelado* (nada é apagado do histórico) e aparece **“Restaurar”** caso tenha sido toque errado.
   - Também dá para **+/- quantidade** e **observações** (“sem cebola”) em cada linha.
6. Extras do fluxo: **comandas por cliente** (Cliente 1, Cliente 2… com subtotal individual), **conferir/imprimir a conta**, **transferir mesa**, **cancelar mesa**, **fechar conta** com Pix/Dinheiro/Débito/Crédito, **taxa de serviço** e **desconto** (R$ ou %), mostrando o valor **por pessoa**.

## 🧽 Botão de limpeza (só administrador)

Fica no **topo da tela de Mesas** (ícone/vassoura “Limpar”) e também em *Configurações ▸ Dados e limpeza*. Cada ação mostra quantos registros serão afetados:

- Sincronizar status das mesas (corrige mesa que “ficou ocupada” sem conta)
- Fechar mesas sem consumo
- Remover itens cancelados (mais antigos que N dias)
- Apagar contas fechadas antigas (mais antigas que N dias)
- Limpar histórico da IA
- Enxugar registro de atividades (mantém as últimas N ações)
- **Zerar movimento** (fim do dia: limpa contas, mantém cardápio e usuários)
- Restauração de fábrica (com confirmação)

## 🤖 IA — como está integrada

| Camada                       | O que faz                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Motor local (padrão)**     | Roda dentro do PDV, sem chave e sem internet: busca inteligente, sugestões de venda pelo **histórico real** (co-ocorrência “quem pede X pede Y”) e respostas de faturamento, ticket médio, mesas abertas, mais vendidos e horário de pico. |
| **Chat do salão** (`/ia`)    | Fala em português. “2 picanha na mesa 5” → **botão pronto para lançar**; “quanto está a mesa 12?”, “faturamento de hoje”, “sugere uma sobremesa?”. |
| **Sugestões na mesa**        | Na lateral da mesa: “Espeto de Queijo Coalho — costuma sair junto com Espeto de Picanha (14x no histórico)”, com 1 toque para lançar.        |
| **Provedores externos**      | *Configurações ▸ Inteligência Artificial*: cole a chave (OpenAI, Gemini, Groq, OpenRouter, Ollama…), escolha o modelo e clique em **Testar conexão**. As respostas passam a ser geradas pela IA externa **com os dados reais do salão no contexto**; se a chave falhar, o PDV volta sozinho ao motor local. |
| **Fora do app**              | Também aceita `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` no `.env`.                                                             |

## 📊 Painel do administrador

KPIs (faturamento, ticket médio, 7/30 dias, mesas abertas), gráfico de 14 dias, movimento por horário, vendas por dia (subtotal/taxa/desconto/total/ticket), formas de pagamento, **produtos mais vendidos**, **desempenho por atendente**, **itens cancelados pelo X** (para achar erro de lançamento), **auditoria** de todas as ações e **backup em JSON**.

---

## 🗂️ Estrutura

```
server/
  index.ts              API Express + serve a interface compilada
  db/schema.sql         SEU schema + colunas novas documentadas
  db/seed.ts            usuários, cardápio, histórico de demonstração
  db/index.ts           PGlite (embutido) ou Postgres externo — mesma API de query
  services/orders.ts    abrir mesa, lançar, cancelar (X), comandas, fechar, transferir
  services/products.ts  cardápio + motor de busca inteligente
  services/ai.ts        IA plugável (local ⇄ OpenAI/Gemini/compatível), chat, sugestões
  services/insights.ts  métricas do negócio e co-ocorrência de produtos
  services/admin.ts     limpeza/organização, auditoria, backup, relatórios
  routes/               auth, tables, orders/items, products, ai, admin
web/
  pages/                Login, Tables (mapa), TableDetail, AiAssistant, Dashboard, Menu, Settings
  components/           TopBar, CleanupModal, CloseAccountModal, BillModal, Modal
  lib/                  api.ts (cliente tipado), store.tsx (sessão/toasts), format.ts
```

## 🔐 Segurança

Senhas com **bcrypt**, sessão por **JWT** (7 dias), perfis `admin`/`waiter` validados no servidor (o atendente não acessa painel, cardápio, configurações nem limpeza), auditoria de quem fez o quê e backup sem expor os hashes de senha.

## ✅ Roadmap (parte 2 — me mande o prompt)

Estrutura já preparada para: divisão de pagamento por comanda (`payments.command_name`), impressão térmica/cozinha (KDS), estoque e ficha técnica, delivery/mesas externas, importação de backup e app offline (PWA).
