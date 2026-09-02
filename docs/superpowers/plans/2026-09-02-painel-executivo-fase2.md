# Painel Executivo Fase 2 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Redesenhar o `/dashboard` (3 colunas por unidade, contas clicáveis) e criar `/lancar` (3 abas: conta a pagar, recebimento, ajustar saldo).

**Architecture:** Sem mudança no cálculo (`lib/painel-resumo.ts`). Dois helpers puros novos (`lib/parcelamento.ts`, `lib/saldo.ts`), uma página nova (`/lancar`), reescrita de layout do dashboard. Escrita direta em `btx_parcelas` / `btx_despesas` / `btx_caixa_mensal` reusando os padrões das telas atuais.

**Tech Stack:** Next 16 App Router client components, React 19, Supabase JS, TS. Testes: `node --test --experimental-strip-types tests/<n>.test.mts`.

## Global Constraints

- `'use client'` + `export const dynamic = 'force-dynamic'` nas páginas.
- Só classes do design system existente (`card`, `tabs`/`tab`, `badge*`, `mono`, `text-green/red/amber`, `form-label`, `form-input`, `form-select`, `alert`, `page-header`, `page-title`, `grid-*`, `table-wrap`, `btn*`). Sem CSS novo, sem deps novas.
- Unidades `UNIDADES` de `@/types`; curto MG/SC/AM.
- Papéis que veem tudo: `admin`, `diretoria`. `diretoria` é somente leitura (sem botões de gravar, sem item "Lançar" no menu).
- Grupos: ordem e labels de `GRUPOS_CATEGORIA` (`@/types`).
- Dinheiro: `formatMoeda`; datas exibidas: `formatData`; `hoje()` de `@/lib/utils`.
- `.mts` de teste importam `../lib/*.ts` (extensão `.ts` explícita); rodam com `node --test --experimental-strip-types`.
- `lib/painel-resumo.ts` importa com extensão `.ts` relativa (`./financeiro.ts`, `../types/index.ts`) + tsconfig tem `allowImportingTsExtensions`. Arquivos `app/**` e outros `lib/**` usam o alias `@/` normal.

---

### Task 1: helpers `lib/parcelamento.ts` e `lib/saldo.ts`

**Files:**
- Create: `lib/parcelamento.ts`, `tests/parcelamento.test.mts`
- Create: `lib/saldo.ts`
- Modify: `app/caixa/page.tsx` (usar o helper em `salvarSaldoBase`)

**Interfaces produced:**
```ts
// lib/parcelamento.ts
export interface ParcelaGerada { numero_parcela: number; vencimento: string; valor: number }
export function gerarParcelas(valorTotal: number, primeiroVencimento: string, n: number): ParcelaGerada[]
// lib/saldo.ts
export async function ajustarSaldoBanco(
  sb: import('@supabase/supabase-js').SupabaseClient,
  unidade: string,
  saldoInformadoHoje: number,
): Promise<{ error: string | null }>
```

Regras `gerarParcelas`:
- `n <= 1` → `[{ numero_parcela: 1, vencimento: primeiroVencimento, valor: round2(valorTotal) }]`.
- senão: valor base `Math.floor(valorTotal / n * 100) / 100` em todas; a 1ª recebe `valorTotal - base*(n-1)` (arredondado a 2 casas) para fechar a soma exata.
- vencimento da parcela `i` (0-based): mesmo dia-do-mês de `primeiroVencimento` somando `i` meses, com **clamp ao último dia** do mês de destino. Implementar sem libs:
  ```ts
  const [y, m, d] = primeiroVencimento.split('-').map(Number)
  const alvoMes = m - 1 + i
  const ano = y + Math.floor(alvoMes / 12)
  const mes = ((alvoMes % 12) + 12) % 12
  const ultimoDia = new Date(ano, mes + 1, 0).getDate()
  const dia = Math.min(d, ultimoDia)
  const vencimento = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  ```
- `round2(x) = Math.round(x * 100) / 100`.

