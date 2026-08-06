# Catálogo de Unidades de Medida (painel editável) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os campos de texto livre `unidade_base`/`unidade_maior` do produto por uma referência a uma tabela cadastrável (`btx_unidades_medida`), com um painel dedicado pra gerenciar essa lista.

**Architecture:** Nova tabela `btx_unidades_medida` (catálogo simples: nome + ativo). `btx_produtos` troca `unidade_base TEXT`/`unidade_maior TEXT` por `unidade_base_id UUID`/`unidade_maior_id UUID` (duas FKs pra mesma tabela, desambiguadas nas queries do Supabase com `!coluna_fk`). Nova tela `/unidades` no mesmo padrão CRUD de `/produtos`. Todo lugar que hoje lê `produto.unidade_base`/`unidade_maior` como string passa a ler `produto.unidade_base?.nome`/`unidade_maior?.nome` via join.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Supabase (Postgres/RLS). Sem framework de testes — verificação por `npx tsc --noEmit` e teste manual via `npm run dev`.

## Global Constraints

- Não introduzir dependências novas.
- Manter 2 níveis de conversão por produto (base + maior + 1 fator) — confirmado com o usuário, sem hierarquias maiores.
- Editar/excluir uma unidade não recalcula nada em produtos existentes — fora de escopo (ver spec).
- Migration SQL desta etapa parte do estado já migrado da etapa anterior (`unidade_base`/`unidade_maior` como TEXT em produção — já executada pelo usuário).
- Cada task termina com `npx tsc --noEmit` limpo antes do commit.
- Referência de spec: `docs/superpowers/specs/2026-08-06-catalogo-unidades-medida-design.md`.

---

### Task 1: Migration SQL + schema fonte

**Files:**
- Create: `supabase_migration_catalogo_unidades.sql`
- Modify: `supabase_schema.sql` (seção `btx_unidades_medida` nova + `btx_produtos` linhas 61-83 aprox.)

**Interfaces:**
- Produz: tabela `btx_unidades_medida(id, nome, ativo, created_at)` e colunas `btx_produtos.unidade_base_id`, `btx_produtos.unidade_maior_id` (UUID, FK). Todas as tasks seguintes dependem desse shape.

- [ ] **Step 1: Criar o arquivo de migration (produção — parte do estado já migrado com colunas TEXT)**

```sql
-- ============================================================
-- Migration: catálogo editável de unidades de medida
-- Execute no SQL Editor do Supabase (depois de
-- supabase_migration_unidades_conversao.sql, já aplicada)
-- ============================================================

-- Catálogo de unidades
CREATE TABLE IF NOT EXISTS btx_unidades_medida (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_unidades_medida ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_unidades_medida" ON btx_unidades_medida FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_unidades_medida" ON btx_unidades_medida FOR ALL USING (btx_get_my_role()='admin');

-- Migra os nomes já usados nos produtos existentes pro catálogo
INSERT INTO btx_unidades_medida(nome)
SELECT DISTINCT unidade_base FROM btx_produtos
UNION
SELECT DISTINCT unidade_maior FROM btx_produtos
ON CONFLICT (nome) DO NOTHING;

-- Novas colunas de referência em btx_produtos
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_base_id UUID REFERENCES btx_unidades_medida(id);
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_maior_id UUID REFERENCES btx_unidades_medida(id);

UPDATE btx_produtos p SET unidade_base_id = u.id
FROM btx_unidades_medida u WHERE u.nome = p.unidade_base;

UPDATE btx_produtos p SET unidade_maior_id = u.id
FROM btx_unidades_medida u WHERE u.nome = p.unidade_maior;

ALTER TABLE btx_produtos ALTER COLUMN unidade_base_id SET NOT NULL;
ALTER TABLE btx_produtos ALTER COLUMN unidade_maior_id SET NOT NULL;

ALTER TABLE btx_produtos DROP COLUMN unidade_base;
ALTER TABLE btx_produtos DROP COLUMN unidade_maior;
```

- [ ] **Step 2: Atualizar `supabase_schema.sql` (instalações novas) — adicionar a tabela nova antes de `btx_produtos`**

Adicionar, logo antes da seção `-- btx_produtos` (antes da linha `CREATE TABLE IF NOT EXISTS btx_produtos`):

