# Painel Financeiro com Calendário de Saldo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o Caixa Mensal por um painel financeiro com contas a pagar à esquerda, saldo diário em calendário ao centro e contas a receber à direita.

**Architecture:** Funções puras em `lib/financeiro.ts` normalizam datas efetivas e calculam o saldo acumulado a partir do saldo-base mais recente. A rota `/caixa` consulta Supabase, enriquece as parcelas e distribui a apresentação entre três componentes focados. O CSS global recebe somente as classes específicas e responsivas do painel.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, CSS global existente e `node:test` nativo do Node 24.

## Global Constraints

- Não adicionar dependências.
- Preservar a rota `/caixa` e as políticas RLS existentes.
- Não alterar as telas independentes de parcelas, compras, vendas ou despesas.
- Parcelas pendentes usam `vencimento`; parcelas pagas usam `data_pagamento` e caem no vencimento apenas como fallback inconsistente.
- Parcelas canceladas ou inativas não entram nos cálculos.
- O ponto mais recente de `btx_caixa_mensal` anterior ou igual ao mês selecionado inicia o encadeamento.
- A seleção de um dia filtra as listas, mas não altera os totais mensais.
- Implementação desktop em três colunas e mobile com calendário primeiro e listas em abas.
- Referência de design: `docs/superpowers/specs/2026-08-06-painel-financeiro-calendario-design.md`.

---

### Task 1: Motor financeiro testado

**Files:**
- Create: `tests/financeiro.test.ts`
- Create: `lib/financeiro.ts`

**Interfaces:**
- Consumes: parcelas no shape `ParcelaFinanceira` e um `SaldoBase` opcional.
- Produces: `obterDataEfetiva`, `normalizarMovimentacoes` e `calcularPainelFinanceiro`.

- [ ] **Step 1: Escrever testes falhando para datas, sinais e saldo acumulado**

Criar `tests/financeiro.test.ts` com `node:test` e `node:assert/strict`. Cobrir explicitamente:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularPainelFinanceiro, normalizarMovimentacoes } from '../lib/financeiro.ts'

const parcela = (overrides = {}) => ({
  id: 'p1', tipo: 'pagar' as const, origem: 'despesa', origem_id: null,
  numero_parcela: 1, vencimento: '2026-08-10', valor: 2800,
  status: 'pendente' as const, data_pagamento: null, ativo: true,
  numero_boleto: null, observacoes: null, ...overrides,
})

test('pendente usa vencimento e reduz o saldo a partir desse dia', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026, mes: 8, hoje: '2026-08-12', saldoBase: 11500,
    competenciaBase: '2026-08-01', parcelas: [parcela()],
  })
  assert.equal(result.dias[8].saldoFinal, 11500)
  assert.equal(result.dias[9].saidas, 2800)
  assert.equal(result.dias[9].saldoFinal, 8700)
  assert.equal(result.dias[10].saldoFinal, 8700)
  assert.equal(result.movimentacoesMes[0].atrasada, true)
})

test('recebimento do dia 15 aumenta o saldo e compõe o saldo final', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026, mes: 8, hoje: '2026-08-12', saldoBase: 11500,
    competenciaBase: '2026-08-01',
    parcelas: [parcela(), parcela({ id: 'r1', tipo: 'receber', vencimento: '2026-08-15', valor: 9500 })],
  })
  assert.equal(result.dias[14].entradas, 9500)
  assert.equal(result.dias[14].saldoFinal, 18200)
  assert.equal(result.resumo.saldoFinal, 18200)
})

test('paga usa data real e não vencimento', () => {
  const [mov] = normalizarMovimentacoes([
    parcela({ status: 'pago', vencimento: '2026-07-10', data_pagamento: '2026-08-03' }),
  ], '2026-08-12')
  assert.equal(mov.data, '2026-08-03')
  assert.equal(mov.inconsistente, false)
})

test('paga sem data usa vencimento e sinaliza inconsistência', () => {
  const [mov] = normalizarMovimentacoes([parcela({ status: 'pago' })], '2026-08-12')
  assert.equal(mov.data, '2026-08-10')
  assert.equal(mov.inconsistente, true)
})

test('cancelada e inativa não entram no cálculo', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026, mes: 8, hoje: '2026-08-12', saldoBase: 100,
    competenciaBase: '2026-08-01',
    parcelas: [parcela({ status: 'cancelado' }), parcela({ id: 'p2', ativo: false })],
  })
  assert.equal(result.movimentacoesMes.length, 0)
  assert.equal(result.resumo.saldoFinal, 100)
})

