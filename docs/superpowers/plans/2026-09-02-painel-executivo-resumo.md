# Painel Executivo — Resumo de Caixa · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `/dashboard` por um painel-resumo por unidade/mês (Saldo hoje, A receber, Contas a pagar agrupadas, Resultado de caixa) no formato da planilha da diretoria.

**Architecture:** Uma coluna `grupo` em `btx_categorias_despesas` classifica cada despesa. Um módulo puro `lib/painel-resumo.ts` monta os números de uma unidade a partir de parcelas + pagamentos + saldo mensal (reaproveitando `calcularSaldoRealizado` de `lib/financeiro.ts`). A página `app/dashboard/page.tsx` é reescrita para consumir esse módulo, mantendo o padrão atual de abas/navegação de mês.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, Supabase JS, TypeScript, testes com `node --test --experimental-strip-types`.

## Global Constraints

- Componentes de página são `'use client'` com `export const dynamic = 'force-dynamic'`.
- Usar apenas classes do design system existente (`stat-card`, `card`, `grid-2/3`, `badge`, `badge-*`, `mono`, `text-green/red/amber`, `alert`, `alert-red`, `page-header`, `page-title`, `page-subtitle`, `form-label`, `form-select`, `table-wrap`). Sem CSS novo, sem dependências novas.
- Unidades: `'NEW BLUETEX MG' | 'NEW BLUETEX SC' | 'NEW BLUETEX AM'` (`UNIDADES` em `types/index.ts`). Rótulo curto: MG/SC/AM.
- Papéis que veem todas as unidades: `admin` e `diretoria`. `diretoria` é somente leitura.
- Dinheiro em `formatMoeda` (`lib/utils.ts`); datas em `formatData`.
- Testes ficam em `tests/<nome>.test.mts`, rodam com `node --test --experimental-strip-types tests/<nome>.test.mts`, usam `node:test` + `node:assert/strict`, importam de `../lib/*.ts`.
- Grupos válidos (ordem de exibição fixa): `fornecedores`, `impostos`, `funcionarios`, `custos_fixos`, `outros`. Labels: `Fornecedores`, `Impostos`, `Funcionários`, `Custos Fixos`, `Outros`.

---

### Task 1: Coluna `grupo` nas categorias de despesa

**Files:**
- Create: `supabase_migration_categoria_grupo.sql`
- Modify: `supabase_schema.sql` (bloco `CREATE TABLE ... btx_categorias_despesas`, ~linha 125-135)
- Modify: `types/index.ts` (interface `CategoriaDespesa`, ~linha 29)
- Modify: `app/categorias/page.tsx`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Tipo `GrupoCategoria = 'fornecedores' | 'impostos' | 'funcionarios' | 'custos_fixos' | 'outros'` exportado de `types/index.ts`.
  - `CategoriaDespesa` passa a ter `grupo: GrupoCategoria`.
  - Constante `GRUPOS_CATEGORIA: { value: GrupoCategoria; label: string }[]` exportada de `types/index.ts`, na ordem fixa do Global Constraints.

- [ ] **Step 1: Escrever a migração**

Create `supabase_migration_categoria_grupo.sql`:

```sql
-- Adiciona classificação de grupo às categorias de despesa (Painel Executivo)
ALTER TABLE btx_categorias_despesas
  ADD COLUMN IF NOT EXISTS grupo TEXT NOT NULL DEFAULT 'outros'
  CHECK (grupo IN ('fornecedores','impostos','funcionarios','custos_fixos','outros'));
```

- [ ] **Step 2: Refletir no schema base**

Em `supabase_schema.sql`, dentro do `CREATE TABLE IF NOT EXISTS btx_categorias_despesas (...)`, adicionar a coluna logo após `nome TEXT NOT NULL,`:

```sql
  grupo TEXT NOT NULL DEFAULT 'outros' CHECK (grupo IN ('fornecedores','impostos','funcionarios','custos_fixos','outros')),
```

- [ ] **Step 3: Atualizar tipos**

Em `types/index.ts`, adicionar antes de `CategoriaDespesa`:

```ts
export type GrupoCategoria = 'fornecedores' | 'impostos' | 'funcionarios' | 'custos_fixos' | 'outros'

export const GRUPOS_CATEGORIA: { value: GrupoCategoria; label: string }[] = [
  { value: 'fornecedores', label: 'Fornecedores' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'funcionarios', label: 'Funcionários' },
  { value: 'custos_fixos', label: 'Custos Fixos' },
  { value: 'outros', label: 'Outros' },
]
```