```sql
-- ------------------------------------------------------------
-- btx_unidades_medida
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_unidades_medida (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_unidades_medida ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_unidades_medida" ON btx_unidades_medida FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_unidades_medida" ON btx_unidades_medida FOR ALL USING (btx_get_my_role()='admin');

INSERT INTO btx_unidades_medida(nome) VALUES ('Carteira'),('Caixa'),('Unidade'),('Display')
ON CONFLICT DO NOTHING;

```

- [ ] **Step 3: Atualizar a definição de `btx_produtos` em `supabase_schema.sql`**

Substituir:

```sql
CREATE TABLE IF NOT EXISTS btx_produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  unidade_base TEXT NOT NULL DEFAULT 'Carteira',
  unidade_maior TEXT NOT NULL DEFAULT 'Caixa',
  fator_conversao INTEGER NOT NULL DEFAULT 480,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_produtos" ON btx_produtos FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_produtos" ON btx_produtos FOR ALL USING (btx_get_my_role()='admin');

INSERT INTO btx_produtos(nome, unidade_base, unidade_maior, fator_conversao) VALUES
  ('GUDANG RED','Carteira','Caixa',480),('GUDANG GREEN','Carteira','Caixa',480),
  ('GUDANG TWIN TEN','Carteira','Caixa',500),('CRETEC MENTA','Carteira','Caixa',500),('CRETEC CEREJA','Carteira','Caixa',500)
ON CONFLICT DO NOTHING;
```

por:

```sql
CREATE TABLE IF NOT EXISTS btx_produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  unidade_base_id UUID NOT NULL REFERENCES btx_unidades_medida(id),
  unidade_maior_id UUID NOT NULL REFERENCES btx_unidades_medida(id),
  fator_conversao INTEGER NOT NULL DEFAULT 480,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_produtos" ON btx_produtos FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_produtos" ON btx_produtos FOR ALL USING (btx_get_my_role()='admin');

INSERT INTO btx_produtos(nome, unidade_base_id, unidade_maior_id, fator_conversao) VALUES
  ('GUDANG RED',(SELECT id FROM btx_unidades_medida WHERE nome='Carteira'),(SELECT id FROM btx_unidades_medida WHERE nome='Caixa'),480),
  ('GUDANG GREEN',(SELECT id FROM btx_unidades_medida WHERE nome='Carteira'),(SELECT id FROM btx_unidades_medida WHERE nome='Caixa'),480),
  ('GUDANG TWIN TEN',(SELECT id FROM btx_unidades_medida WHERE nome='Carteira'),(SELECT id FROM btx_unidades_medida WHERE nome='Caixa'),500),
  ('CRETEC MENTA',(SELECT id FROM btx_unidades_medida WHERE nome='Carteira'),(SELECT id FROM btx_unidades_medida WHERE nome='Caixa'),500),
  ('CRETEC CEREJA',(SELECT id FROM btx_unidades_medida WHERE nome='Carteira'),(SELECT id FROM btx_unidades_medida WHERE nome='Caixa'),500)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Commit**

```bash
git add supabase_migration_catalogo_unidades.sql supabase_schema.sql
git commit -m "feat(db): adiciona catálogo btx_unidades_medida e FKs em btx_produtos"
```

**⚠️ Ação manual do usuário:** rodar `supabase_migration_catalogo_unidades.sql` no SQL Editor do Supabase **antes** de publicar o código das próximas tasks (mesma lógica da migration anterior — o código novo espera `unidade_base_id`/`unidade_maior_id`, não mais `unidade_base`/`unidade_maior` texto).

---

### Task 2: Tipos TypeScript

**Files:**
- Modify: `types/index.ts:12-15`

**Interfaces:**
- Produz: `UnidadeMedida { id, nome, ativo, created_at }` e `Produto { id, nome, unidade_base_id, unidade_maior_id, fator_conversao, ativo, created_at, unidade_base?: UnidadeMedida, unidade_maior?: UnidadeMedida }`. Toda task seguinte depende desse shape.

- [ ] **Step 1: Adicionar `UnidadeMedida` e atualizar `Produto`**

Substituir:

```typescript
export interface Produto {
  id: string; nome: string; unidade_base: string; unidade_maior: string; fator_conversao: number
  ativo: boolean; created_at: string
}
```

por:

```typescript
export interface UnidadeMedida {
  id: string; nome: string; ativo: boolean; created_at: string
}
export interface Produto {
  id: string; nome: string; unidade_base_id: string; unidade_maior_id: string; fator_conversao: number
  ativo: boolean; created_at: string
  unidade_base?: UnidadeMedida; unidade_maior?: UnidadeMedida
}
```

- [ ] **Step 2: Checagem de tipos (espera-se falha nas pages que ainda leem `unidade_base` como string)**

Run: `npx tsc --noEmit`
Expected: erros em `app/produtos/page.tsx`, `app/compras/page.tsx`, `app/vendas/page.tsx`, `app/estoque-inicial/page.tsx`, `app/relatorios/page.tsx`, `app/dashboard/page.tsx` — corrigidos nas próximas tasks.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): adiciona UnidadeMedida e generaliza Produto pra unidade_base_id/unidade_maior_id"
```