Regras `ajustarSaldoBanco` (extrair de `app/caixa/page.tsx` ~linhas 84-133, 160-174):
- Buscar `btx_parcelas` (`tipo` ambos, `ativo`, `status != cancelado`) + `btx_pagamentos_parcela` da unidade.
- Normalizar pagamentos para `{ id, parcela_id, valor: Number, data_pagamento }`.
- `competenciaHoje = chaveCompetencia(anoAtual(), mesAtual())` (de `@/lib/financeiro` / `@/lib/utils`).
- `realizadoEsteMes = calcularSaldoRealizado({ hoje: hoje(), competenciaInicio: competenciaHoje, parcelas, pagamentos })`.
- `novoSaldoInicial = saldoInformadoHoje - realizadoEsteMes`.
- `upsert` `btx_caixa_mensal` `{ unidade, mes: mesAtual(), ano: anoAtual(), saldo_inicial: novoSaldoInicial, updated_at: new Date().toISOString() }`, `{ onConflict: 'unidade,mes,ano' }`.
- Retornar `{ error: saveError ? 'Não foi possível salvar o saldo em banco.' : null }`.

- [ ] **Step 1: teste `tests/parcelamento.test.mts`**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { gerarParcelas } from '../lib/parcelamento.ts'

test('n<=1 devolve uma parcela cheia', () => {
  assert.deepEqual(gerarParcelas(100, '2026-03-10', 1), [{ numero_parcela: 1, vencimento: '2026-03-10', valor: 100 }])
})

test('divide 100 em 3 e fecha a soma', () => {
  const p = gerarParcelas(100, '2026-03-10', 3)
  assert.equal(p.length, 3)
  assert.equal(p.reduce((s, x) => s + x.valor, 0), 100)
  assert.deepEqual(p.map(x => x.valor), [33.34, 33.33, 33.33])
  assert.deepEqual(p.map(x => x.vencimento), ['2026-03-10', '2026-04-10', '2026-05-10'])
})