E trocar a interface `CategoriaDespesa` por:

```ts
export interface CategoriaDespesa {
  id: string; unidade: Unidade; nome: string; grupo: GrupoCategoria; ativo: boolean; created_at: string
}
```

- [ ] **Step 4: Campo "Grupo" no modal de Categorias**

Em `app/categorias/page.tsx`:

1. No import de tipos, adicionar `GRUPOS_CATEGORIA, type GrupoCategoria`.
2. Adicionar estado: `const [grupo, setGrupo] = useState<GrupoCategoria>('outros')`.
3. Em `openNew()`: adicionar `setGrupo('outros')`.
4. Em `openEdit(r)`: adicionar `setGrupo(r.grupo)`.
5. Em `save()`: incluir `grupo` no objeto de insert e no de update:
   - `await sb.from('btx_categorias_despesas').update({ nome, unidade, grupo }).eq('id', editId)`
   - `await sb.from('btx_categorias_despesas').insert({ nome, unidade, grupo })`
6. No corpo do `<Modal>`, após o campo "Nome", adicionar:

```tsx
<div className="form-group">
  <label className="form-label">Grupo</label>
  <select className="form-select" value={grupo} onChange={e => setGrupo(e.target.value as GrupoCategoria)}>
    {GRUPOS_CATEGORIA.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
  </select>
</div>
```

- [ ] **Step 5: Coluna "Grupo" na tabela de Categorias**

Ainda em `app/categorias/page.tsx`, na `<table>` de listagem: adicionar `<th>Grupo</th>` após o header do nome, e na linha adicionar após a célula do nome:

```tsx
<td>{GRUPOS_CATEGORIA.find(g => g.value === r.grupo)?.label ?? 'Outros'}</td>
```

Ajustar qualquer `colSpan` de estados vazios/carregando (+1).

- [ ] **Step 6: Aplicar a migração no Supabase**

Rodar o conteúdo de `supabase_migration_categoria_grupo.sql` no SQL Editor do Supabase do projeto. (Passo manual — anotar na descrição do commit que precisa ser executado.)

- [ ] **Step 7: Verificar build de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `grupo` / `CategoriaDespesa`.

- [ ] **Step 8: Commit**

```bash
git add supabase_migration_categoria_grupo.sql supabase_schema.sql types/index.ts app/categorias/page.tsx
git commit -m "feat(categorias): grupo de classificacao (fornecedores/impostos/funcionarios/custos fixos)"
```

---

### Task 2: Módulo de cálculo `lib/painel-resumo.ts`

**Files:**
- Create: `lib/painel-resumo.ts`
- Create: `tests/painel-resumo.test.mts`

**Interfaces:**
- Consumes:
  - `calcularSaldoRealizado({ hoje, competenciaInicio, parcelas, pagamentos })` de `lib/financeiro.ts` — retorna `number` (delta das baixas no intervalo; **não** soma o saldo base).
  - `chaveCompetencia(ano, mes)` de `lib/financeiro.ts` — retorna `'YYYY-MM-01'`.
  - Tipos `ParcelaFinanceira`, `PagamentoParcela` de `lib/financeiro.ts`.
  - `GrupoCategoria` de `types/index.ts`.
- Produces:

```ts
export interface ContaPagar {
  id: string
  descricao: string
  vencimento: string        // YYYY-MM-DD
  valor: number             // restante (valor - pagamentos)
  grupo: GrupoCategoria
  unidade: string
  vencida: boolean          // vencimento < hoje
  proxima: boolean          // !vencida && vencimento <= hoje+7d
}

export interface GrupoPagar {
  grupo: GrupoCategoria
  label: string
  subtotal: number
  contas: ContaPagar[]
}

export interface ResumoUnidade {
  saldoHoje: number
  aReceberMes: number
  contasPagar: ContaPagar[]
  gruposPagar: GrupoPagar[]   // só grupos com contas, na ordem fixa
  totalDespesas: number
  resultado: number           // (saldoHoje + aReceberMes) - totalDespesas
  parcelasVencidas: number    // contas a pagar vencidas
}

export interface EntradaResumo {
  unidade: string
  ano: number
  mes: number
  hoje: string                       // YYYY-MM-DD
  saldoBase: number                  // saldo_inicial da base vigente
  competenciaBase: string            // 'YYYY-MM-01' da base vigente
  parcelas: ParcelaFinanceira[]      // todas ativas, não canceladas, da unidade
  pagamentos: PagamentoParcela[]
  grupoPorDespesa: Map<string, GrupoCategoria>  // origem_id (despesa) -> grupo
}

export function calcularResumoUnidade(input: EntradaResumo): ResumoUnidade
export function consolidarResumos(resumos: ResumoUnidade[]): ResumoUnidade
```