---

### Task 3: Painel de Unidades (`app/unidades/page.tsx`) + menu

**Files:**
- Create: `app/unidades/page.tsx`
- Modify: `components/Sidebar.tsx:7-25`

**Interfaces:**
- Consome: `UnidadeMedida` (Task 2).
- Produz: tela `/unidades` — usada pelas telas de Produtos, Compras, Vendas etc. só como fonte de leitura via `btx_unidades_medida`, sem interface de código compartilhada.

- [ ] **Step 1: Criar `app/unidades/page.tsx`**

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { UnidadeMedida } from '@/types'

const EMPTY = { nome: '' }

export default function UnidadesPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<UnidadeMedida[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('btx_unidades_medida').select('*').eq('ativo', true).order('nome')
    setRows(data ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setEditId(null); setErr(''); setModal(true) }
  function openEdit(r: UnidadeMedida) { setForm({ nome: r.nome }); setEditId(r.id); setErr(''); setModal(true) }

  async function save() {
    if (!form.nome.trim()) return setErr('Nome é obrigatório.')
    setSaving(true)
    if (editId) {
      await sb.from('btx_unidades_medida').update({ nome: form.nome }).eq('id', editId)
    } else {
      await sb.from('btx_unidades_medida').insert({ nome: form.nome })
    }
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_unidades_medida').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Unidades</h1><div className="page-subtitle">Nomes de unidade usados no cadastro de produtos</div></div>
        {isAdmin && <button className="btn btn-primary" onClick={openNew}>+ Nova unidade</button>}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th>{isAdmin && <th>Ações</th>}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2} className="empty-state">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={2} className="empty-state">Nenhuma unidade cadastrada.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.nome}</td>
                {isAdmin && (
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar unidade' : 'Nova unidade'} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        {err && <div className="alert alert-red">{err}</div>}
        <div className="form-group">
          <label className="form-label">Nome (ex: Carteira, Caixa, Display, Unidade)</label>
          <input className="form-input" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} />
        </div>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
```

- [ ] **Step 2: Adicionar item de menu em `components/Sidebar.tsx`**

Substituir:

```typescript
  { section: 'Cadastros' },
  { href: '/produtos', label: 'Produtos' },
  { href: '/fornecedores', label: 'Fornecedores' },
```

por:

```typescript
  { section: 'Cadastros' },
  { href: '/produtos', label: 'Produtos' },
  { href: '/unidades', label: 'Unidades' },
  { href: '/fornecedores', label: 'Fornecedores' },
```

- [ ] **Step 3: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/unidades/page.tsx` nem `components/Sidebar.tsx`.

- [ ] **Step 4: Teste manual**

Run: `npm run dev`, abrir `/unidades` como admin. Confirmar que aparecem as unidades migradas (pelo menos "Carteira" e "Caixa", possivelmente "Display"/"Unidade" se você já tiver criado o produto de teste). Cadastrar uma unidade nova, ex: "Fardo".

- [ ] **Step 5: Commit**

```bash
git add app/unidades/page.tsx components/Sidebar.tsx
git commit -m "feat(unidades): painel CRUD do catálogo de unidades de medida"
```

---

### Task 4: Cadastro de produtos com dropdowns (`app/produtos/page.tsx`)

**Files:**
- Modify: `app/produtos/page.tsx` (arquivo inteiro)

**Interfaces:**
- Consome: `Produto`, `UnidadeMedida` (Task 2), tabela `btx_unidades_medida` (Task 3).

- [ ] **Step 1: Reescrever o arquivo**

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Produto, UnidadeMedida } from '@/types'

const EMPTY = { nome: '', unidade_base_id: '', unidade_maior_id: '', fator_conversao: 480 }