test('clampa dia 31 para o ultimo dia do mes curto', () => {
  const p = gerarParcelas(300, '2026-01-31', 3)
  assert.deepEqual(p.map(x => x.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31'])
})

test('vira o ano', () => {
  const p = gerarParcelas(200, '2026-12-15', 2)
  assert.deepEqual(p.map(x => x.vencimento), ['2026-12-15', '2027-01-15'])
})
```

- [ ] **Step 2: rodar — falha**

Run: `node --test --experimental-strip-types tests/parcelamento.test.mts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: implementar `lib/parcelamento.ts`** conforme as regras acima.

- [ ] **Step 4: rodar — passa**

Run: `node --test --experimental-strip-types tests/parcelamento.test.mts`
Expected: PASS 4/4.

- [ ] **Step 5: implementar `lib/saldo.ts`** conforme as regras. Imports com alias `@/`.

- [ ] **Step 6: usar o helper em `app/caixa/page.tsx`**

Em `salvarSaldoBase`, trocar o bloco `const novoSaldoInicial = ...` + `sb.from('btx_caixa_mensal').upsert(...)` por:
```ts
const { error: saveErr } = await ajustarSaldoBanco(sb, unidade, saldoEdit)
setSaving(false)
if (saveErr) { setError(saveErr); return }
setSaldoModal(false)
loadData()
```
Adicionar `import { ajustarSaldoBanco } from '@/lib/saldo'`. Remover imports que ficaram sem uso (se algum). Não mudar mais nada na página.

- [ ] **Step 7: verificar**

Run: `npx tsc --noEmit` → sem erros novos.
Run: `node --test --experimental-strip-types tests/financeiro.test.mts tests/painel-resumo.test.mts tests/parcelamento.test.mts` → tudo PASS.

- [ ] **Step 8: commit**

```bash
git add lib/parcelamento.ts lib/saldo.ts tests/parcelamento.test.mts app/caixa/page.tsx
git commit -m "feat(financeiro): helpers gerarParcelas e ajustarSaldoBanco"
```

---

### Task 2: página `/lancar`

**Files:**
- Create: `app/lancar/page.tsx`, `app/lancar/layout.tsx`
- Modify: `components/Sidebar.tsx`

**Interfaces consumed:** `gerarParcelas` (`@/lib/parcelamento`), `ajustarSaldoBanco` (`@/lib/saldo`), `GRUPOS_CATEGORIA`, `UNIDADES`, `Unidade` (`@/types`), `useAuth` (`@/lib/auth-context`), `createClient` (`@/lib/supabase`), `hoje` (`@/lib/utils`).

- [ ] **Step 1: `app/lancar/layout.tsx`**

Copiar exatamente de `app/despesas/layout.tsx` (mesmo wrapper `AppLayout`).

- [ ] **Step 2: item no menu**

`components/Sidebar.tsx`, array `NAV`, seção 'Financeiro', **antes** de `{ href: '/parcelas-pagar', ... }`:
```ts
{ href: '/lancar', label: 'Lançar' },
```
O `NAV` é estático; a Sidebar já esconde ações por papel em outros lugares mas o menu é igual pra todos. Para esconder de `diretoria`: no `.map` do `NAV`, pular o item quando `item.href === '/lancar' && profile?.role === 'diretoria'`. Implementar esse guard no render.

- [ ] **Step 3: `app/lancar/page.tsx` — casca + abas + carga de selects**

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { hoje } from '@/lib/utils'
import { gerarParcelas } from '@/lib/parcelamento'
import { ajustarSaldoBanco } from '@/lib/saldo'
import { UNIDADES, GRUPOS_CATEGORIA, type Unidade, type GrupoCategoria } from '@/types'

type Aba = 'pagar' | 'receber' | 'saldo'
type Categoria = { id: string; nome: string; grupo: GrupoCategoria }
type Cliente = { id: string; nome: string }

export default function LancarPage() {
  const { profile, unidadeAtiva } = useAuth()
  const sb = useMemo(() => createClient(), [])
  const isAdmin = profile?.role === 'admin'
  const [aba, setAba] = useState<Aba>('pagar')
  const [unidade, setUnidade] = useState<Unidade | ''>((unidadeAtiva as Unidade) ?? '')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!isAdmin && unidadeAtiva) setUnidade(unidadeAtiva as Unidade) }, [isAdmin, unidadeAtiva])

  useEffect(() => {
    if (!unidade) { setCategorias([]); setClientes([]); return }
    ;(async () => {
      const [{ data: cat }, { data: cli }] = await Promise.all([
        sb.from('btx_categorias_despesas').select('id,nome,grupo').eq('ativo', true).eq('unidade', unidade).order('nome'),
        sb.from('btx_clientes').select('id,nome').eq('ativo', true).eq('unidade', unidade).order('nome'),
      ])
      setCategorias((cat ?? []) as Categoria[])
      setClientes((cli ?? []) as Cliente[])
    })()
  }, [unidade, sb])

  const podeUsar = profile && profile.role !== 'diretoria'

  if (!podeUsar) return <div className="empty-state">Sem permissão para lançar.</div>

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Lançar</h1><div className="page-subtitle">Entrada rápida do que aparece no painel</div></div>
      </div>

      {isAdmin && (
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label className="form-label">Unidade</label>
          <select className="form-select" value={unidade} onChange={e => { setUnidade(e.target.value as Unidade); setMsg(null) }}>
            <option value="">Selecione…</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      {!unidade ? <div className="empty-state">Selecione a unidade.</div> : (
        <>
          <div className="tabs">
            <button className={`tab${aba === 'pagar' ? ' active' : ''}`} onClick={() => { setAba('pagar'); setMsg(null) }}>Conta a pagar</button>
            <button className={`tab${aba === 'receber' ? ' active' : ''}`} onClick={() => { setAba('receber'); setMsg(null) }}>Recebimento</button>
            <button className={`tab${aba === 'saldo' ? ' active' : ''}`} onClick={() => { setAba('saldo'); setMsg(null) }}>Ajustar saldo</button>
          </div>

          {msg && <div className={`alert ${msg.tipo === 'ok' ? 'alert-green' : 'alert-red'}`} style={{ marginBottom: 16 }}>{msg.texto}</div>}

          <div className="card" style={{ maxWidth: 560 }}>
            {aba === 'pagar' && <FormPagar sb={sb} unidade={unidade} categorias={categorias} saving={saving} setSaving={setSaving} onResult={setMsg} />}
            {aba === 'receber' && <FormReceber sb={sb} unidade={unidade} clientes={clientes} saving={saving} setSaving={setSaving} onResult={setMsg} />}
            {aba === 'saldo' && <FormSaldo sb={sb} unidade={unidade} saving={saving} setSaving={setSaving} onResult={setMsg} />}
          </div>
        </>
      )}
    </div>
  )
}
```

Se `alert-green` não existir no CSS, usar `alert` sem modificador para sucesso e `alert-red` para erro — verificar em `app/globals.css` no Step 6 e ajustar.

- [ ] **Step 4: componentes de formulário (no mesmo arquivo, abaixo do default export)**

```tsx
type ResultFn = (m: { tipo: 'ok' | 'erro'; texto: string }) => void
type FormBase = { sb: ReturnType<typeof createClient>; unidade: string; saving: boolean; setSaving: (b: boolean) => void; onResult: ResultFn }

