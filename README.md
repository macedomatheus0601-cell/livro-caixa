# Livro-Caixa

Planejamento financeiro pessoal organizado pelo **ciclo da fatura do cartão**.
O mês de referência junta as compras do ciclo (do dia do fechamento do mês anterior
até a véspera do fechamento), o salário do último dia útil e as contas pagas no mês.

Funciona no navegador e instala no celular como app (PWA). Os dados ficam no
Firebase (Firestore), numa área que só a sua conta Google lê, e continuam
disponíveis offline.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `index.html` | Casca da página |
| `css/app.css` | Visual (cores claras e escuras em variáveis no topo) |
| `js/logic.js` | Regras puras: ciclo da fatura, parcelas, último dia útil, leitura de CSV, categorização automática |
| `js/app.js` | Telas, insights e formulários |
| `js/firebase.js` | Login Google e gravação no Firestore |
| `js/config.js` | Configuração do Firebase (cole aqui o `firebaseConfig`) |
| `firestore.rules` | Regras de acesso do banco (cada usuário só vê a própria pasta) |
| `sw.js` | Faz o site abrir sem internet |

Sem build: editar o arquivo e publicar já atualiza o site. Ao mudar arquivos do site,
suba `VERSAO` em `sw.js` para os celulares descartarem o cache antigo.

## Configuração (uma vez)

### 1. Repositório e GitHub Pages
1. Crie o repositório vazio `livro-caixa` em github.com/new (público, sem README).
2. Depois do primeiro push: **Settings > Pages > Build and deployment > Source: Deploy from a branch**, branch `main`, pasta `/ (root)`, **Save**.
3. O site fica em `https://<seu-usuario>.github.io/livro-caixa/`.

### 2. Projeto no Firebase
1. Acesse console.firebase.google.com e clique **Criar projeto** (nome: `livro-caixa`). Pode desativar o Google Analytics.
2. Na página do projeto, clique no ícone **</>** (Adicionar app da Web), apelido `livro-caixa`, sem Hosting. Copie o bloco `firebaseConfig`.
3. Cole esse bloco em `js/config.js`, no lugar de `null`:
   ```js
   window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };
   ```

### 3. Login com Google
1. **Criação > Authentication > Vamos começar > Google > Ativar**, escolha o e-mail de suporte e salve.
2. **Authentication > Configurações > Domínios autorizados > Adicionar domínio**: `<seu-usuario>.github.io`.

### 4. Banco de dados
1. **Criação > Firestore Database > Criar banco de dados**, local `southamerica-east1 (São Paulo)`, **modo de produção**.
2. Aba **Regras**: apague o conteúdo, cole o de `firestore.rules` e clique **Publicar**.

Custo: o plano gratuito (Spark) cobre com folga o uso pessoal.

## Backup
Em **Ajustes > Baixar backup** sai um `.json` com tudo. **Restaurar backup** carrega de volta.
