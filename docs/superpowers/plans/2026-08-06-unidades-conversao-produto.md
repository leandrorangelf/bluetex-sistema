# Unidades de Conversão por Produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cadastrar produtos com unidade de medida e fator de conversão configuráveis (ex: "Display" com 6 "Unidades"), em vez do modelo fixo "carteira/caixa" hardcoded hoje.

**Architecture:** Generaliza `btx_produtos` com 3 campos (`unidade_base`, `unidade_maior`, `fator_conversao`) no lugar do único `carteiras_por_caixa`. As colunas `qtd_carteiras` nas tabelas transacionais (compras_itens, vendas_itens, estoque_inicial) continuam guardando a quantidade na unidade base do produto — não são renomeadas. As telas passam a rotular e converter dinamicamente com base no produto selecionado.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Supabase (Postgres/RLS). Sem framework de testes no projeto (`package.json` não tem jest/vitest) — verificação por `npx tsc --noEmit` (checagem de tipos) e teste manual via `npm run dev`, seguindo o padrão já existente no projeto.

## Global Constraints

- Não introduzir dependências novas (sem framework de teste, sem lib de state) — projeto usa apenas React state + Supabase client direto nas pages.
- Não renomear a coluna `qtd_carteiras` em `btx_compras_itens`, `btx_vendas_itens`, `btx_estoque_inicial`, `btx_ajustes_estoque` — fora de escopo (ver spec).
- A migration SQL deve ser executada manualmente no SQL Editor do Supabase **antes** do deploy do código (a Task 1 só entrega o arquivo; a execução em produção é uma ação do usuário, não automatizável a partir daqui).
- Cada task termina com `npx tsc --noEmit` limpo (rodado da raiz do projeto) antes do commit.
- Referência de spec: `docs/superpowers/specs/2026-08-06-unidades-conversao-produto-design.md`.

---

### Task 1: Migration SQL + schema fonte

**Files:**
- Create: `supabase_migration_unidades_conversao.sql`
- Modify: `supabase_schema.sql:61-75`

**Interfaces:**
- Produz: colunas `unidade_base TEXT`, `unidade_maior TEXT`, `fator_conversao INTEGER` em `btx_produtos` (renomeando `carteiras_por_caixa` → `fator_conversao`). Todas as tasks seguintes dependem desse shape.

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- ============================================================
-- Migration: unidades de conversão configuráveis por produto
-- Execute no SQL Editor do Supabase (projeto já provisionado)
-- ============================================================

ALTER TABLE btx_produtos RENAME COLUMN carteiras_por_caixa TO fator_conversao;
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_base TEXT NOT NULL DEFAULT 'Carteira';
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_maior TEXT NOT NULL DEFAULT 'Caixa';
```

- [ ] **Step 2: Atualizar `supabase_schema.sql` pra refletir o novo shape (instalações novas)**

Substituir (linhas 61-75):

```sql
CREATE TABLE IF NOT EXISTS btx_produtos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  carteiras_por_caixa INTEGER NOT NULL DEFAULT 480,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_produtos" ON btx_produtos FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_produtos" ON btx_produtos FOR ALL USING (btx_get_my_role()='admin');

INSERT INTO btx_produtos(nome, carteiras_por_caixa) VALUES
  ('GUDANG RED',480),('GUDANG GREEN',480),
  ('GUDANG TWIN TEN',500),('CRETEC MENTA',500),('CRETEC CEREJA',500)
ON CONFLICT DO NOTHING;
```

por:

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

- [ ] **Step 3: Commit**

```bash
git add supabase_migration_unidades_conversao.sql supabase_schema.sql
git commit -m "feat(db): adiciona unidade_base/unidade_maior/fator_conversao em btx_produtos"
```

**⚠️ Ação manual do usuário:** antes de publicar o código das próximas tasks, rodar `supabase_migration_unidades_conversao.sql` no SQL Editor do Supabase do projeto em produção. Sem isso, as próximas tasks quebram em runtime (coluna `carteiras_por_caixa` deixa de existir no código mas ainda existe no banco até a migration rodar, ou vice-versa se a migration rodar antes do deploy — nesse caso o app antigo é que quebra brevemente. Ordem recomendada: rodar migration, depois publicar o build novo).

---

### Task 2: Atualizar tipos TypeScript

**Files:**
- Modify: `types/index.ts:12-14`

**Interfaces:**
- Consome: nada (tipos puros).
- Produz: `Produto { id, nome, unidade_base: string, unidade_maior: string, fator_conversao: number, ativo, created_at }`. Toda task seguinte usa esse shape.

- [ ] **Step 1: Editar a interface `Produto`**

Substituir:

```typescript
export interface Produto {
  id: string; nome: string; carteiras_por_caixa: number; ativo: boolean; created_at: string
}
```

por:

```typescript
export interface Produto {
  id: string; nome: string; unidade_base: string; unidade_maior: string; fator_conversao: number
  ativo: boolean; created_at: string
}
```

- [ ] **Step 2: Rodar checagem de tipos (espera-se falha nas pages que ainda usam `carteiras_por_caixa`)**

Run: `npx tsc --noEmit`
Expected: erros em `app/produtos/page.tsx`, `app/compras/page.tsx`, `app/vendas/page.tsx`, `app/estoque-inicial/page.tsx`, `app/relatorios/page.tsx`, `app/dashboard/page.tsx`, `lib/utils.ts` — referenciando `carteiras_por_caixa` inexistente. Essas são corrigidas nas próximas tasks.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): generaliza Produto pra unidade_base/unidade_maior/fator_conversao"
```

