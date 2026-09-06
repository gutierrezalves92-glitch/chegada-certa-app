# Chegada Certa — hospedado na nuvem (grátis)

Este é o mesmo app "Chegada Certa" reconstruído a partir do seu backup, mas preparado para
rodar 24 horas por dia num link público de verdade — sem precisar do seu computador ligado,
sem instalar nada, e sem exigir login de quem for usar. É a versão certa para o motorista
abrir o link no celular de qualquer lugar.

Para isso, ele usa dois serviços gratuitos (nenhum pede cartão de crédito):

- **Supabase** — guarda os dados (rotas, chegadas, malotes) permanentemente.
- **Render** — roda o programa 24h e te dá o link público.

Leva uns 15 minutos para configurar na primeira vez. Depois disso, é só usar.

## Passo 1 — Criar o banco de dados no Supabase

1. Acesse **supabase.com** e crie uma conta gratuita (pode entrar com o Google).
2. Clique em **New project**. Dê um nome (ex: `chegada-certa`), crie uma senha para o
   banco (⚠️ **guarde essa senha**, vai precisar dela no próximo passo) e escolha a região
   mais perto de você (ex: São Paulo / `sa-east-1`).
3. Espere o projeto ser criado (1-2 minutos).
4. Vá em **Project Settings** (ícone de engrenagem) → **Database**.
5. Em **Connection string**, escolha a aba **Transaction pooler** e copie a URI. Ela se
   parece com isto:
   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
6. Substitua `[YOUR-PASSWORD]` pela senha que você criou no passo 2. Guarde essa linha
   completa — é a sua `DATABASE_URL`, você vai colar ela no Render daqui a pouco.

## Passo 2 — Colocar o código no GitHub

O Render precisa buscar o código de algum lugar. O jeito mais simples, sem usar comandos:

1. Acesse **github.com** e crie uma conta gratuita, se ainda não tiver.
2. Clique em **New repository**. Dê um nome (ex: `chegada-certa-app`), marque como
   **Public**, e clique em **Create repository**.
3. Na página do repositório vazio, clique em **uploading an existing file**.
4. Extraia o arquivo `.zip` que você recebeu no seu computador, e arraste **todos os
   arquivos e pastas de dentro dele** (não a pasta em si, o conteúdo dela) para a área de
   upload do GitHub.
5. Role para baixo e clique em **Commit changes**.

## Passo 3 — Publicar no Render

1. Acesse **render.com** e crie uma conta gratuita (pode entrar com o GitHub, facilita o
   próximo passo).
2. Clique em **New +** → **Web Service**.
3. Conecte sua conta do GitHub (se pedir) e escolha o repositório `chegada-certa-app` que
   você acabou de criar.
4. Preencha:
   - **Name**: `chegada-certa` (ou o nome que quiser — isso vira parte do link)
   - **Language/Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
5. Antes de clicar em criar, abra a seção **Environment Variables** e adicione:
   - `DATABASE_URL` → cole a connection string completa do Passo 1
6. Clique em **Create Web Service**. O Render vai instalar e ligar o programa — acompanhe
   o log; quando aparecer `Chegada Certa rodando na porta...`, está pronto.
7. No topo da página do serviço, o Render mostra o link público, algo como:
   ```
   https://chegada-certa.onrender.com
   ```
   Esse é o link fixo do **painel de gestão**. Para o motorista, gere o link dele na aba
   "Link do motorista" dentro do painel — ele vai ser algo como
   `https://chegada-certa.onrender.com/driver.html?token=...`.

Na primeira vez que o serviço subir, ele importa sozinho todo o histórico do backup
(451 rotas, 1111 chegadas, malotes, etc.) para o banco do Supabase — não precisa fazer
nada manualmente.

## Limitações do plano gratuito (importante)

- **O servidor "dorme" depois de 15 minutos sem uso** e demora uns 30-60 segundos para
  acordar na próxima visita — a primeira pessoa a abrir o link depois de um tempo parado
  vai ver a página carregando devagar; depois disso volta ao normal. Isso não afeta os
  dados, só a velocidade de resposta.
- **As fotos de entrega tiradas pelo motorista podem se perder** quando o servidor
  reinicia (o que acontece sozinho depois de período de inatividade, no plano gratuito).
  Os dados de texto — rotas, horários, GPS, status de atraso — **não são afetados**, só as
  imagens. Se as fotos forem essenciais, isso pede um plano pago com disco permanente.
- **O banco do Supabase pausa sozinho depois de 7 dias sem nenhum acesso.** Se isso
  acontecer, abra o projeto no site do Supabase e clique em "Restore"/"Resume" — leva
  menos de um minuto e os dados continuam intactos.

## Atualizando o app depois

Se no futuro você (ou eu) precisar mudar alguma coisa no código: suba os arquivos
atualizados no mesmo repositório do GitHub (pela mesma tela de upload) — o Render detecta
e publica a nova versão sozinho em alguns minutos.

## Rodando localmente (opcional, para testes)

```bash
cp .env.example .env   # edite e cole sua DATABASE_URL
npm install
npm start
```