test('movimentos anteriores ao mês encadeiam o saldo inicial', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026, mes: 8, hoje: '2026-08-12', saldoBase: 1000,
    competenciaBase: '2026-07-01',
    parcelas: [
      parcela({ vencimento: '2026-07-10', valor: 200 }),
      parcela({ id: 'r1', tipo: 'receber', vencimento: '2026-07-15', valor: 500 }),
    ],
  })
  assert.equal(result.resumo.saldoInicial, 1300)
  assert.equal(result.resumo.saldoFinal, 1300)
})

test('soma várias entradas e saídas no mesmo dia', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026, mes: 8, hoje: '2026-08-01', saldoBase: 1000,
    competenciaBase: '2026-08-01',
    parcelas: [parcela({ valor: 200 }), parcela({ id: 'p2', valor: 300 }), parcela({ id: 'r1', tipo: 'receber', valor: 900 })],
  })
  assert.equal(result.dias[9].saidas, 500)
  assert.equal(result.dias[9].entradas, 900)
  assert.equal(result.dias[9].saldoFinal, 1400)
})
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/financeiro.test.ts`

Expected: FAIL com `ERR_MODULE_NOT_FOUND` para `lib/financeiro.ts`.

- [ ] **Step 3: Implementar o motor mínimo**

Criar `lib/financeiro.ts` com estes tipos e funções:

```ts
export type TipoMovimento = 'pagar' | 'receber'
export type StatusMovimento = 'pendente' | 'pago' | 'cancelado'

export interface ParcelaFinanceira {
  id: string; tipo: TipoMovimento; origem: string; origem_id: string | null
  numero_parcela: number; vencimento: string; valor: number
  status: StatusMovimento; data_pagamento: string | null; ativo: boolean
  numero_boleto: string | null; observacoes: string | null
  descricao?: string
}

export interface MovimentacaoFinanceira extends ParcelaFinanceira {
  data: string; entradas: number; saidas: number
  atrasada: boolean; inconsistente: boolean
}

export interface DiaFinanceiro {
  data: string; dia: number; entradas: number; saidas: number
  saldoFinal: number; movimentacoes: MovimentacaoFinanceira[]
}

export function obterDataEfetiva(parcela: ParcelaFinanceira) {
  const inconsistente = parcela.status === 'pago' && !parcela.data_pagamento
  return { data: parcela.status === 'pago' && parcela.data_pagamento ? parcela.data_pagamento : parcela.vencimento, inconsistente }
}