Regras:
- Intervalo do mês: `inicio = 'YYYY-MM-01'`, `fim = último dia` (`new Date(ano, mes, 0).getDate()`).
- `saldoHoje = saldoBase + calcularSaldoRealizado({ hoje, competenciaInicio: competenciaBase, parcelas, pagamentos })`.
- `restante(parcela) = Number(parcela.valor) - Σ pagamentos.valor com parcela_id === parcela.id`.
- Uma parcela entra em `aReceberMes` / `contasPagar` se: `ativo`, `status ∈ {pendente, parcial}`, `vencimento` entre início e fim do mês (inclusive).
  - `tipo === 'receber'` → soma `restante` em `aReceberMes`.
  - `tipo === 'pagar'` → vira `ContaPagar`.
- Grupo de uma conta a pagar:
  - `origem === 'compra'` → `'fornecedores'`.
  - `origem === 'despesa'` → `grupoPorDespesa.get(parcela.origem_id ?? '') ?? 'outros'`.
  - resto (`'manual'`, `'venda'`) → `'outros'`.
- `descricao`: usar `parcela.observacoes` se houver, senão `parcela.origem` capitalizado + ` (parc. ${numero_parcela})`.
- `vencida = vencimento < hoje`; `proxima = !vencida && vencimento <= (hoje + 7 dias)`.
- `gruposPagar`: para cada grupo da ordem fixa, se tiver contas, `{ grupo, label, subtotal, contas ordenadas por vencimento }`.
- `consolidarResumos`: soma `saldoHoje`, `aReceberMes`, `totalDespesas`, `resultado`, `parcelasVencidas`; concatena `contasPagar`; recomputa `gruposPagar` a partir da concatenação.

- [ ] **Step 1: Escrever os testes que falham**

Create `tests/painel-resumo.test.mts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularResumoUnidade, consolidarResumos, type EntradaResumo } from '../lib/painel-resumo.ts'
import type { ParcelaFinanceira, PagamentoParcela } from '../lib/financeiro.ts'

const HOJE = '2026-09-10'

const parc = (o: Partial<ParcelaFinanceira> = {}): ParcelaFinanceira => ({
  id: 'p1', tipo: 'pagar', origem: 'despesa', origem_id: 'd1', numero_parcela: 1,
  vencimento: '2026-09-20', valor: 1000, status: 'pendente', data_pagamento: null,
  ativo: true, ...o,
})

const base = (o: Partial<EntradaResumo> = {}): EntradaResumo => ({
  unidade: 'NEW BLUETEX MG', ano: 2026, mes: 9, hoje: HOJE,
  saldoBase: 5000, competenciaBase: '2026-09-01',
  parcelas: [], pagamentos: [], grupoPorDespesa: new Map(), ...o,
})

test('classifica compra como fornecedores', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ origem: 'compra', origem_id: 'c1', valor: 300 })] }))
  assert.equal(r.gruposPagar[0].grupo, 'fornecedores')
  assert.equal(r.gruposPagar[0].subtotal, 300)
})

test('classifica despesa pelo grupo da categoria', () => {
  const r = calcularResumoUnidade(base({
    parcelas: [parc({ origem: 'despesa', origem_id: 'd1', valor: 200 })],
    grupoPorDespesa: new Map([['d1', 'impostos']]),
  }))
  assert.equal(r.gruposPagar[0].grupo, 'impostos')
})

test('despesa sem grupo mapeado cai em outros', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ origem: 'manual', origem_id: null, valor: 50 })] }))
  assert.equal(r.gruposPagar[0].grupo, 'outros')
})

test('resultado = (saldoHoje + aReceberMes) - totalDespesas', () => {
  const r = calcularResumoUnidade(base({
    saldoBase: 1000,
    parcelas: [
      parc({ id: 'r1', tipo: 'receber', origem: 'venda', origem_id: 'v1', valor: 800 }),
      parc({ id: 'x1', tipo: 'pagar', valor: 300 }),
    ],
  }))
  assert.equal(r.saldoHoje, 1000)
  assert.equal(r.aReceberMes, 800)
  assert.equal(r.totalDespesas, 300)
  assert.equal(r.resultado, 1500)
})

test('parcela parcial entra pelo restante', () => {
  const pag: PagamentoParcela = { id: 'g1', parcela_id: 'p1', valor: 400, data_pagamento: '2026-09-05' }
  const r = calcularResumoUnidade(base({
    parcelas: [parc({ status: 'parcial', valor: 1000 })], pagamentos: [pag],
  }))
  assert.equal(r.totalDespesas, 600)
})

test('vencimento fora do mes nao entra', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ vencimento: '2026-10-02' })] }))
  assert.equal(r.totalDespesas, 0)
  assert.equal(r.gruposPagar.length, 0)
})

test('marca vencida', () => {
  const r = calcularResumoUnidade(base({ parcelas: [parc({ vencimento: '2026-09-01' })] }))
  assert.equal(r.contasPagar[0].vencida, true)
  assert.equal(r.parcelasVencidas, 1)
})

test('consolida soma unidades', () => {
  const a = calcularResumoUnidade(base({ saldoBase: 1000, parcelas: [parc({ valor: 100 })] }))
  const b = calcularResumoUnidade(base({ unidade: 'NEW BLUETEX SC', saldoBase: 500, parcelas: [parc({ id: 'p2', valor: 200 })] }))
  const c = consolidarResumos([a, b])
  assert.equal(c.saldoHoje, 1500)
  assert.equal(c.totalDespesas, 300)
  assert.equal(c.gruposPagar[0].contas.length, 2)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types tests/painel-resumo.test.mts`