function ParcelarCampos({ parcelar, setParcelar, n, setN }: { parcelar: boolean; setParcelar: (b: boolean) => void; n: number; setN: (n: number) => void }) {
  return (
    <>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0' }}>
        <input type="checkbox" checked={parcelar} onChange={e => setParcelar(e.target.checked)} /> Parcelar
      </label>
      {parcelar && (
        <div className="form-group">
          <label className="form-label">Nº de parcelas</label>
          <input className="form-input" type="number" min={2} max={24} value={n} onChange={e => setN(Number(e.target.value))} />
        </div>
      )}
    </>
  )
}

function FormPagar({ sb, unidade, categorias, saving, setSaving, onResult }: FormBase & { categorias: Categoria[] }) {
  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [valor, setValor] = useState(0)
  const [vencimento, setVencimento] = useState(hoje())
  const [boleto, setBoleto] = useState('')
  const [parcelar, setParcelar] = useState(false)
  const [n, setN] = useState(2)

  async function salvar() {
    if (!descricao.trim() || !categoriaId || valor <= 0 || !vencimento) { onResult({ tipo: 'erro', texto: 'Preencha descrição, categoria, valor e vencimento.' }); return }
    setSaving(true)
    const parcelas = gerarParcelas(valor, vencimento, parcelar ? n : 1)
    const { data: desp, error: e1 } = await sb.from('btx_despesas').insert({
      unidade, categoria_id: categoriaId, data_despesa: parcelas[0].vencimento, descricao, valor_total: valor, numero_nf: boleto || null,
    }).select('id').single()
    if (e1 || !desp) { setSaving(false); onResult({ tipo: 'erro', texto: 'Não foi possível salvar a despesa.' }); return }
    const { error: e2 } = await sb.from('btx_parcelas').insert(parcelas.map(p => ({
      unidade, tipo: 'pagar', origem: 'despesa', origem_id: desp.id,
      numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, numero_boleto: boleto || null,
    })))
    setSaving(false)
    if (e2) { onResult({ tipo: 'erro', texto: 'Despesa criada mas falhou ao gerar parcelas. Confira em Parcelas a Pagar.' }); return }
    onResult({ tipo: 'ok', texto: `Conta a pagar lançada (${parcelas.length} parcela(s)).` })
    setDescricao(''); setCategoriaId(''); setValor(0); setVencimento(hoje()); setBoleto(''); setParcelar(false); setN(2)
  }

  const porGrupo = GRUPOS_CATEGORIA.map(g => ({ g, itens: categorias.filter(c => c.grupo === g.value) })).filter(x => x.itens.length)

  return (
    <>
      <div className="form-group"><label className="form-label">Descrição *</label>
        <input className="form-input" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
      <div className="form-group"><label className="form-label">Categoria *</label>
        <select className="form-select" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
          <option value="">Selecione…</option>
          {porGrupo.map(({ g, itens }) => (
            <optgroup key={g.value} label={g.label}>
              {itens.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </optgroup>
          ))}
        </select></div>
      <div className="form-group"><label className="form-label">Valor (R$) *</label>
        <input className="form-input" type="number" step="0.01" min={0} value={valor} onChange={e => setValor(Number(e.target.value))} /></div>
      <div className="form-group"><label className="form-label">Vencimento *</label>
        <input className="form-input" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} /></div>
      <div className="form-group"><label className="form-label">Nº boleto/doc</label>
        <input className="form-input" value={boleto} onChange={e => setBoleto(e.target.value)} /></div>
      <ParcelarCampos parcelar={parcelar} setParcelar={setParcelar} n={n} setN={setN} />
      <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 8 }}>{saving ? 'Salvando…' : 'Lançar conta'}</button>
    </>
  )
}