export function normalizarMovimentacoes(parcelas: ParcelaFinanceira[], hoje: string): MovimentacaoFinanceira[] {
  return parcelas
    .filter(p => p.ativo && p.status !== 'cancelado')
    .map(p => {
      const { data, inconsistente } = obterDataEfetiva(p)
      const valor = Number(p.valor)
      return { ...p, valor, data, inconsistente, entradas: p.tipo === 'receber' ? valor : 0, saidas: p.tipo === 'pagar' ? valor : 0, atrasada: p.status === 'pendente' && p.vencimento < hoje }
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
}

export function calcularPainelFinanceiro(input: {
  ano: number; mes: number; hoje: string; saldoBase: number
  competenciaBase: string; parcelas: ParcelaFinanceira[]
}) {
  const inicioMes = `${input.ano}-${String(input.mes).padStart(2, '0')}-01`
  const ultimoDia = new Date(input.ano, input.mes, 0).getDate()
  const fimMes = `${input.ano}-${String(input.mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  const movimentacoes = normalizarMovimentacoes(input.parcelas, input.hoje)
    .filter(m => m.data >= input.competenciaBase && m.data <= fimMes)
  const anteriores = movimentacoes.filter(m => m.data < inicioMes)
  const saldoInicial = anteriores.reduce((saldo, m) => saldo + m.entradas - m.saidas, Number(input.saldoBase))
  const movimentacoesMes = movimentacoes.filter(m => m.data >= inicioMes)
  let saldo = saldoInicial
  const dias: DiaFinanceiro[] = Array.from({ length: ultimoDia }, (_, index) => {
    const dia = index + 1
    const data = `${input.ano}-${String(input.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    const movimentosDia = movimentacoesMes.filter(m => m.data === data)
    const entradas = movimentosDia.reduce((total, m) => total + m.entradas, 0)
    const saidas = movimentosDia.reduce((total, m) => total + m.saidas, 0)
    saldo += entradas - saidas
    return { data, dia, entradas, saidas, saldoFinal: saldo, movimentacoes: movimentosDia }
  })
  const totalEntradas = movimentacoesMes.reduce((total, m) => total + m.entradas, 0)
  const totalSaidas = movimentacoesMes.reduce((total, m) => total + m.saidas, 0)
  return { movimentacoesMes, dias, resumo: { saldoInicial, totalEntradas, totalSaidas, saldoFinal: saldo } }
}
```

- [ ] **Step 4: Executar e confirmar GREEN**

Run: `node --test tests/financeiro.test.ts`

Expected: 7 testes passando.

- [ ] **Step 5: Commit**

```bash
git add tests/financeiro.test.ts lib/financeiro.ts
git commit -m "feat(financeiro): adiciona motor de saldo diario"
```

---

### Task 2: Componentes de apresentação

**Files:**
- Create: `components/financeiro/ResumoFinanceiro.tsx`
- Create: `components/financeiro/ListaMovimentacoes.tsx`
- Create: `components/financeiro/CalendarioFinanceiro.tsx`

**Interfaces:**
- Consumes: `MovimentacaoFinanceira`, `DiaFinanceiro` e `formatMoeda`.
- Produces: componentes sem acesso ao Supabase, controlados por props.

- [ ] **Step 1: Criar componentes focados**

`ResumoFinanceiro` recebe `saldoInicial`, `totalSaidas`, `totalEntradas` e `saldoFinal` e renderiza quatro `.finance-stat`.

`ListaMovimentacoes` recebe:

```ts
interface ListaProps {
  tipo: 'pagar' | 'receber'
  movimentacoes: MovimentacaoFinanceira[]
  diaSelecionado: string | null
}
```

O componente filtra pelo `tipo` e, quando há `diaSelecionado`, também por `data`. Cada `.finance-movement` mostra `descricao`, data formatada, origem, valor e badges para `ATRASADA`, `PENDENTE`, `PAGO` ou `DATA INCONSISTENTE`.

`CalendarioFinanceiro` recebe:

```ts
interface CalendarioProps {
  ano: number; mes: number; dias: DiaFinanceiro[]
  hoje: string; diaSelecionado: string | null
  onSelectDia: (data: string | null) => void
}
```

Ele calcula o deslocamento do primeiro dia com `new Date(ano, mes - 1, 1).getDay()`, cria células vazias e botões `.finance-day`. Cada botão apresenta número, entradas, saídas e saldo final, com `aria-label` descritivo. O rodapé resume o dia selecionado e oferece **Ver mês inteiro**.

- [ ] **Step 2: Checagem de tipos**

Run: `npx tsc --noEmit`

Expected: PASS sem erros nos três componentes.

- [ ] **Step 3: Commit**

```bash
git add components/financeiro
git commit -m "feat(financeiro): cria resumo listas e calendario"
```

---

### Task 3: Integração Supabase na rota `/caixa`

**Files:**
- Modify: `app/caixa/page.tsx`

**Interfaces:**
- Consumes: componentes da Task 2 e `calcularPainelFinanceiro`.
- Produces: carregamento de saldo-base, parcelas e descrições de origem; ajuste administrativo por competência.

- [ ] **Step 1: Reescrever a página como orquestradora**

A página deve manter `mes`, `ano`, `unidade`, `loading`, `error`, `diaSelecionado`, `mobileTab`, `saldoModal`, `saldoEdit` e `saving` em estado.

Em `loadData`, executar:

```ts
const competenciaSelecionada = `${ano}-${String(mes).padStart(2, '0')}-01`
const { data: bases } = await sb.from('btx_caixa_mensal').select('*')
  .eq('unidade', unidade).lte('ano', ano).order('ano', { ascending: false }).order('mes', { ascending: false })
const base = (bases ?? []).find(b => `${b.ano}-${String(b.mes).padStart(2, '0')}-01` <= competenciaSelecionada)
const competenciaBase = base ? `${base.ano}-${String(base.mes).padStart(2, '0')}-01` : competenciaSelecionada
let parcelasQuery = sb.from('btx_parcelas').select('*').eq('unidade', unidade).eq('ativo', true)
  .neq('status', 'cancelado').or(`vencimento.gte.${competenciaBase},data_pagamento.gte.${competenciaBase}`)
```

Buscar também compras, vendas, despesas, fornecedores e clientes referenciados nas parcelas e construir `descricao` com fallback seguro. Não bloquear o cálculo se uma origem não for encontrada.

Calcular a view model com:

```ts
calcularPainelFinanceiro({
  ano, mes, hoje: hoje(), saldoBase: Number(base?.saldo_inicial ?? 0),
  competenciaBase, parcelas: parcelasEnriquecidas,
})
```

Renderizar cabeçalho, filtros, aviso sem saldo-base, resumo, grid de três colunas e modal **Ajustar saldo-base**. O `upsert` mantém a chave `unidade,mes,ano` e grava `saldo_inicial: saldoEdit`.

- [ ] **Step 2: Preservar todos os estados de erro**

Cada consulta crítica deve verificar `error`; em falha, definir uma mensagem única e não renderizar totais parciais. O botão **Tentar novamente** chama `loadData`. Sem unidade, mostrar o estado vazio existente.

- [ ] **Step 3: Checagem de tipos**

Run: `npx tsc --noEmit`

Expected: PASS sem erros.

- [ ] **Step 4: Commit**

```bash
git add app/caixa/page.tsx
git commit -m "feat(caixa): integra painel financeiro com Supabase"
```

---

### Task 4: Estilos responsivos e testes estruturais

**Files:**
- Create: `tests/painel-financeiro-ui.test.js`
- Modify: `app/globals.css`
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: classes renderizadas nas Tasks 2 e 3.
- Produces: layout aprovado em desktop e mobile, e menu renomeado para Painel Financeiro.

- [ ] **Step 1: Escrever teste estrutural falhando**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

test('painel financeiro mantém layout, calendário e estados acessíveis', () => {
  const page = fs.readFileSync('app/caixa/page.tsx', 'utf8')
  const css = fs.readFileSync('app/globals.css', 'utf8')
  const sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8')
  assert.match(page, /Painel Financeiro/)
  assert.match(page, /Ajustar saldo-base/)
  assert.match(css, /\.finance-layout/)
  assert.match(css, /@media \(max-width: 900px\)/)
  assert.match(sidebar, /href: '\/caixa', label: 'Painel Financeiro'/)
})
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `node --test tests/painel-financeiro-ui.test.js`

Expected: FAIL porque as classes e o novo rótulo ainda não existem.

- [ ] **Step 3: Implementar o CSS e o rótulo**

Adicionar classes `.finance-toolbar`, `.finance-summary`, `.finance-stat`, `.finance-layout`, `.finance-panel`, `.finance-movement`, `.finance-calendar-grid`, `.finance-weekday`, `.finance-day`, `.finance-day.has-in`, `.finance-day.has-out`, `.finance-day.has-both`, `.finance-day.negative`, `.finance-day.selected`, `.finance-day.today`, `.finance-calendar-footer`, `.finance-mobile-tabs` e seus estados de foco.

Em `@media (max-width: 900px)`, usar uma coluna, posicionar `.finance-calendar-panel` primeiro, ocultar a lista sem `.mobile-active` e mostrar `.finance-mobile-tabs`. Em `@media (max-width: 560px)`, quebrar o resumo para uma coluna e reduzir a densidade das células sem ocultar valores.

Em `components/Sidebar.tsx`, substituir somente:

```ts
{ href: '/caixa', label: 'Caixa Mensal' }
```

por:

```ts
{ href: '/caixa', label: 'Painel Financeiro' }
```

- [ ] **Step 4: Confirmar GREEN e regressão**

Run: `node --test tests/financeiro.test.ts tests/painel-financeiro-ui.test.js`

Expected: todos os testes passando.

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `npm run build`

Expected: build Next.js concluído sem erro.

- [ ] **Step 5: Verificação visual**

Executar `npm run dev`, abrir `/caixa` e conferir desktop e viewport móvel. Validar cinco pontos contra o mockup: quatro indicadores, ordem pagar/calendário/receber, saldo em cada dia, vermelho/verde e abas mobile. Testar navegação mensal, seleção/limpeza de dia, saldo negativo, estado vazio, erro e modal administrativo.

- [ ] **Step 6: Commit**

```bash
git add tests/painel-financeiro-ui.test.js app/globals.css components/Sidebar.tsx
git commit -m "feat(financeiro): finaliza layout responsivo do painel"
```

---

## Checklist final

- [ ] `node --test tests/financeiro.test.ts tests/painel-financeiro-ui.test.js` passa.
- [ ] `npx tsc --noEmit` passa.
- [ ] `npm run build` passa.
- [ ] Desktop e mobile verificados no navegador.
- [ ] Apenas arquivos do painel e documentos planejados entram nos commits.
- [ ] Alterações preexistentes do usuário continuam preservadas.
- [ ] Commit final enviado ao remoto somente depois da verificação.