export default function ProdutosPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Produto[]>([])
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: u }] = await Promise.all([
      sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(id,nome), unidade_maior:btx_unidades_medida!unidade_maior_id(id,nome)').eq('ativo', true).order('nome'),
      sb.from('btx_unidades_medida').select('*').eq('ativo', true).order('nome'),
    ])
    setRows(p ?? [])
    setUnidades(u ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setEditId(null); setErr(''); setModal(true) }
  function openEdit(r: Produto) {
    setForm({ nome: r.nome, unidade_base_id: r.unidade_base_id, unidade_maior_id: r.unidade_maior_id, fator_conversao: r.fator_conversao })
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!form.nome.trim()) return setErr('Nome é obrigatório.')
    if (!form.unidade_base_id || !form.unidade_maior_id) return setErr('Escolha as duas unidades.')
    setSaving(true)
    const payload = { nome: form.nome, unidade_base_id: form.unidade_base_id, unidade_maior_id: form.unidade_maior_id, fator_conversao: form.fator_conversao }
    if (editId) {
      await sb.from('btx_produtos').update(payload).eq('id', editId)
    } else {
      await sb.from('btx_produtos').insert(payload)
    }
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_produtos').update({ ativo: false }).eq('id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Produtos</h1><div className="page-subtitle">Catálogo de produtos da distribuidora</div></div>
        {isAdmin && <button className="btn btn-primary" onClick={openNew}>+ Novo produto</button>}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Produto</th><th>Unid. base</th><th>Unid. maior</th><th>Fator</th>{isAdmin && <th>Ações</th>}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="empty-state">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">Nenhum produto cadastrado.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.nome}</td>
                <td>{r.unidade_base?.nome}</td>
                <td>{r.unidade_maior?.nome}</td>
                <td className="mono">{r.fator_conversao}</td>
                {isAdmin && (
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar produto' : 'Novo produto'} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      >
        {err && <div className="alert alert-red">{err}</div>}
        <div className="form-group">
          <label className="form-label">Nome</label>
          <input className="form-input" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Unidade base</label>
          <select className="form-select" value={form.unidade_base_id} onChange={e => setForm(f => ({...f, unidade_base_id: e.target.value}))}>
            <option value="">Selecione...</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Unidade maior</label>
          <select className="form-select" value={form.unidade_maior_id} onChange={e => setForm(f => ({...f, unidade_maior_id: e.target.value}))}>
            <option value="">Selecione...</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Fator de conversão (quantas unid. base numa unid. maior)</label>
          <input className="form-input" type="number" min={1} value={form.fator_conversao} onChange={e => setForm(f => ({...f, fator_conversao: Number(e.target.value)}))} />
        </div>
      </Modal>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
```

- [ ] **Step 2: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/produtos/page.tsx`.

- [ ] **Step 3: Teste manual**

Run: `npm run dev`, abrir `/produtos`. Editar o produto de teste ("DISPLAY TESTE" ou similar) e confirmar que os dropdowns de Unidade base/maior já vêm pré-selecionados com os valores certos, e que dá pra trocar e salvar.

- [ ] **Step 4: Commit**

```bash
git add app/produtos/page.tsx
git commit -m "feat(produtos): dropdowns de unidade base/maior a partir do catálogo"
```

---

### Task 5: Compras — ler unidades via catálogo (`app/compras/page.tsx`)

**Files:**
- Modify: `app/compras/page.tsx:44,46,118,166,183-184`

**Interfaces:**
- Consome: `Produto.unidade_base?.nome` / `unidade_maior?.nome` (Task 2/4).

- [ ] **Step 1: Atualizar as queries em `load()`**

Substituir:

```typescript
      (() => { let q = sb.from('btx_compras').select('*, fornecedor:btx_fornecedores(id,nome), itens:btx_compras_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,unidade_base,unidade_maior,fator_conversao))').eq('ativo', true).order('data_compra', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_fornecedores').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
```

por:

```typescript
      (() => { let q = sb.from('btx_compras').select('*, fornecedor:btx_fornecedores(id,nome), itens:btx_compras_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,fator_conversao,unidade_base:btx_unidades_medida!unidade_base_id(nome),unidade_maior:btx_unidades_medida!unidade_maior_id(nome)))').eq('ativo', true).order('data_compra', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_fornecedores').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true).order('nome'),
```

- [ ] **Step 2: Atualizar a linha de resumo de itens na listagem**

Substituir:

```tsx
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: string }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base ?? ''}</div>)}</td>
```

por:

```tsx
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: { nome: string } }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base?.nome ?? ''}</div>)}</td>
```

- [ ] **Step 3: Atualizar o seletor de unidade por item**

Substituir:

```tsx
                <select className="form-select" value={it.unidade} onChange={e => updateItem(idx, 'unidade', e.target.value)}>
                  <option value="base">{produtoSel?.unidade_base ?? 'Unid. base'}</option>
                  <option value="maior">{produtoSel?.unidade_maior ?? 'Unid. maior'}</option>
                </select>
```

por:

```tsx
                <select className="form-select" value={it.unidade} onChange={e => updateItem(idx, 'unidade', e.target.value)}>
                  <option value="base">{produtoSel?.unidade_base?.nome ?? 'Unid. base'}</option>
                  <option value="maior">{produtoSel?.unidade_maior?.nome ?? 'Unid. maior'}</option>
                </select>
```

- [ ] **Step 4: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/compras/page.tsx`.

- [ ] **Step 5: Teste manual**

Run: `npm run dev`, abrir `/compras`, criar uma NF com o produto de teste. Confirmar que o dropdown de unidade mostra os nomes certos (ex: "Unidade" / "Display") e que a listagem mostra `qtd unidade` com o nome correto.

- [ ] **Step 6: Commit**

```bash
git add app/compras/page.tsx
git commit -m "feat(compras): lê nomes de unidade via catálogo btx_unidades_medida"
```

---

### Task 6: Vendas — ler unidades via catálogo (`app/vendas/page.tsx`)

**Files:**
- Modify: `app/vendas/page.tsx:44,46,118,166,183-184`

**Interfaces:**
- Consome: mesmo padrão da Task 5 (arquivo espelha `compras/page.tsx`).

- [ ] **Step 1: Atualizar as queries em `load()`**

Substituir:

```typescript
      (() => { let q = sb.from('btx_vendas').select('*, cliente:btx_clientes(id,nome), itens:btx_vendas_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,unidade_base,unidade_maior,fator_conversao))').eq('ativo', true).order('data_venda', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_clientes').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
```

por:

```typescript
      (() => { let q = sb.from('btx_vendas').select('*, cliente:btx_clientes(id,nome), itens:btx_vendas_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,fator_conversao,unidade_base:btx_unidades_medida!unidade_base_id(nome),unidade_maior:btx_unidades_medida!unidade_maior_id(nome)))').eq('ativo', true).order('data_venda', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_clientes').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true).order('nome'),
```

- [ ] **Step 2: Atualizar a linha de resumo de itens na listagem**

Substituir:

```tsx
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: string }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base ?? ''}</div>)}</td>
```

por:

```tsx
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: { nome: string } }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base?.nome ?? ''}</div>)}</td>
```

- [ ] **Step 3: Atualizar o seletor de unidade por item**

Substituir:

```tsx
                <select className="form-select" value={it.unidade} onChange={e => updateItem(idx, 'unidade', e.target.value)}>
                  <option value="base">{produtoSel?.unidade_base ?? 'Unid. base'}</option>
                  <option value="maior">{produtoSel?.unidade_maior ?? 'Unid. maior'}</option>
                </select>