function FormReceber({ sb, unidade, clientes, saving, setSaving, onResult }: FormBase & { clientes: Cliente[] }) {
  const [clienteId, setClienteId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState(0)
  const [data, setData] = useState(hoje())
  const [parcelar, setParcelar] = useState(false)
  const [n, setN] = useState(2)

  async function salvar() {
    if (!descricao.trim() || valor <= 0 || !data) { onResult({ tipo: 'erro', texto: 'Preencha descrição, valor e data.' }); return }
    setSaving(true)
    const nomeCliente = clientes.find(c => c.id === clienteId)?.nome
    const obs = descricao + (nomeCliente ? ` — ${nomeCliente}` : '')
    const parcelas = gerarParcelas(valor, data, parcelar ? n : 1)
    const { error } = await sb.from('btx_parcelas').insert(parcelas.map(p => ({
      unidade, tipo: 'receber', origem: 'manual', origem_id: null,
      numero_parcela: p.numero_parcela, vencimento: p.vencimento, valor: p.valor, observacoes: obs,
    })))
    setSaving(false)
    if (error) { onResult({ tipo: 'erro', texto: 'Não foi possível lançar o recebimento.' }); return }
    onResult({ tipo: 'ok', texto: `Recebimento lançado (${parcelas.length} parcela(s)).` })
    setClienteId(''); setDescricao(''); setValor(0); setData(hoje()); setParcelar(false); setN(2)
  }

  return (
    <>
      <div className="form-group"><label className="form-label">Cliente</label>
        <select className="form-select" value={clienteId} onChange={e => setClienteId(e.target.value)}>
          <option value="">— nenhum —</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></div>
      <div className="form-group"><label className="form-label">Descrição *</label>
        <input className="form-input" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
      <div className="form-group"><label className="form-label">Valor (R$) *</label>
        <input className="form-input" type="number" step="0.01" min={0} value={valor} onChange={e => setValor(Number(e.target.value))} /></div>
      <div className="form-group"><label className="form-label">Data prevista *</label>
        <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} /></div>
      <ParcelarCampos parcelar={parcelar} setParcelar={setParcelar} n={n} setN={setN} />
      <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ marginTop: 8 }}>{saving ? 'Salvando…' : 'Lançar recebimento'}</button>
    </>
  )
}