---

### Task 3: Renomear helper de conversão em `lib/utils.ts`

**Files:**
- Modify: `lib/utils.ts:11-14`

**Interfaces:**
- Produz: `converterParaUnidadeMaior(qtdBase: number, fatorConversao: number): string`. Usado por `app/relatorios/page.tsx` (Task 8).

- [ ] **Step 1: Renomear a função**

Substituir:

```typescript
export function carteirasParaCaixas(carteiras: number, carteiras_por_caixa: number): string {
  const caixas = carteiras / carteiras_por_caixa
  return caixas % 1 === 0 ? caixas.toString() : caixas.toFixed(2)
}
```

por:

```typescript
export function converterParaUnidadeMaior(qtdBase: number, fatorConversao: number): string {
  const qtd = qtdBase / fatorConversao
  return qtd % 1 === 0 ? qtd.toString() : qtd.toFixed(2)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/utils.ts
git commit -m "refactor(utils): renomeia carteirasParaCaixas para converterParaUnidadeMaior"
```

---

### Task 4: Cadastro de produtos (`app/produtos/page.tsx`)

**Files:**
- Modify: `app/produtos/page.tsx` (arquivo inteiro, 105 linhas)

**Interfaces:**
- Consome: `Produto` (Task 2).
- Produz: nenhuma interface nova consumida por outras tasks (é uma folha da árvore).

- [ ] **Step 1: Reescrever o arquivo**

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Produto } from '@/types'

const EMPTY = { nome: '', unidade_base: 'Carteira', unidade_maior: 'Caixa', fator_conversao: 480 }