```

por:

```tsx
                <select className="form-select" value={it.unidade} onChange={e => updateItem(idx, 'unidade', e.target.value)}>
                  <option value="base">{produtoSel?.unidade_base?.nome ?? 'Unid. base'}</option>
                  <option value="maior">{produtoSel?.unidade_maior?.nome ?? 'Unid. maior'}</option>
                </select>
```

- [ ] **Step 4: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/vendas/page.tsx`.

- [ ] **Step 5: Teste manual**

Run: `npm run dev`, abrir `/vendas`, repetir o mesmo teste da Task 5.

- [ ] **Step 6: Commit**

```bash
git add app/vendas/page.tsx
git commit -m "feat(vendas): lê nomes de unidade via catálogo btx_unidades_medida"
```

---

### Task 7: Estoque inicial — ler unidades via catálogo (`app/estoque-inicial/page.tsx`)

**Files:**
- Modify: `app/estoque-inicial/page.tsx:35,116`

**Interfaces:**
- Consome: `Produto.unidade_base?.nome` / `unidade_maior?.nome` (Task 2/4).

- [ ] **Step 1: Atualizar a query em `loadData()`**

Substituir:

```typescript
    const { data: prods } = await sb.from('btx_produtos').select('*').eq('ativo', true).order('nome')
```

por:

```typescript
    const { data: prods } = await sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true).order('nome')
```

- [ ] **Step 2: Atualizar a coluna "Conversão"**

Substituir:

```tsx
                    <td className="mono" style={{ fontSize: 11 }}>{p.unidade_base} → {p.unidade_maior} (×{p.fator_conversao})</td>
```