function FormSaldo({ sb, unidade, saving, setSaving, onResult }: FormBase) {
  const [saldo, setSaldo] = useState(0)
  async function salvar() {
    setSaving(true)
    const { error } = await ajustarSaldoBanco(sb, unidade, saldo)
    setSaving(false)
    onResult(error ? { tipo: 'erro', texto: error } : { tipo: 'ok', texto: 'Saldo do banco ajustado para hoje.' })
  }
  return (
    <>
      <div className="form-group"><label className="form-label">Saldo real hoje no banco (R$) *</label>
        <input className="form-input" type="number" step="0.01" value={saldo} onChange={e => setSaldo(Number(e.target.value))} /></div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Recalcula o saldo-base do mês atual a partir do valor informado.</div>
      <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar saldo'}</button>
    </>
  )
}
```

Adicionar os imports que faltam (`useState` já vem do topo; `hoje`, `gerarParcelas`, `ajustarSaldoBanco`, `GRUPOS_CATEGORIA` já importados no Step 3).

- [ ] **Step 5: tipos do insert**

O Supabase-js pode reclamar do literal `tipo: 'pagar'` (widened para string). Se `npx tsc --noEmit` acusar, tipar o array com `as const` no objeto ou castar `as never[]` seguindo o padrão de `app/despesas/page.tsx` (que faz `.insert(parcelas.map(...))` sem cast — replicar o mesmo estilo; se lá compila, aqui também).

- [ ] **Step 6: verificar**

Run: `npx tsc --noEmit` → sem erros.
Rodar `npm run dev`, abrir `/lancar`:
- admin: seletor de unidade aparece; escolher uma carrega categorias/clientes.
- lançar uma "Conta a pagar" de teste → mensagem de sucesso.
- conferir em `/parcelas-pagar` que a parcela apareceu com o vencimento certo.
- checar console do browser — sem erros.
Verificar no `app/globals.css` se existe `.alert-green`; se não, trocar sucesso para `className="alert"`.

- [ ] **Step 7: commit**

```bash
git add app/lancar components/Sidebar.tsx
git commit -m "feat(lancar): tela de entrada rapida (conta a pagar, recebimento, ajustar saldo)"
```

---

### Task 3: redesenho do layout do `/dashboard`

**Files:**
- Modify (rewrite do JSX): `app/dashboard/page.tsx`

**Interfaces consumed:** já usadas na fase 1 — `calcularResumoUnidade`, `consolidarResumos`, `ResumoUnidade`, `ContaPagar` (`@/lib/painel-resumo`), `GRUPOS_CATEGORIA` (`@/types`). Manter `carregarUnidade`, o `carregar`/`Promise.allSettled`, `navMes`, as abas — só mudar a árvore de render e adicionar o modal de ação.

- [ ] **Step 1: subcomponente `ColunaUnidade`**

No mesmo arquivo, um componente que recebe `{ resumo: ResumoUnidade; nome: string; short: string; expandidoInicial: boolean; mostrarTagUnidade: boolean; onClickHeader?: () => void; onClickConta: (c: ContaPagar) => void }` e renderiza um `card`:
- header: `short` + `Resultado de caixa` (mono, `text-green`/`text-red`), `cursor:pointer` + `onClickHeader` se dado.
- linhas `Saldo hoje` / `A receber` (label esquerda, `formatMoeda` mono direita).
- para cada `resumo.gruposPagar`: uma linha clicável (`<button>` sem estilo de botão, ou `<div role="button">`) `g.label` + `formatMoeda(g.subtotal)`; estado local `Set<string>` de grupos abertos, inicial = todos se `expandidoInicial` senão vazio. Ao abrir, listar `g.contas`: cada uma um elemento clicável chamando `onClickConta(c)`, com `formatData(c.vencimento)` e cor por `c.vencida`/`c.proxima` (vermelho/âmbar), tag `short` se `mostrarTagUnidade`.
- se `resumo.gruposPagar.length === 0`: linha "sem contas a pagar".
- rodapé: `Total despesas` + `formatMoeda(resumo.totalDespesas)` (`text-red` mono).

- [ ] **Step 2: subcomponente `FaixaResumo`**

Recebe `{ resumo: ResumoUnidade }`. Renderiza uma linha (não card) com 4 pares label/valor (mono ~14px): `Saldo` `resumo.saldoHoje`, `A receber` `resumo.aReceberMes`, `A pagar` `resumo.totalDespesas`, `Resultado` `resumo.resultado` (verde/vermelho). Usar `display:flex; gap:24px; flex-wrap:wrap; padding:12px 0; border-bottom:1px solid var(--border)`.

- [ ] **Step 3: modal de ação `ModalConta`**

`{ conta: ContaPagar | null; onClose: () => void; onGravou: () => void; readOnly: boolean }` usando o componente `Modal` existente (ver uso em `app/parcelas-pagar/page.tsx`).
- estado `venc`, `val` iniciados de `conta`.
- `createClient()` local.
- **Marcar pago**: `sb.from('btx_parcelas').update({ status: 'pago', data_pagamento: hoje() }).eq('id', conta.id)` → `onGravou()`.
- **Salvar alteração**: `.update({ vencimento: venc, valor: val }).eq('id', conta.id)` → `onGravou()`.
- **Cancelar conta**: `.update({ status: 'cancelado' }).eq('id', conta.id)` → `onGravou()`.
- `readOnly` (diretoria): mostra os valores, esconde os 3 botões de ação, só "Fechar".
- `onGravou` = fechar modal + re-`carregar()` a unidade da conta (`conta.unidade`) ou simplesmente `carregar()` tudo.

- [ ] **Step 4: montar o render**

Substituir o bloco `return (...)` da página:
- header + controles de mês + abas: **manter**.
- `contaAberta` state (`ContaPagar | null`) + `<ModalConta conta={contaAberta} readOnly={profile?.role === 'diretoria'} onClose={() => setContaAberta(null)} onGravou={() => { setContaAberta(null); carregar() }} />`.
- consolidado:
  - alerta de vencidas somadas (`resumo.parcelasVencidas`, do `consolidarResumos`) se `>0`.
  - `<FaixaResumo resumo={consolidado} />`.
  - grid 3 colunas: `<div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>` com `@media` fallback — como não pode haver CSS novo, usar `className="grid-3"` que já existe (vira responsivo? checar `app/globals.css`; se `grid-3` não colapsa no mobile, aceitar — o spec permite, a prioridade é o desktop). Uma `<ColunaUnidade>` por `UNIDADES` que tenha `porUnidade[u]`, `expandidoInicial={false}`, `mostrarTagUnidade={false}`, `onClickHeader={() => setAba(u)}`, `onClickConta={setContaAberta}`.
- unidade única (aba != consolidado, ou papel `unidade`):
  - `<FaixaResumo resumo={resumo} />`
  - uma `<ColunaUnidade>` largura cheia (`style={{ maxWidth: 560 }}` ou full), `expandidoInicial={true}`, `mostrarTagUnidade={false}`, sem `onClickHeader`, `onClickConta={setContaAberta}`.
- remover os `grid-3` de `stat-card` grandes e a `<table>` "Por Unidade" da fase 1.

- [ ] **Step 5: verificar**

Run: `npx tsc --noEmit` → limpo.
`npm run dev`, `/dashboard` como admin:
- consolidado mostra faixa + 3 colunas; clicar num grupo expande; clicar numa conta abre o modal; "Marcar pago" fecha e o número atualiza.
- trocar de aba mostra a unidade em coluna cheia expandida.
- navegar mês recarrega.
- console sem erros. Tirar screenshot.

- [ ] **Step 6: commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): layout em 3 colunas por unidade, contas a pagar clicaveis"
```