Expected: FAIL — `Cannot find module '../lib/painel-resumo.ts'`.

- [ ] **Step 3: Implementar `lib/painel-resumo.ts`**

```ts
import { calcularSaldoRealizado, type ParcelaFinanceira, type PagamentoParcela } from './financeiro'
import type { GrupoCategoria } from '@/types'
import { GRUPOS_CATEGORIA } from '@/types'

export interface ContaPagar {
  id: string; descricao: string; vencimento: string; valor: number
  grupo: GrupoCategoria; unidade: string; vencida: boolean; proxima: boolean
}
export interface GrupoPagar {
  grupo: GrupoCategoria; label: string; subtotal: number; contas: ContaPagar[]
}
export interface ResumoUnidade {
  saldoHoje: number; aReceberMes: number
  contasPagar: ContaPagar[]; gruposPagar: GrupoPagar[]
  totalDespesas: number; resultado: number; parcelasVencidas: number
}
export interface EntradaResumo {
  unidade: string; ano: number; mes: number; hoje: string
  saldoBase: number; competenciaBase: string
  parcelas: ParcelaFinanceira[]; pagamentos: PagamentoParcela[]
  grupoPorDespesa: Map<string, GrupoCategoria>
}

const LABEL = new Map(GRUPOS_CATEGORIA.map(g => [g.value, g.label]))
const ORDEM = GRUPOS_CATEGORIA.map(g => g.value)

function addDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function montarGrupos(contas: ContaPagar[]): GrupoPagar[] {
  return ORDEM.flatMap(grupo => {
    const doGrupo = contas
      .filter(c => c.grupo === grupo)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    if (doGrupo.length === 0) return []
    return [{
      grupo,
      label: LABEL.get(grupo) ?? 'Outros',
      subtotal: doGrupo.reduce((s, c) => s + c.valor, 0),
      contas: doGrupo,
    }]
  })
}

export function calcularResumoUnidade(input: EntradaResumo): ResumoUnidade {
  const mes = String(input.mes).padStart(2, '0')
  const inicioMes = `${input.ano}-${mes}-01`
  const ultimoDia = new Date(input.ano, input.mes, 0).getDate()
  const fimMes = `${input.ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`
  const limiteProxima = addDias(input.hoje, 7)

  const pagoPorParcela = new Map<string, number>()
  for (const p of input.pagamentos) {
    pagoPorParcela.set(p.parcela_id, (pagoPorParcela.get(p.parcela_id) ?? 0) + Number(p.valor))
  }
  const restante = (p: ParcelaFinanceira) => Number(p.valor) - (pagoPorParcela.get(p.id) ?? 0)

  const saldoHoje = Number(input.saldoBase) + calcularSaldoRealizado({
    hoje: input.hoje,
    competenciaInicio: input.competenciaBase,
    parcelas: input.parcelas,
    pagamentos: input.pagamentos,
  })

  const noMes = (p: ParcelaFinanceira) =>
    p.ativo && (p.status === 'pendente' || p.status === 'parcial') &&
    p.vencimento >= inicioMes && p.vencimento <= fimMes

  let aReceberMes = 0
  const contasPagar: ContaPagar[] = []
  for (const p of input.parcelas) {
    if (!noMes(p)) continue
    if (p.tipo === 'receber') { aReceberMes += restante(p); continue }
    const grupo: GrupoCategoria =
      p.origem === 'compra' ? 'fornecedores'
      : p.origem === 'despesa' ? (input.grupoPorDespesa.get(p.origem_id ?? '') ?? 'outros')
      : 'outros'
    const vencida = p.vencimento < input.hoje
    contasPagar.push({
      id: p.id,
      descricao: p.observacoes?.trim() || `${capitalizar(p.origem)} (parc. ${p.numero_parcela})`,
      vencimento: p.vencimento,
      valor: restante(p),
      grupo,
      unidade: input.unidade,
      vencida,
      proxima: !vencida && p.vencimento <= limiteProxima,
    })
  }

  const gruposPagar = montarGrupos(contasPagar)
  const totalDespesas = contasPagar.reduce((s, c) => s + c.valor, 0)

  return {
    saldoHoje,
    aReceberMes,
    contasPagar,
    gruposPagar,
    totalDespesas,
    resultado: saldoHoje + aReceberMes - totalDespesas,
    parcelasVencidas: contasPagar.filter(c => c.vencida).length,
  }
}

export function consolidarResumos(resumos: ResumoUnidade[]): ResumoUnidade {
  const contasPagar = resumos.flatMap(r => r.contasPagar)
  const soma = (f: (r: ResumoUnidade) => number) => resumos.reduce((s, r) => s + f(r), 0)
  return {
    saldoHoje: soma(r => r.saldoHoje),
    aReceberMes: soma(r => r.aReceberMes),
    contasPagar,
    gruposPagar: montarGrupos(contasPagar),
    totalDespesas: soma(r => r.totalDespesas),
    resultado: soma(r => r.resultado),
    parcelasVencidas: soma(r => r.parcelasVencidas),
  }
}
```

Nota: se o import `@/types` não resolver sob `node --test`, trocar por caminho relativo `../types/index.ts` nos dois imports (o test de `financeiro` usa relativo). Verificar no Step 4.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types tests/painel-resumo.test.mts`
Expected: PASS — 8 testes.
Se falhar no resolve de `@/types`, aplicar a nota do Step 3 e rodar de novo.

- [ ] **Step 5: Commit**

```bash
git add lib/painel-resumo.ts tests/painel-resumo.test.mts
git commit -m "feat(painel): modulo de calculo do resumo executivo por unidade"
```

---

### Task 3: Reescrever `app/dashboard/page.tsx`

**Files:**
- Modify (rewrite): `app/dashboard/page.tsx`
- Modify: `components/Sidebar.tsx` (label do item `/dashboard`)

**Interfaces:**
- Consumes: `calcularResumoUnidade`, `consolidarResumos`, `type ResumoUnidade`, `type ContaPagar` de `lib/painel-resumo.ts`; `chaveCompetencia` de `lib/financeiro.ts`; `formatMoeda`, `formatData`, `getMesAnoLabel`, `mesAtual`, `anoAtual` de `lib/utils.ts`; `UNIDADES` de `types/index.ts`.
- Produces: nada (folha).

- [ ] **Step 1: Carregamento de dados por unidade**

Reescrever `app/dashboard/page.tsx`. Estrutura de dados/carga:

```tsx
'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { formatMoeda, formatData, getMesAnoLabel, mesAtual, anoAtual } from '@/lib/utils'
import { chaveCompetencia, type ParcelaFinanceira, type PagamentoParcela } from '@/lib/financeiro'
import { calcularResumoUnidade, consolidarResumos, type ResumoUnidade, type ContaPagar } from '@/lib/painel-resumo'
import { UNIDADES, type Unidade, type GrupoCategoria } from '@/types'

const SHORT: Record<string, string> = { 'NEW BLUETEX MG': 'MG', 'NEW BLUETEX SC': 'SC', 'NEW BLUETEX AM': 'AM' }

async function carregarUnidade(sb: ReturnType<typeof createClient>, unidade: string, ano: number, mes: number, hoje: string): Promise<ResumoUnidade> {
  const competenciaSel = chaveCompetencia(ano, mes)
  const [basesRes, parcelasRes, despesasRes] = await Promise.all([
    sb.from('btx_caixa_mensal').select('*').eq('unidade', unidade).order('ano', { ascending: false }).order('mes', { ascending: false }),
    sb.from('btx_parcelas').select('id,tipo,origem,origem_id,numero_parcela,vencimento,valor,status,data_pagamento,ativo,observacoes').eq('unidade', unidade).eq('ativo', true).neq('status', 'cancelado'),
    sb.from('btx_despesas').select('id, categoria:btx_categorias_despesas(grupo)').eq('unidade', unidade).eq('ativo', true),
  ])

  const bases = (basesRes.data ?? []) as { ano: number; mes: number; saldo_inicial: number }[]
  const baseVigente = bases.find(b => chaveCompetencia(b.ano, b.mes) <= competenciaSel)
  const competenciaBase = baseVigente ? chaveCompetencia(baseVigente.ano, baseVigente.mes) : competenciaSel

  const parcelas = (parcelasRes.data ?? []) as ParcelaFinanceira[]
  const ids = parcelas.map(p => p.id)
  const pagRes = ids.length
    ? await sb.from('btx_pagamentos_parcela').select('id,parcela_id,valor,data_pagamento').in('parcela_id', ids)
    : { data: [] as PagamentoParcela[] }
  const pagamentos = ((pagRes.data ?? []) as { id: string; parcela_id: string; valor: number; data_pagamento: string }[])
    .map(p => ({ id: p.id, parcela_id: p.parcela_id, valor: Number(p.valor), data_pagamento: p.data_pagamento }))

  const grupoPorDespesa = new Map<string, GrupoCategoria>()
  for (const d of (despesasRes.data ?? []) as { id: string; categoria: { grupo: GrupoCategoria } | null }[]) {
    grupoPorDespesa.set(d.id, d.categoria?.grupo ?? 'outros')
  }

  return calcularResumoUnidade({
    unidade, ano, mes, hoje,
    saldoBase: Number(baseVigente?.saldo_inicial ?? 0),
    competenciaBase, parcelas, pagamentos, grupoPorDespesa,
  })
}
```

- [ ] **Step 2: Componente de página — estado e abas**

```tsx
export default function DashboardPage() {
  const { profile, unidadeAtiva } = useAuth()
  const sb = useMemo(() => createClient(), [])
  const veTudo = profile?.role === 'admin' || profile?.role === 'diretoria'
  const [mes, setMes] = useState(mesAtual())
  const [ano, setAno] = useState(anoAtual())
  const [aba, setAba] = useState<'consolidado' | Unidade>('consolidado')
  const [porUnidade, setPorUnidade] = useState<Partial<Record<string, ResumoUnidade>>>({})
  const [loading, setLoading] = useState(true)
  const hoje = new Date().toISOString().slice(0, 10)

  const carregar = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const alvos = veTudo ? UNIDADES : (unidadeAtiva ? [unidadeAtiva] : [])
    const res: Partial<Record<string, ResumoUnidade>> = {}
    await Promise.all(alvos.map(async u => { res[u] = await carregarUnidade(sb, u, ano, mes, hoje) }))
    setPorUnidade(res)
    setLoading(false)
  }, [profile, veTudo, unidadeAtiva, sb, ano, mes, hoje])

  useEffect(() => { carregar() }, [carregar])

  function navMes(dir: number) {
    let m = mes + dir, a = ano
    if (m < 1) { m = 12; a-- }
    if (m > 12) { m = 1; a++ }
    setMes(m); setAno(a)
  }

  const unidadeSel = veTudo ? aba : (unidadeAtiva ?? '')
  const resumo: ResumoUnidade | null = !veTudo
    ? (unidadeAtiva ? porUnidade[unidadeAtiva] ?? null : null)
    : aba === 'consolidado'
      ? consolidarResumos(UNIDADES.map(u => porUnidade[u]).filter(Boolean) as ResumoUnidade[])
      : porUnidade[aba] ?? null
