# 🍢 COMO ABRIR O PDV — passo a passo (para leigos)

Este guia tem **3 jeitos** de abrir o PDV. Escolha o seu:

| Jeito | Para que serve | Precisa instalar algo? |
| --- | --- | --- |
| **[A](#-jeito-a--ver-agora-no-navegador-sem-instalar-nada)** | Só dar uma olhada agora, testar as telas | ❌ Não |
| **[B](#-jeito-b--instalar-no-computador-da-espetaria-recomendado)** | Usar de verdade na espetaria (recomendado) | ✅ Sim, 1 programa (Node.js) |
| **[C](#-jeito-c--celular-dos-garçons-na-mesma-rede-wifi)** | Celular dos garçons lançando pedido | Usa o do Jeito B |

---

## 👀 Jeito A — Ver agora, no navegador (sem instalar nada)

1. No painel do Arena (onde você está falando comigo), procure o quadradinho chamado **"Espetaria PDV"** com um **botão de abrir / pré-visualizar**.
2. Clique nele. Abre o PDV direto no navegador.
3. Na tela de login digite:
   - **Usuário:** `admin`
   - **Senha:** `admin123`
4. Pronto — você cai direto no **mapa das 70 mesas**.

> ⚠️ Esse link é só para testes: ele pode sair do ar quando o ambiente é reiniciado. Se cair, me diga **"sobe o servidor"** que eu ligo de novo.

---

## 💻 Jeito B — Instalar no computador da espetaria (recomendado)

É o que você vai usar no dia a dia. São **4 etapas**, uma vez só. Depois, virar o PDV no dia a dia é **1 clique**.

### Etapa 1 — Instalar o Node.js (o "motor" que faz o PDV rodar)

1. No navegador, abra: **https://nodejs.org**
2. Clique no botão verde que diz **LTS** (é o recomendado).
3. Baixa um arquivo. **Clique duas vezes nele** para abrir o instalador.
4. Clique **Next → Next → Next → Finish** (pode deixar tudo como vem).
5. **Reinicie o computador** (importante!).

> ✅ Como saber que deu certo: reinicie o PC, segure a tecla **Windows**, digite `cmd` e aperte Enter. Na janelinha preta que abrir, digite `node -v` e aperte Enter. Se aparecer algo tipo `v22.22.3`, está tudo certo.

### Etapa 2 — Baixar o PDV para o computador

1. Abra a página do projeto no GitHub:
   **https://github.com/GabrielVictor001/Espetaria-pelo-lovable**
2. Clique no botão verde **`<> Code`** (canto superior direito) → depois em **Download ZIP**.
3. Vá na pasta **Downloads**, clique com o **botão direito** no arquivo baixado → **Extrair tudo…**
   - Extraia para um lugar fácil de achar, por exemplo: **`C:\PDV-Espetaria`**
4. Abra essa pasta. Você deve ver vários arquivos, e um deles se chama **`iniciar-pdv.bat`**.

> 💡 **Dica:** clique com o botão direito no arquivo **`iniciar-pdv.bat`** → **Enviar para → Área de trabalho (criar atalho)**. Assim você liga o PDV do jeito que liga qualquer programa.

### Etapa 3 — Ligar o PDV (o primeiro "liga" é o mais demorado)

1. **Clique duas vezes** em **`iniciar-pdv.bat`**.
2. Vai abrir uma **janela preta** escrevendo coisas. **Isso é normal.**
   - Na primeira vez ele instala os componentes: leva de **1 a 3 minutos**. Depois disso abre em segundos.
   - Se o Windows perguntar algo como *"Deseja permitir que este aplicativo acesse a rede?"*, clique em **Permitir acesso** (isso é o que libera os celulares depois).
3. Quando aparecer a mensagem *"O PDV está pronto no navegador"*, o **navegador abre sozinho** em `http://localhost:3000`.
   - Se não abrir sozinho, abra o navegador e digite: **localhost:3000**
4. Faça login:
   - **Usuário:** `admin`  **Senha:** `admin123`
5. **Troque a senha do admin agora:** menu **Config** (topo) → **Minha conta** → preencha a senha atual (`admin123`) e a nova senha → Salvar.

> 🚨 **MUITO IMPORTANTE:** a **janela preta precisa ficar aberta** enquanto o PDV estiver em uso. Ela **é** o PDV rodando. Pode **minimizar**, só não feche.
>
> ✅ Para **desligar o PDV**: é só fechar a janela preta.
> ✅ Para **ligar no dia seguinte**: 1 clique no `iniciar-pdv.bat`. Pronto, tudo continua salvo.

### Etapa 4 — Primeiros ajustes (10 minutinhos, valem a pena)

Tudo no menu **Config** (só o admin enxerga):

| O que fazer | Onde |
| --- | --- |
| Trocar a senha do admin | **Minha conta** |
| Criar o usuário de cada garçom | **Usuários** → *Novo usuário* (perfil: Atendente) |
| Ajustar o preço dos espetos | **Cardápio** → clique no preço para editar |
| Cadastrar um item novo | **Cardápio** → *Novo produto* |
| Definir sua taxa de serviço (ex.: 10%) | Aparece na hora de fechar a conta (dá para desligar) |
| Backup dos dados | **Painel** → botão *Backup* |

> 🔐 **Peça para cada garçom entrar com o usuário dele** (não compartilhe o `admin`). Assim o PDV registra quem lançou cada pedido, quem cancelou cada item e quanto cada um vendeu.

---

## 📱 Jeito C — Celular dos garçons (mesma rede Wi-Fi)

Só funciona **depois** do Jeito B instalado no PC da espetaria. O celular precisa estar no **mesmo Wi-Fi** do PC.

### Passo 1 — Descobrir o "endereço" do PC

Na **janela preta** do PDV tem instruções; ou faça assim:

1. Tecla **Windows** → digite `cmd` → Enter.
2. Digite `ipconfig` e aperte Enter.
3. Procure a linha **"Endereço IPv4"**. Vai ser algo parecido com `192.168.0.10`. **Anote esses números.**

### Passo 2 — Abrir no celular

1. No celular, abra o navegador (Chrome/Safari).
2. Digite o endereço do PC seguido de `:3000`. Exemplo: **`http://192.168.0.10:3000`**
3. Entre com o **usuário e senha do garçom** (não use o admin).

> 💡 **Dica:** no Chrome do celular, menu (⋮) → **"Adicionar à tela inicial"**. Aí fica um ícone igual de aplicativo, e o garçom entra com 1 toque.

### Se o celular não abrir a página

1. Confira se o celular está no **mesmo Wi-Fi** do PC.
2. No Windows, pode ser o **Firewall** bloqueando:
   - Tecla Windows → digite **`Firewall`** → abra **"Firewall do Windows Defender"**.
   - Clique em **"Permitir um aplicativo…"** → localize **Node.js** → marque as caixinhas **Particular** e **Pública** → **OK**.
3. Confirme que a **janela preta está aberta** no PC.

---

## 🔁 Resumo do dia a dia (o que a equipe faz)

**Abrir a espetaria:**
1. Ligar o PC.
2. Dois cliques em **`iniciar-pdv.bat`** (ou no atalho da área de trabalho).
3. Esperar aparecer "O PDV está pronto" (uns segundos).
4. Garçons abrem no celular ou no próprio PC.

**Atender uma mesa (poucos cliques):**
1. **Toque na mesa verde** → ela abre na hora.
2. **Digite** o que o cliente pediu (ex.: `picanha`) e aperte **Enter**.
3. Quer mais? Digite de novo, ou **toque nos produtos** da grade, ou use **Adicionar**.
4. Errou? **Toque no X** ao lado do item (dá para **Restaurar** se foi engano).
5. Acabou? **Fechar conta** → escolha a forma de pagamento → **Confirmar**.

**Fechar a espetaria:**
1. Feche todas as contas (mesa aberta pode ficar para amanhã, se preferir).
2. Menu **Config → Dados e limpeza**, ou o botão **Limpar** no topo das mesas → *Zerar movimento* (recomendado no fim do dia).
3. Feche a **janela preta**.

---

## 🆘 Problemas comuns e a solução

| O que acontece | O que fazer |
| --- | --- |
| Janela preta escreve **"npm não é reconhecido"** | O Node.js não instalou. Refaça a Etapa 1 e **reinicie o PC**. |
| A janela preta fecha sozinha rápido | Clique com o botão direito no `iniciar-pdv.bat` → **Executar como administrador**. |
| O navegador diz **"não é possível acessar este site"** | Confira se a janela preta está aberta e escrevendo. Se estiver, espere 10 segundos e aperte **F5**. |
| **"A porta 3000 já está em uso"** | Já existe um PDV aberto: feche as outras janelas pretas e abra só uma. |
| Os itens de exemplo estão atrapalhando | **Limpar** (topo das mesas) → *Zerar movimento* — o cardápio e os usuários continuam. |
| Esqueci a senha do admin | Me chame aqui: eu gero o código para criar uma senha nova. |
| Quero uso da equipe **em vários aparelhos ao mesmo tempo** sem depender do meu PC ligado | Fale comigo: eu preparo a **publicação na internet** (link fixo, sempre no ar). |

---

## 📦 Onde ficam os seus dados (importante para não perder nada)

- Todos os dados (vendas, mesas, usuários) ficam na pasta **`data`**, dentro da pasta do PDV.
- **Backup:** menu **Painel → Backup** baixa um arquivo com tudo. Faça isso uma vez por semana e guarde no pen drive / Google Drive.
- Para **restaurar em outro computador**: copie a pasta inteira do PDV (incluindo a pasta `data`) para o novo PC e rode o `iniciar-pdv.bat`.

---

## 🌐 Quer o PDV na internet (link fixo, acesso de qualquer lugar)?

Hoje ele roda no seu computador (rápido e sem mensalidade). Se você quiser um **endereço fixo na internet** — para acessar de casa, do celular fora do Wi-Fi ou de outra loja — eu preparo os arquivos de publicação (Railway/Render) com banco gerenciado. **Só me pedir.**