---

## Self-Review

**Spec coverage:**
- Faixa-resumo fina + 3 colunas no consolidado → Task 3 Steps 2, 4 ✓
- Coluna: header clicável, saldo/a receber, grupos expansíveis, contas clicáveis, total → Task 3 Step 1 ✓
- Unidade única = coluna cheia expandida → Task 3 Step 4 ✓
- Modal de ação (pago/editar/cancelar), diretoria read-only → Task 3 Step 3 ✓
- `/lancar` 3 abas → Task 2 ✓
- Conta a pagar cria despesa+parcelas, cai no grupo certo → Task 2 Step 4 (`FormPagar`) ✓
- Recebimento cria parcela `receber`/`manual` → Task 2 Step 4 (`FormReceber`) ✓
- Ajustar saldo via helper compartilhado, `/caixa` migrado → Task 1 Steps 5-6, Task 2 (`FormSaldo`) ✓
- `gerarParcelas` mensal com clamp → Task 1 ✓
- Item de menu escondido de diretoria → Task 2 Step 2 ✓
- Testes de parcelamento → Task 1 Step 1 ✓

**Placeholders:** nenhum — código completo em cada step.

**Type consistency:** `gerarParcelas(valorTotal, primeiroVencimento, n) → ParcelaGerada[]`, `ajustarSaldoBanco(sb, unidade, saldo) → {error}`, `ContaPagar` (com `.id`, `.unidade`, `.vencimento`, `.valor`, `.vencida`, `.proxima`, `.grupo`) e `ResumoUnidade` conforme fase 1. `ColunaUnidade`/`FaixaResumo`/`ModalConta` definidos e consumidos só na Task 3.