export default function ProdutosPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Produto[]>([])
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
    const { data } = await sb.from('btx_produtos').select('*').eq('ativo', true).order('nome')
    setRows(data ?? [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setEditId(null); setErr(''); setModal(true) }
  function openEdit(r: Produto) {
    setForm({ nome: r.nome, unidade_base: r.unidade_base, unidade_maior: r.unidade_maior, fator_conversao: r.fator_conversao })
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!form.nome.trim()) return setErr('Nome é obrigatório.')
    if (!form.unidade_base.trim() || !form.unidade_maior.trim()) return setErr('Informe as duas unidades.')
    setSaving(true)
    const payload = { nome: form.nome, unidade_base: form.unidade_base, unidade_maior: form.unidade_maior, fator_conversao: form.fator_conversao }
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
                <td>{r.unidade_base}</td>
                <td>{r.unidade_maior}</td>
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
          <label className="form-label">Unidade base (ex: Carteira, Unidade)</label>
          <input className="form-input" value={form.unidade_base} onChange={e => setForm(f => ({...f, unidade_base: e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Unidade maior (ex: Caixa, Display)</label>
          <input className="form-input" value={form.unidade_maior} onChange={e => setForm(f => ({...f, unidade_maior: e.target.value}))} />
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
Expected: sem erros em `app/produtos/page.tsx` (erros restantes são das outras pages, ainda não corrigidas).

- [ ] **Step 3: Teste manual**

Run: `npm run dev`, abrir `/produtos` como admin, cadastrar "DISPLAY TESTE" com Unidade base=`Unidade`, Unidade maior=`Display`, Fator=`6`. Confirmar que aparece na listagem com as 3 colunas corretas.

- [ ] **Step 4: Commit**

```bash
git add app/produtos/page.tsx
git commit -m "feat(produtos): cadastro com unidade base/maior e fator de conversão configuráveis"
```

---

### Task 5: Itens de compra com seletor de unidade (`app/compras/page.tsx`)

**Files:**
- Modify: `app/compras/page.tsx` (arquivo inteiro, 192 linhas)

**Interfaces:**
- Consome: `Produto` (Task 2, campos `unidade_base`, `unidade_maior`, `fator_conversao`).
- Produz: padrão `ItemForm { produto_id, qtdInput, unidade: 'base'|'maior', valor }` + helper `qtdParaBase` — o mesmo padrão é replicado em `app/vendas/page.tsx` (Task 6), então mantenha os nomes idênticos.

- [ ] **Step 1: Reescrever o arquivo**

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, hoje } from '@/lib/utils'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import type { Compra, Fornecedor, Produto } from '@/types'

interface ItemForm { produto_id: string; qtdInput: number; unidade: 'base' | 'maior'; valor: number }
const EMPTY_ITEM: ItemForm = { produto_id: '', qtdInput: 0, unidade: 'base', valor: 0 }
const EMPTY = { fornecedor_id: '', data_compra: hoje(), numero_nf: '', valor_st: 0, observacoes: '' }

function qtdParaBase(item: ItemForm, produtos: Produto[]): number {
  const p = produtos.find(pr => pr.id === item.produto_id)
  const fator = p?.fator_conversao ?? 1
  return item.unidade === 'maior' ? Math.round(item.qtdInput * fator) : item.qtdInput
}

export default function ComprasPage() {
  const { unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<Compra[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [itens, setItens] = useState<ItemForm[]>([{ ...EMPTY_ITEM }])
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    const u = unidadeAtiva
    const [{ data: d }, { data: f }, { data: p }] = await Promise.all([
      (() => { let q = sb.from('btx_compras').select('*, fornecedor:btx_fornecedores(id,nome), itens:btx_compras_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,unidade_base,unidade_maior,fator_conversao))').eq('ativo', true).order('data_compra', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_fornecedores').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
    ])
    setRows(d ?? []); setFornecedores(f ?? []); setProdutos(p ?? [])
    setLoading(false)
  }

  const totalProdutos = itens.reduce((s, i) => s + Number(i.valor), 0)
  const totalNF = totalProdutos + Number(form.valor_st)

  function addItem() { setItens(prev => [...prev, { ...EMPTY_ITEM }]) }
  function removeItem(idx: number) { if (itens.length > 1) setItens(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: keyof ItemForm, value: string | number) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function openNew() { setForm(EMPTY); setItens([{ ...EMPTY_ITEM }]); setParcelas([]); setEditId(null); setErr(''); setModal(true) }

  async function openEdit(r: Compra) {
    setForm({ fornecedor_id: r.fornecedor_id ?? '', data_compra: r.data_compra, numero_nf: r.numero_nf ?? '', valor_st: (r as unknown as { valor_st?: number }).valor_st ?? 0, observacoes: r.observacoes ?? '' })
    const { data: its } = await sb.from('btx_compras_itens').select('*').eq('compra_id', r.id)
    setItens(its && its.length > 0 ? its.map((i: { produto_id: string; qtd_carteiras: number; valor: number }) => ({ produto_id: i.produto_id, qtdInput: i.qtd_carteiras, unidade: 'base' as const, valor: i.valor })) : [{ ...EMPTY_ITEM }])
    const { data: parcs } = await sb.from('btx_parcelas').select('*').eq('origem_id', r.id).eq('ativo', true).order('numero_parcela')
    setParcelas((parcs ?? []).map((p: { numero_parcela: number; vencimento: string; valor: number; numero_boleto: string | null; observacoes: string | null }) => ({ numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, numero_boleto: p.numero_boleto ?? '', observacoes: p.observacoes ?? '' })))
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!itens[0].produto_id) return setErr('Adicione pelo menos um produto.')
    const unidade = unidadeAtiva
    if (!unidade) return setErr('Sem unidade ativa.')
    setSaving(true)
    const payload = { unidade, fornecedor_id: form.fornecedor_id || null, data_compra: form.data_compra, numero_nf: form.numero_nf || null, valor_st: Number(form.valor_st), valor_total: totalNF, observacoes: form.observacoes || null }
    let id = editId
    if (editId) {
      await sb.from('btx_compras').update(payload).eq('id', editId)
      await sb.from('btx_compras_itens').delete().eq('compra_id', editId)
      await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', editId)
    } else {
      const { data } = await sb.from('btx_compras').insert(payload).select('id').single()
      id = data?.id
    }
    if (id) {
      await sb.from('btx_compras_itens').insert(itens.filter(i => i.produto_id).map(i => ({ compra_id: id, produto_id: i.produto_id, qtd_carteiras: qtdParaBase(i, produtos), valor: i.valor })))
      if (parcelas.length > 0) await sb.from('btx_parcelas').insert(parcelas.map(p => ({ unidade, tipo: 'pagar', origem: 'compra', origem_id: id, numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null })))
    }
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_compras').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Compras</h1><div className="page-subtitle">Entradas de estoque por NF</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ Nova compra</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>NF</th><th>Fornecedor</th><th>Produtos</th><th>ST</th><th>Total NF</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhuma compra lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_compra)}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td>{(r.fornecedor as unknown as { nome: string })?.nome ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: string }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base ?? ''}</div>)}</td>
                <td className="mono">{formatMoeda((r as unknown as { valor_st?: number }).valor_st ?? 0)}</td>
                <td className="mono">{formatMoeda(r.valor_total)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar compra' : 'Nova compra'} size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></>}>
        {err && <div className="alert alert-red">{err}</div>}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Fornecedor</label>
            <select className="form-select" value={form.fornecedor_id} onChange={e => setForm(f => ({...f, fornecedor_id: e.target.value}))}>
              <option value="">Nenhum</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={form.data_compra} onChange={e => setForm(f => ({...f, data_compra: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Nº NF</label>
            <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({...f, numero_nf: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor ST (R$)</label>
            <input className="form-input" type="number" step="0.01" min={0} value={form.valor_st || ''} placeholder="0,00" onChange={e => setForm(f => ({...f, valor_st: parseFloat(e.target.value) || 0}))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Observações</label>
            <input className="form-input" value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} />
          </div>
        </div>

        <hr className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Produtos da NF</div>
          <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Adicionar produto</button>
        </div>
        {itens.map((it, idx) => {
          const produtoSel = produtos.find(p => p.id === it.produto_id)
          return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Produto</label>}
                <select className="form-select" value={it.produto_id} onChange={e => updateItem(idx, 'produto_id', e.target.value)}>
                  <option value="">Selecione...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Quantidade</label>}
                <input className="form-input" type="number" min={0} value={it.qtdInput || ''} placeholder="0" onChange={e => updateItem(idx, 'qtdInput', parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Unidade</label>}
                <select className="form-select" value={it.unidade} onChange={e => updateItem(idx, 'unidade', e.target.value)}>
                  <option value="base">{produtoSel?.unidade_base ?? 'Unid. base'}</option>
                  <option value="maior">{produtoSel?.unidade_maior ?? 'Unid. maior'}</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Valor (R$)</label>}
                <input className="form-input" type="number" step="0.01" min={0} value={it.valor || ''} placeholder="0,00" onChange={e => updateItem(idx, 'valor', parseFloat(e.target.value) || 0)} />
              </div>
              <button className="btn btn-danger btn-sm" style={{ marginBottom: 0 }} onClick={() => removeItem(idx)} disabled={itens.length === 1}>✕</button>
            </div>
          )
        })}
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Produtos: {formatMoeda(totalProdutos)} + ST: {formatMoeda(Number(form.valor_st))}
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginTop: 4 }}>
          Total NF: {formatMoeda(totalNF)}
        </div>
        <hr className="divider" />
        <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo="pagar" />
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
```

- [ ] **Step 2: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/compras/page.tsx`.

- [ ] **Step 3: Teste manual**

Run: `npm run dev`, abrir `/compras`, criar uma NF com o produto "DISPLAY TESTE" (criado na Task 4), escolher unidade "Display", digitar `2`. Salvar e reabrir em edição: o campo deve mostrar `12` na unidade base (2 displays × 6 = 12 unidades).

- [ ] **Step 4: Commit**

```bash
git add app/compras/page.tsx
git commit -m "feat(compras): seletor de unidade (base/maior) por item da NF"
```

---

### Task 6: Itens de venda com seletor de unidade (`app/vendas/page.tsx`)

**Files:**
- Modify: `app/vendas/page.tsx` (arquivo inteiro, 192 linhas)

**Interfaces:**
- Consome: mesmo padrão `ItemForm`/`qtdParaBase` da Task 5 (duplicado aqui pois `compras` e `vendas` já são páginas independentes sem módulo compartilhado — segue o padrão existente do arquivo, que já duplica toda a estrutura de `compras/page.tsx`).
- Produz: nada consumido por outras tasks.

- [ ] **Step 1: Reescrever o arquivo**

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { formatMoeda, formatData, hoje } from '@/lib/utils'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import ParcelasEditor, { type ParcelaForm } from '@/components/ParcelasEditor'
import type { Venda, Cliente, Produto } from '@/types'

interface ItemForm { produto_id: string; qtdInput: number; unidade: 'base' | 'maior'; valor: number }
const EMPTY_ITEM: ItemForm = { produto_id: '', qtdInput: 0, unidade: 'base', valor: 0 }
const EMPTY = { cliente_id: '', data_venda: hoje(), numero_nf: '', valor_st: 0, observacoes: '' }

function qtdParaBase(item: ItemForm, produtos: Produto[]): number {
  const p = produtos.find(pr => pr.id === item.produto_id)
  const fator = p?.fator_conversao ?? 1
  return item.unidade === 'maior' ? Math.round(item.qtdInput * fator) : item.qtdInput
}

export default function VendasPage() {
  const { unidadeAtiva } = useAuth()
  const [rows, setRows] = useState<Venda[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [itens, setItens] = useState<ItemForm[]>([{ ...EMPTY_ITEM }])
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const sb = createClient()

  useEffect(() => { load() }, [unidadeAtiva])

  async function load() {
    setLoading(true)
    const u = unidadeAtiva
    const [{ data: d }, { data: c }, { data: p }] = await Promise.all([
      (() => { let q = sb.from('btx_vendas').select('*, cliente:btx_clientes(id,nome), itens:btx_vendas_itens(id,produto_id,qtd_carteiras,valor,produto:btx_produtos(id,nome,unidade_base,unidade_maior,fator_conversao))').eq('ativo', true).order('data_venda', { ascending: false }); if (u) q = q.eq('unidade', u); return q })(),
      (() => { let q = sb.from('btx_clientes').select('*').eq('ativo', true).order('nome'); if (u) q = q.eq('unidade', u); return q })(),
      sb.from('btx_produtos').select('*').eq('ativo', true).order('nome'),
    ])
    setRows(d ?? []); setClientes(c ?? []); setProdutos(p ?? [])
    setLoading(false)
  }

  const totalProdutos = itens.reduce((s, i) => s + Number(i.valor), 0)
  const totalNF = totalProdutos + Number(form.valor_st)

  function addItem() { setItens(prev => [...prev, { ...EMPTY_ITEM }]) }
  function removeItem(idx: number) { if (itens.length > 1) setItens(prev => prev.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: keyof ItemForm, value: string | number) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function openNew() { setForm(EMPTY); setItens([{ ...EMPTY_ITEM }]); setParcelas([]); setEditId(null); setErr(''); setModal(true) }

  async function openEdit(r: Venda) {
    setForm({ cliente_id: r.cliente_id ?? '', data_venda: r.data_venda, numero_nf: r.numero_nf ?? '', valor_st: r.valor_st ?? 0, observacoes: r.observacoes ?? '' })
    const { data: its } = await sb.from('btx_vendas_itens').select('*').eq('venda_id', r.id)
    setItens(its && its.length > 0 ? its.map((i: { produto_id: string; qtd_carteiras: number; valor: number }) => ({ produto_id: i.produto_id, qtdInput: i.qtd_carteiras, unidade: 'base' as const, valor: i.valor })) : [{ ...EMPTY_ITEM }])
    const { data: parcs } = await sb.from('btx_parcelas').select('*').eq('origem_id', r.id).eq('ativo', true).order('numero_parcela')
    setParcelas((parcs ?? []).map((p: { numero_parcela: number; vencimento: string; valor: number; numero_boleto: string | null; observacoes: string | null }) => ({ numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, numero_boleto: p.numero_boleto ?? '', observacoes: p.observacoes ?? '' })))
    setEditId(r.id); setErr(''); setModal(true)
  }

  async function save() {
    if (!itens[0].produto_id) return setErr('Adicione pelo menos um produto.')
    const unidade = unidadeAtiva
    if (!unidade) return setErr('Sem unidade ativa.')
    setSaving(true)
    const payload = { unidade, cliente_id: form.cliente_id || null, data_venda: form.data_venda, numero_nf: form.numero_nf || null, valor_st: Number(form.valor_st), valor_total: totalNF, observacoes: form.observacoes || null }
    let id = editId
    if (editId) {
      await sb.from('btx_vendas').update(payload).eq('id', editId)
      await sb.from('btx_vendas_itens').delete().eq('venda_id', editId)
      await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', editId)
    } else {
      const { data } = await sb.from('btx_vendas').insert(payload).select('id').single()
      id = data?.id
    }
    if (id) {
      await sb.from('btx_vendas_itens').insert(itens.filter(i => i.produto_id).map(i => ({ venda_id: id, produto_id: i.produto_id, qtd_carteiras: qtdParaBase(i, produtos), valor: i.valor })))
      if (parcelas.length > 0) await sb.from('btx_parcelas').insert(parcelas.map(p => ({ unidade, tipo: 'receber', origem: 'venda', origem_id: id, numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, numero_boleto: p.numero_boleto || null, observacoes: p.observacoes || null })))
    }
    setSaving(false); setModal(false); load()
  }

  async function remove(id: string) {
    setSaving(true)
    await sb.from('btx_vendas').update({ ativo: false }).eq('id', id)
    await sb.from('btx_parcelas').update({ ativo: false }).eq('origem_id', id)
    setSaving(false); setConfirm(null); load()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Vendas / NFs</h1><div className="page-subtitle">Saídas de estoque por NF</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ Nova venda</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>NF</th><th>Cliente</th><th>Produtos</th><th>ST</th><th>Total NF</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">Carregando...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Nenhuma venda lançada.</td></tr>
            : rows.map(r => (
              <tr key={r.id}>
                <td className="mono">{formatData(r.data_venda)}</td>
                <td className="mono">{r.numero_nf ?? '—'}</td>
                <td>{(r.cliente as unknown as { nome: string })?.nome ?? '—'}</td>
                <td style={{ fontSize: 11 }}>{((r.itens as unknown as { produto: { nome: string; unidade_base: string }; qtd_carteiras: number }[]) ?? []).map((it, i) => <div key={i}>{it.produto?.nome} — {it.qtd_carteiras} {it.produto?.unidade_base ?? ''}</div>)}</td>
                <td className="mono">{formatMoeda(r.valor_st ?? 0)}</td>
                <td className="mono">{formatMoeda(r.valor_total)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirm(r.id)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar venda' : 'Nova venda'} size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></>}>
        {err && <div className="alert alert-red">{err}</div>}
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <select className="form-select" value={form.cliente_id} onChange={e => setForm(f => ({...f, cliente_id: e.target.value}))}>
              <option value="">Nenhum</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={form.data_venda} onChange={e => setForm(f => ({...f, data_venda: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Nº NF</label>
            <input className="form-input" value={form.numero_nf} onChange={e => setForm(f => ({...f, numero_nf: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor ST (R$)</label>
            <input className="form-input" type="number" step="0.01" min={0} value={form.valor_st || ''} placeholder="0,00" onChange={e => setForm(f => ({...f, valor_st: parseFloat(e.target.value) || 0}))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Observações</label>
            <input className="form-input" value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} />
          </div>
        </div>

        <hr className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Produtos da NF</div>
          <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Adicionar produto</button>
        </div>
        {itens.map((it, idx) => {
          const produtoSel = produtos.find(p => p.id === it.produto_id)
          return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Produto</label>}
                <select className="form-select" value={it.produto_id} onChange={e => updateItem(idx, 'produto_id', e.target.value)}>
                  <option value="">Selecione...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Quantidade</label>}
                <input className="form-input" type="number" min={0} value={it.qtdInput || ''} placeholder="0" onChange={e => updateItem(idx, 'qtdInput', parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Unidade</label>}
                <select className="form-select" value={it.unidade} onChange={e => updateItem(idx, 'unidade', e.target.value)}>
                  <option value="base">{produtoSel?.unidade_base ?? 'Unid. base'}</option>
                  <option value="maior">{produtoSel?.unidade_maior ?? 'Unid. maior'}</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                {idx === 0 && <label className="form-label">Valor (R$)</label>}
                <input className="form-input" type="number" step="0.01" min={0} value={it.valor || ''} placeholder="0,00" onChange={e => updateItem(idx, 'valor', parseFloat(e.target.value) || 0)} />
              </div>
              <button className="btn btn-danger btn-sm" style={{ marginBottom: 0 }} onClick={() => removeItem(idx)} disabled={itens.length === 1}>✕</button>
            </div>
          )
        })}
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Produtos: {formatMoeda(totalProdutos)} + ST: {formatMoeda(Number(form.valor_st))}
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--text)', marginTop: 4 }}>
          Total NF: {formatMoeda(totalNF)}
        </div>
        <hr className="divider" />
        <ParcelasEditor parcelas={parcelas} onChange={setParcelas} tipo="receber" />
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove(confirm)} loading={saving} />
    </div>
  )
}
```

- [ ] **Step 2: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/vendas/page.tsx`.

- [ ] **Step 3: Teste manual**

Run: `npm run dev`, abrir `/vendas`, repetir o mesmo teste da Task 5 (produto "DISPLAY TESTE", 2 Display → 12 na base ao editar).

- [ ] **Step 4: Commit**

```bash
git add app/vendas/page.tsx
git commit -m "feat(vendas): seletor de unidade (base/maior) por item da NF"
```

---

### Task 7: Estoque inicial com toggle de unidade (`app/estoque-inicial/page.tsx`)

**Files:**
- Modify: `app/estoque-inicial/page.tsx` (arquivo inteiro, 127 linhas)

**Interfaces:**
- Consome: `Produto` (Task 2), `converterParaUnidadeMaior` (Task 3).
- Produz: nada consumido por outras tasks.

- [ ] **Step 1: Reescrever o arquivo**

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { getMesAnoLabel, converterParaUnidadeMaior, mesAtual, anoAtual } from '@/lib/utils'
import type { Produto, Unidade } from '@/types'
import { UNIDADES } from '@/types'

type EstMap = Record<string, number> // produto_id -> qtd_carteiras (unidade base)

export default function EstoqueInicialPage() {
  const { profile, unidadeAtiva } = useAuth()
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [unidade, setUnidade] = useState<Unidade | ''>(unidadeAtiva ?? '')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [estMap, setEstMap] = useState<EstMap>({})
  const [editMap, setEditMap] = useState<EstMap>({})
  const [editMode, setEditMode] = useState(false)
  const [modoUnidade, setModoUnidade] = useState<'base' | 'maior'>('base')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const sb = createClient()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (unidadeAtiva) setUnidade(unidadeAtiva)
  }, [unidadeAtiva])

  useEffect(() => { loadData() }, [mes, ano, unidade])

  async function loadData() {
    setLoading(true)
    const { data: prods } = await sb.from('btx_produtos').select('*').eq('ativo', true).order('nome')
    setProdutos(prods ?? [])
    if (!unidade) { setLoading(false); return }
    const { data: est } = await sb.from('btx_estoque_inicial').select('*')
      .eq('unidade', unidade).eq('mes', mes).eq('ano', ano)
    const m: EstMap = {}
    ;(est ?? []).forEach((e: { produto_id: string; qtd_carteiras: number }) => { m[e.produto_id] = e.qtd_carteiras })
    setEstMap(m)
    setEditMap({ ...m })
    setLoading(false)
  }

  function navMes(dir: number) {
    let m = mes + dir, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  async function salvar() {
    if (!unidade) return
    setSaving(true)
    for (const p of produtos) {
      const qtd = editMap[p.id] ?? 0
      await sb.from('btx_estoque_inicial').upsert(
        { unidade, produto_id: p.id, mes, ano, qtd_carteiras: qtd, updated_at: new Date().toISOString() },
        { onConflict: 'unidade,produto_id,mes,ano' }
      )
    }
    setSaving(false); setEditMode(false); loadData()
  }

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Estoque Inicial</h1><div className="page-subtitle">Saldo de abertura por produto e unidade</div></div>
        {!editMode ? (
          <button className="btn btn-primary" onClick={() => setEditMode(true)} disabled={!unidade}>Editar</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setEditMode(false); setEditMap({...estMap}) }}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)}>← Anterior</button>
        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 160, textAlign: 'center' }}>{getMesAnoLabel(mes, ano)}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => navMes(1)}>Próximo →</button>
        {isAdmin && (
          <select className="form-select" style={{ width: 220 }} value={unidade} onChange={e => setUnidade(e.target.value as Unidade)}>
            <option value="">Selecione a unidade...</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        {editMode && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="form-label" style={{ margin: 0 }}>Lançar em:</span>
            <button className={`btn btn-sm ${modoUnidade === 'base' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModoUnidade('base')}>Unidade base</button>
            <button className={`btn btn-sm ${modoUnidade === 'maior' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setModoUnidade('maior')}>Unidade maior</button>
          </div>
        )}
      </div>

      {!unidade ? (
        <div className="empty-state">Selecione uma unidade para visualizar o estoque inicial.</div>
      ) : loading ? (
        <div className="text-muted">Carregando...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Produto</th><th>Conversão</th><th>Qtd</th><th>Equivalente</th></tr></thead>
            <tbody>
              {produtos.map(p => {
                const qtdBase = editMode ? (editMap[p.id] ?? 0) : (estMap[p.id] ?? 0)
                const valorInput = modoUnidade === 'maior' ? qtdBase / p.fator_conversao : qtdBase
                const equivalente = modoUnidade === 'maior' ? qtdBase.toString() : converterParaUnidadeMaior(qtdBase, p.fator_conversao)
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.nome}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{p.unidade_base} → {p.unidade_maior} (×{p.fator_conversao})</td>
                    <td>
                      {editMode ? (
                        <input className="form-input" type="number" min={0} style={{ width: 100 }}
                          value={valorInput || 0}
                          onChange={e => {
                            const v = Number(e.target.value)
                            const base = modoUnidade === 'maior' ? Math.round(v * p.fator_conversao) : v
                            setEditMap(m => ({...m, [p.id]: base}))
                          }} />
                      ) : (
                        <span className="mono">{valorInput}</span>
                      )}
                    </td>
                    <td className="mono">{equivalente}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/estoque-inicial/page.tsx`.

- [ ] **Step 3: Teste manual**

Run: `npm run dev`, abrir `/estoque-inicial`, clicar "Editar", alternar "Lançar em: Unidade maior" pro produto "DISPLAY TESTE", digitar `3` (displays). Confirmar que a coluna "Equivalente" mostra `18` (3 × 6). Salvar, reabrir e conferir que persistiu como `18` na base.

- [ ] **Step 4: Commit**

```bash
git add app/estoque-inicial/page.tsx
git commit -m "feat(estoque-inicial): toggle pra lançar em unidade base ou maior"
```

---

### Task 8: Relatórios com rótulos dinâmicos (`app/relatorios/page.tsx`)

**Files:**
- Modify: `app/relatorios/page.tsx:6, 122-144`

**Interfaces:**
- Consome: `Produto` (Task 2), `converterParaUnidadeMaior` (Task 3).

- [ ] **Step 1: Atualizar o import**

Substituir:

```typescript
import { formatMoeda, getMesAnoLabel, carteirasParaCaixas, mesAtual, anoAtual } from '@/lib/utils'
```

por:

```typescript
import { formatMoeda, getMesAnoLabel, converterParaUnidadeMaior, mesAtual, anoAtual } from '@/lib/utils'
```

- [ ] **Step 2: Atualizar o cabeçalho e as linhas da tabela de posição de estoque**

Substituir (linhas 122-146):

```tsx
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cx/cart</th>
                  <th>Inicial (cart)</th>
                  <th>Comprado (cart)</th>
                  <th>Vendido (cart)</th>
                  <th>Ajuste (cart)</th>
                  <th>Final (cart)</th>
                  <th>Final (cx)</th>
                </tr>
              </thead>
              <tbody>
                {estoqueRows.map(r => (
                  <tr key={r.produto.id}>
                    <td style={{ fontWeight: 500 }}>{r.produto.nome}</td>
                    <td className="mono">{r.produto.carteiras_por_caixa}</td>
                    <td className="mono">{r.inicial}</td>
                    <td className="mono text-green">{r.comprado}</td>
                    <td className="mono text-red">{r.vendido}</td>
                    <td className="mono">{r.ajuste > 0 ? `+${r.ajuste}` : r.ajuste}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{r.final}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{carteirasParaCaixas(r.final, r.produto.carteiras_por_caixa)}</td>
                  </tr>
                ))}
              </tbody>
```

por:

```tsx
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Conversão</th>
                  <th>Inicial</th>
                  <th>Comprado</th>
                  <th>Vendido</th>
                  <th>Ajuste</th>
                  <th>Final</th>
                  <th>Final (equiv.)</th>
                </tr>
              </thead>
              <tbody>
                {estoqueRows.map(r => (
                  <tr key={r.produto.id}>
                    <td style={{ fontWeight: 500 }}>{r.produto.nome}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.produto.unidade_base} → {r.produto.unidade_maior} (×{r.produto.fator_conversao})</td>
                    <td className="mono">{r.inicial}</td>
                    <td className="mono text-green">{r.comprado}</td>
                    <td className="mono text-red">{r.vendido}</td>
                    <td className="mono">{r.ajuste > 0 ? `+${r.ajuste}` : r.ajuste}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{r.final}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{converterParaUnidadeMaior(r.final, r.produto.fator_conversao)}</td>
                  </tr>
                ))}
              </tbody>
```

- [ ] **Step 3: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros em `app/relatorios/page.tsx`.

- [ ] **Step 4: Teste manual**

Run: `npm run dev`, abrir `/relatorios`, conferir que a coluna "Conversão" mostra `Carteira → Caixa (×480)` pros produtos antigos e `Unidade → Display (×6)` pro "DISPLAY TESTE".

- [ ] **Step 5: Commit**

```bash
git add app/relatorios/page.tsx
git commit -m "feat(relatorios): rótulos de unidade dinâmicos por produto"
```

---

### Task 9: Dashboard com rótulos dinâmicos (`app/dashboard/page.tsx`)

**Files:**
- Modify: `app/dashboard/page.tsx:20-22, 118-123, 203-214, 336-355`

**Interfaces:**
- Consome: `converterParaUnidadeMaior` não é usado aqui (dashboard já calculava `caixas` manualmente); mantém o cálculo local mas trocando o campo de origem.

- [ ] **Step 1: Atualizar a interface `EstoqueItem`**

Substituir (linha 20-22):

```typescript
interface EstoqueItem {
  produto: string; qtd: number; caixas: number; carteiras_por_caixa: number
}
```

por:

```typescript
interface EstoqueItem {
  produto: string; qtd: number; caixas: number; unidade_base: string; unidade_maior: string
}
```

- [ ] **Step 2: Atualizar a query de produtos em `carregarEstoque`**

Substituir (linha 121):

```typescript
        .select('id,nome,carteiras_por_caixa')
```

por:

```typescript
        .select('id,nome,unidade_base,unidade_maior,fator_conversao')
```

- [ ] **Step 3: Atualizar o mapeamento final de `estoque`**

Substituir (linhas 203-214):

```tsx
    setEstoque(produtos.map(p => {
      const qtd = Object.entries(estoqueMap)
        .filter(([k]) => k.endsWith(`::${p.id}`))
        .reduce((s, [, v]) => s + v, 0)

      return {
        produto: p.nome,
        qtd,
        caixas: qtd / p.carteiras_por_caixa,
        carteiras_por_caixa: p.carteiras_por_caixa
      }
    }))
```

por:

```tsx
    setEstoque(produtos.map(p => {
      const qtd = Object.entries(estoqueMap)
        .filter(([k]) => k.endsWith(`::${p.id}`))
        .reduce((s, [, v]) => s + v, 0)

      return {
        produto: p.nome,
        qtd,
        caixas: qtd / p.fator_conversao,
        unidade_base: p.unidade_base,
        unidade_maior: p.unidade_maior
      }
    }))
```

- [ ] **Step 4: Atualizar a tabela "Estoque Atual"**

Substituir (linhas 341-351):

```tsx
                    <thead>
                      <tr><th>Produto</th><th>Carteiras</th><th>Caixas</th></tr>
                    </thead>
                    <tbody>
                      {estoque.map((e, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{e.produto}</td>
                          <td className="mono">{e.qtd.toLocaleString('pt-BR')}</td>
                          <td className="mono" style={{ color: e.caixas < 0 ? 'var(--red)' : 'var(--text)' }}>{e.caixas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
```

por:

```tsx
                    <thead>
                      <tr><th>Produto</th><th>Qtd</th><th>Equivalente</th></tr>
                    </thead>
                    <tbody>
                      {estoque.map((e, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12 }}>{e.produto}</td>
                          <td className="mono">{e.qtd.toLocaleString('pt-BR')} {e.unidade_base}</td>
                          <td className="mono" style={{ color: e.caixas < 0 ? 'var(--red)' : 'var(--text)' }}>{e.caixas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {e.unidade_maior}</td>
                        </tr>
                      ))}
                    </tbody>
```

- [ ] **Step 5: Checagem de tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro em nenhum arquivo do projeto (última task da lista).

- [ ] **Step 6: Teste manual**

Run: `npm run dev`, abrir `/dashboard`, conferir que a tabela "Estoque Atual" mostra `... Carteira` / `... Caixa` pros produtos antigos e `... Unidade` / `... Display` pro "DISPLAY TESTE".

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): rótulos de unidade dinâmicos no card de estoque"
```

---

## Checklist final

- [ ] `npx tsc --noEmit` limpo na raiz do projeto.
- [ ] Migration `supabase_migration_unidades_conversao.sql` executada no Supabase de produção.
- [ ] Produto de teste "DISPLAY TESTE" removido do banco (era só pra validar o fluxo) ou mantido se o usuário quiser aproveitar como o produto real.
- [ ] `npm run build` roda sem erros.