por:

```tsx
                    <td className="mono" style={{ fontSize: 11 }}>{p.unidade_base?.nome} → {p.unidade_maior?.nome} (×{p.fator_conversao})</td>
```

- [ ] **Step 3: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/estoque-inicial/page.tsx`.

- [ ] **Step 4: Teste manual**

Run: `npm run dev`, abrir `/estoque-inicial`, confirmar que a coluna "Conversão" mostra os nomes certos.

- [ ] **Step 5: Commit**

```bash
git add app/estoque-inicial/page.tsx
git commit -m "feat(estoque-inicial): lê nomes de unidade via catálogo btx_unidades_medida"
```

---

### Task 8: Relatórios — ler unidades via catálogo (`app/relatorios/page.tsx`)

**Files:**
- Modify: `app/relatorios/page.tsx:36,138`

**Interfaces:**
- Consome: `Produto.unidade_base?.nome` / `unidade_maior?.nome` (Task 2/4).

- [ ] **Step 1: Atualizar a query de produtos em `load()`**

Substituir:

```typescript
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
```

por:

```typescript
      sb.from('btx_produtos').select('*, unidade_base:btx_unidades_medida!unidade_base_id(nome), unidade_maior:btx_unidades_medida!unidade_maior_id(nome)').eq('ativo', true).order('nome'),
```

- [ ] **Step 2: Atualizar a coluna "Conversão" da tabela de posição de estoque**

Substituir:

```tsx
                    <td className="mono" style={{ fontSize: 11 }}>{r.produto.unidade_base} → {r.produto.unidade_maior} (×{r.produto.fator_conversao})</td>
```

por:

```tsx
                    <td className="mono" style={{ fontSize: 11 }}>{r.produto.unidade_base?.nome} → {r.produto.unidade_maior?.nome} (×{r.produto.fator_conversao})</td>
```

- [ ] **Step 3: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/relatorios/page.tsx`.

- [ ] **Step 4: Teste manual**

Run: `npm run dev`, abrir `/relatorios`, confirmar que a coluna "Conversão" mostra os nomes certos.

- [ ] **Step 5: Commit**

```bash
git add app/relatorios/page.tsx
git commit -m "feat(relatorios): lê nomes de unidade via catálogo btx_unidades_medida"
```

---

### Task 9: Dashboard — ler unidades via catálogo (`app/dashboard/page.tsx`)

**Files:**
- Modify: `app/dashboard/page.tsx:121,209-214`

**Interfaces:**
- Consome: `Produto.unidade_base?.nome` / `unidade_maior?.nome` (Task 2/4). `EstoqueItem` continua guardando string plana (`unidade_base`/`unidade_maior`), só a origem do valor muda.

- [ ] **Step 1: Atualizar a query de produtos em `carregarEstoque`**

Substituir:

```typescript
        .select('id,nome,unidade_base,unidade_maior,fator_conversao')
```

por:

```typescript
        .select('id,nome,fator_conversao,unidade_base:btx_unidades_medida!unidade_base_id(nome),unidade_maior:btx_unidades_medida!unidade_maior_id(nome)')
```

- [ ] **Step 2: Atualizar o mapeamento final de `estoque`**

Substituir:

```tsx
      return {
        produto: p.nome,
        qtd,
        caixas: qtd / p.fator_conversao,
        unidade_base: p.unidade_base,
        unidade_maior: p.unidade_maior
      }
```

por:

```tsx
      return {
        produto: p.nome,
        qtd,
        caixas: qtd / p.fator_conversao,
        unidade_base: p.unidade_base?.nome ?? '',
        unidade_maior: p.unidade_maior?.nome ?? ''
      }
```

- [ ] **Step 3: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro em nenhum arquivo do projeto (última task da lista).

- [ ] **Step 4: Teste manual**

Run: `npm run dev`, abrir `/dashboard`, confirmar que a tabela "Estoque Atual" mostra os nomes certos.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): lê nomes de unidade via catálogo btx_unidades_medida"
```

---

## Checklist final

- [ ] `npx tsc --noEmit` limpo na raiz do projeto.
- [ ] `npm run build` roda sem erros.
- [ ] Migration `supabase_migration_catalogo_unidades.sql` executada no Supabase de produção (depois da migration anterior).
- [ ] Painel `/unidades` acessível no menu, permite cadastrar/editar/excluir unidades.
- [ ] Cadastro de produto usa dropdowns em vez de texto livre pras unidades.
