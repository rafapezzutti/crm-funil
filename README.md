# CRM Funil

CRM multi-tenant full-stack com funil de vendas, dashboard e gestão de equipe.

**Stack:** React + Vite · Node.js + Express · PostgreSQL (Neon) · Render · Resend

---

## Estrutura

```
crm-funil/
├── backend/
│   ├── src/
│   │   ├── config/db.js
│   │   ├── middleware/auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── clients.js
│   │   │   ├── sdrs.js
│   │   │   ├── sellers.js
│   │   │   └── company.js
│   │   └── index.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/  (Login, Register, Kanban, Dashboard, Team, Settings)
│   │   ├── components/ (Layout, ClientModal, ClientDetail, Toast)
│   │   ├── AuthContext.jsx
│   │   ├── api.js
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── database/schema.sql
└── render.yaml
```

---

## 1. Banco de dados (Neon)

1. Acesse [neon.tech](https://neon.tech) e crie um projeto chamado `crmfunil`
2. No console SQL, cole e execute o conteúdo de `database/schema.sql`
3. Copie a **Connection String** (formato `postgresql://...`)

---

## 2. Backend local

```bash
cd backend
cp .env.example .env
# Preencha .env com DATABASE_URL, JWT_SECRET, RESEND_API_KEY etc.
npm install
node src/index.js
# API rodando em http://localhost:3001
```

### Variáveis obrigatórias (`.env`)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string do Neon |
| `JWT_SECRET` | String aleatória longa (ex: `openssl rand -hex 32`) |
| `RESEND_API_KEY` | Chave da API do [Resend](https://resend.com) |
| `RESEND_FROM` | E-mail verificado no Resend (ex: `noreply@seudominio.com`) |
| `FRONTEND_URL` | URL do frontend (para CORS e links de e-mail) |

---

## 3. Frontend local

```bash
cd frontend
npm install
# Para apontar para o backend local, o proxy no vite.config.js já redireciona /api → localhost:3001
npm run dev
# App em http://localhost:5173
```

---

## 4. Deploy no Render

### 4a. Crie o repositório no GitHub

```bash
cd crm-funil
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SEU_USUARIO/crm-funil.git
git push -u origin main
```

### 4b. Deploy via Dashboard

1. Acesse [render.com](https://render.com) → **New → Blueprint**
2. Selecione o repositório `crm-funil`
3. O Render detecta o `render.yaml` e cria os dois serviços automaticamente
4. Configure as variáveis de ambiente secretas no painel de cada serviço:
   - **crm-funil-api:** `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `FRONTEND_URL`
   - **crm-funil-app:** `VITE_API_URL` → `https://crm-funil-api.onrender.com/api`

### 4c. Atualizar FRONTEND_URL no backend

Após o primeiro deploy, copie a URL do frontend (ex: `https://crm-funil-app.onrender.com`) e cole no env `FRONTEND_URL` do backend. Isso habilita o CORS correto e os links de e-mail de recuperação de senha.

---

## 5. Primeiro acesso

Acesse a URL do frontend e clique em **Criar conta**. Você será o administrador da sua empresa no sistema.

---

## Funcionalidades

- **Funil Kanban** com 4 estágios: Prospectados → Em Negociação → Em Piloto → Em Produção
- Validação: CNPJ e Razão Social obrigatórios ao mover para Piloto/Produção
- Busca e filtro por setor
- Importação via XLSX (colunas: nome do contato, nome da empresa, telefone, email)
- Exclusão em lote de prospectos
- **Dashboard** com KPIs, funil, donut por setor, ranking de SDRs e vendedores
- **Equipe:** cadastro de SDRs e Vendedores
- **Multi-tenant:** cada empresa vê apenas seus dados
- Recuperação de senha via e-mail (Resend)