```

- [ ] **Step 3: JSX — header, abas, hero**

```tsx
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel Executivo</h1>
          <div className="page-subtitle">{getMesAnoLabel(mes, ano)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(-1)}>←</button>
          <span style={{ fontWeight: 600, fontSize: 13, minWidth: 130, textAlign: 'center' }}>{getMesAnoLabel(mes, ano)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navMes(1)}>→</button>
        </div>
      </div>

      {veTudo && (
        <div className="tabs">
          <button className={`tab${aba === 'consolidado' ? ' active' : ''}`} onClick={() => setAba('consolidado')}>◈ Consolidado</button>
          {UNIDADES.map(u => <button key={u} className={`tab${aba === u ? ' active' : ''}`} onClick={() => setAba(u)}>{SHORT[u]}</button>)}
        </div>
      )}

      {loading ? <div className="empty-state">Carregando...</div>
      : !resumo ? <div className="empty-state">Selecione uma unidade.</div>
      : (
        <>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-card-label">Saldo Hoje</div>
              <div className={`stat-card-value ${resumo.saldoHoje < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(resumo.saldoHoje)}</div>
              <div className="stat-card-sub">saldo real na data de hoje</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">A Receber · {getMesAnoLabel(mes, ano)}</div>
              <div className="stat-card-value" style={{ color: 'var(--purple)' }}>{formatMoeda(resumo.aReceberMes)}</div>
              <div className="stat-card-sub">parcelas que vencem no mês</div>
            </div>
            <div className="stat-card" style={{ borderColor: resumo.resultado >= 0 ? 'var(--green)' : 'var(--red)' }}>
              <div className="stat-card-label">Resultado de Caixa</div>
              <div className={`stat-card-value ${resumo.resultado >= 0 ? 'text-green' : 'text-red'}`} style={{ fontSize: 28 }}>{formatMoeda(resumo.resultado)}</div>
              <div className="stat-card-sub">(saldo + a receber) − contas a pagar</div>
            </div>
          </div>

          {resumo.parcelasVencidas > 0 && (
            <div className="alert alert-red" style={{ marginBottom: 16 }}>⚠ {resumo.parcelasVencidas} conta(s) a pagar vencida(s) sem baixa</div>
          )}
```

- [ ] **Step 4: JSX — blocos de contas a pagar + total**

```tsx
          {resumo.gruposPagar.length === 0 ? (
            <div className="card"><div className="empty-state" style={{ padding: '24px 0' }}>Nenhuma conta a pagar em {getMesAnoLabel(mes, ano)}</div></div>
          ) : (
            <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
              {resumo.gruposPagar.map(g => (
                <div className="card" key={g.grupo}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{g.label}</div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{formatMoeda(g.subtotal)}</div>
                  </div>
                  {g.contas.map((c: ContaPagar) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: c.vencida ? 'var(--red)' : c.proxima ? 'var(--amber)' : 'var(--text)' }}>
                          {c.vencida ? '⚠ ' : c.proxima ? '⏰ ' : ''}{c.descricao}
                          {veTudo && aba === 'consolidado' && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)' }}>{SHORT[c.unidade]}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>vence {formatData(c.vencimento)}</div>
                      </div>
                      <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: c.vencida ? 'var(--red)' : 'var(--text)' }}>{formatMoeda(c.valor)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="stat-card" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="stat-card-label" style={{ margin: 0 }}>Total Despesas do Mês</div>
            <div className="stat-card-value text-red" style={{ margin: 0 }}>{formatMoeda(resumo.totalDespesas)}</div>
          </div>
```

- [ ] **Step 5: JSX — tabela por unidade (consolidado) + fechar**

```tsx
          {veTudo && aba === 'consolidado' && (
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 16 }}>Por Unidade</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Unidade</th><th>Saldo Hoje</th><th>A Receber</th><th>A Pagar</th><th>Resultado</th></tr></thead>
                  <tbody>
                    {UNIDADES.map(u => {
                      const d = porUnidade[u]
                      if (!d) return null
                      return (
                        <tr key={u} style={{ cursor: 'pointer' }} onClick={() => setAba(u)}>
                          <td><span className="badge badge-purple">{SHORT[u]}</span></td>
                          <td className={`mono ${d.saldoHoje < 0 ? 'text-red' : 'text-green'}`}>{formatMoeda(d.saldoHoje)}</td>
                          <td className="mono" style={{ color: 'var(--purple)' }}>{formatMoeda(d.aReceberMes)}</td>
                          <td className="mono text-red">{formatMoeda(d.totalDespesas)}</td>
                          <td className={`mono ${d.resultado >= 0 ? 'text-green' : 'text-red'}`}>{formatMoeda(d.resultado)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Ajustar label na Sidebar**

Em `components/Sidebar.tsx`, no array `NAV`, trocar `{ href: '/dashboard', label: 'Dashboard' }` por `{ href: '/dashboard', label: 'Painel Executivo' }`.

- [ ] **Step 7: Verificar tipos e lint**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Verificar no navegador**

Run: `npm run dev` (ou preview_start com o dev server). Abrir `/dashboard` logado como admin.
Conferir: abas trocam de unidade; navegação de mês recarrega; os 3 cartões hero aparecem; blocos de contas a pagar só aparecem quando há parcela no mês; total e tabela por unidade batem com a soma.
Checar `read_console_messages` — sem erros.

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/page.tsx components/Sidebar.tsx
git commit -m "feat(dashboard): painel executivo (saldo hoje, a receber, contas a pagar por grupo, resultado de caixa)"
```

---

### Task 4: Conferência contra a planilha e limpeza

**Files:**
- Modify (se necessário): `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: nada.

- [ ] **Step 1: Reclassificar categorias existentes**

Na tela `/categorias` (como admin), abrir cada categoria de cada unidade e ajustar o "Grupo" (a migração deixou tudo em "Outros"). Guiar-se pelos nomes usados hoje (ex.: "Clean" → Fornecedores, "GNRE"/impostos → Impostos, folha/salário → Funcionários, aluguel/energia → Custos Fixos).

- [ ] **Step 2: Conferir mês fechado contra a planilha**

Apontar o painel para o mês fechado anterior. Comparar, por unidade, `Saldo Hoje` (ou o saldo informado), `A Receber`, `Total Despesas` e `Resultado` com a planilha da diretoria.
Registrar divergências: se vierem de dado faltando (parcela não lançada, saldo mensal ausente em `btx_caixa_mensal`), é problema de dados — anotar para a fase 2. Se vier de cálculo, corrigir em `lib/painel-resumo.ts` + teste.

- [ ] **Step 3: Rodar toda a suíte**

Run: `node --test --experimental-strip-types tests/financeiro.test.mts tests/estoque.test.mts tests/painel-resumo.test.mts`
Expected: tudo PASS.

- [ ] **Step 4: Commit (se houve correção)**

```bash
git add -A
git commit -m "fix(painel): ajustes apos conferencia contra a planilha"
```

---

## Self-Review

**Spec coverage:**
- Migração `grupo` → Task 1 ✓
- Tela Categorias (campo + coluna) → Task 1 Steps 4-5 ✓
- `lib/painel-resumo.ts` com `saldoHoje / aReceberMes / contasPagar / gruposPagar / totalDespesas / resultado` → Task 2 ✓
- Classificação por origem (compra→fornecedores, despesa→categoria, manual/venda→outros) → Task 2 Step 3 + testes ✓
- `resultado = (saldoHoje + aReceberMes) − totalDespesas` → Task 2 teste dedicado ✓
- Consolidado = soma das unidades → Task 2 `consolidarResumos` + teste ✓
- Reescrita do dashboard: header + nav mês + abas + hero + blocos + total + tabela por unidade → Task 3 ✓
- Sai estoque / lista plana → Task 3 (reescrita não os inclui) ✓
- Diretoria somente leitura → painel não tem ações; abas liberadas via `veTudo` ✓
- Conferência contra planilha do mês fechado → Task 4 ✓
- Bordas (sem `btx_caixa_mensal` → base 0; mês futuro → zerado; categoria removida → outros) → cobertas por `?? 0` / `?? 'outros'` no código da Task 2/3 ✓

**Placeholder scan:** nenhum "TBD/TODO"; todo passo com código tem código completo.

**Type consistency:** `ResumoUnidade`, `ContaPagar`, `GrupoPagar`, `EntradaResumo`, `GrupoCategoria`, `GRUPOS_CATEGORIA`, `calcularResumoUnidade`, `consolidarResumos` usados com a mesma assinatura nas Tasks 2 e 3. `calcularSaldoRealizado({ hoje, competenciaInicio, parcelas, pagamentos })` confere com `lib/financeiro.ts`.
