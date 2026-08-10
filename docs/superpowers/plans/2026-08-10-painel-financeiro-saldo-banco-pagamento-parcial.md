# Painel Financeiro — Saldo em Banco e Pagamento Parcial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No Painel Financeiro (`/caixa`), renomear e destacar o saldo-base como "Saldo em banco", e permitir que administradores registrem pagamentos parciais (com histórico editável) direto nas contas a pagar/receber, refletindo cada pagamento no dia real em que aconteceu.

**Architecture:** O motor de cálculo puro em `lib/financeiro.ts` ganha um segundo insumo (lançamentos de `btx_pagamentos_parcela`) e passa a gerar um movimento por lançamento de pagamento, mais um movimento "restante" no vencimento quando a parcela não está totalmente quitada. `app/caixa/page.tsx` carrega esses lançamentos, expõe CRUD para eles e sincroniza o status da parcela (`pendente` → `parcial` → `pago`) via uma função pura reutilizável. A UI (`ListaMovimentacoes`) agrupa os movimentos de volta por parcela para mostrar um card por conta, com um log expansível de pagamentos.

**Tech Stack:** Next.js (App Router) + React 19 + TypeScript, Supabase (Postgres + RLS), `node:test`/`node:assert` para testes de lógica pura e smoke tests de arquivo.

## Global Constraints

- Não alterar `/parcelas-pagar` e `/parcelas-receber` (pagamento parcial é exclusivo do Painel Financeiro).
- Não alterar a regra de encadeamento mensal do saldo-base nem `btx_caixa_mensal`.
- Registrar pagamento (total ou parcial) e editar/excluir lançamentos: somente admin (`profile?.role === 'admin'`), reforçado por RLS na nova tabela.
- Parcela sem lançamento em `btx_pagamentos_parcela` deve se comportar exatamente como hoje (sem regressão).
- Usar os componentes e padrões já existentes: `Modal`, `ConfirmDialog`, classes CSS `badge-*`, `finance-*`.

---

## Task 1: Motor financeiro — divide movimentos por lançamento de pagamento

**Files:**
- Modify: `lib/financeiro.ts`
- Test: `tests/financeiro.test.mts`

**Interfaces:**
- Produces: `export type StatusMovimento = 'pendente' | 'pago' | 'parcial' | 'cancelado'` (era `'pendente' | 'pago' | 'cancelado'`).
- Produces: `export interface PagamentoParcela { id: string; parcela_id: string; valor: number; data_pagamento: string }`.
- Produces: `MovimentacaoFinanceira` ganha `parcela_id: string` e `valor_total: number` (além dos campos já existentes: `data`, `entradas`, `saidas`, `atrasada`, `inconsistente`).
- Produces: `normalizarMovimentacoes(parcelas: ParcelaFinanceira[], hoje: string, pagamentosPorParcela?: Map<string, PagamentoParcela[]>): MovimentacaoFinanceira[]`.
- Produces: `calcularPainelFinanceiro` aceita um campo opcional `pagamentos?: PagamentoParcela[]` no input.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `tests/financeiro.test.mts` (mantendo os testes existentes intactos):

```ts
import { calcularStatusPagamento, type PagamentoParcela } from '../lib/financeiro.ts'

const pagamento = (overrides: Partial<PagamentoParcela> = {}): PagamentoParcela => ({
  id: 'pg1',
  parcela_id: 'p1',
  valor: 600,
  data_pagamento: '2026-08-05',
  ...overrides,
})

test('pagamento parcial gera um movimento na data do lançamento', () => {
  const [movimento] = normalizarMovimentacoes(
    [parcela({ valor: 1000, vencimento: '2026-08-20' })],
    '2026-08-12',
    new Map([['p1', [pagamento()]]]),
  )

  assert.equal(movimento.data, '2026-08-05')
  assert.equal(movimento.valor, 600)
  assert.equal(movimento.valor_total, 1000)
  assert.equal(movimento.status, 'pago')
})

test('saldo restante de parcela parcial aparece como movimento parcial no vencimento', () => {
  const movimentos = normalizarMovimentacoes(
    [parcela({ valor: 1000, vencimento: '2026-08-20' })],
    '2026-08-12',
    new Map([['p1', [pagamento()]]]),
  )
  const restante = movimentos.find(m => m.status === 'parcial')

  assert.ok(restante)
  assert.equal(restante!.data, '2026-08-20')
  assert.equal(restante!.valor, 400)
  assert.equal(restante!.atrasada, false)
})

test('parcial vencido aparece como atrasado', () => {
  const movimentos = normalizarMovimentacoes(
    [parcela({ valor: 1000, vencimento: '2026-08-01' })],
    '2026-08-12',
    new Map([['p1', [pagamento({ data_pagamento: '2026-07-20' })]]]),
  )
  const restante = movimentos.find(m => m.status === 'parcial')

  assert.equal(restante!.atrasada, true)
})

test('múltiplos lançamentos que somam o valor total não deixam saldo restante', () => {
  const movimentos = normalizarMovimentacoes(
    [parcela({ valor: 1000, vencimento: '2026-08-20' })],
    '2026-08-12',
    new Map([['p1', [
      pagamento({ id: 'pg1', valor: 600, data_pagamento: '2026-08-05' }),
      pagamento({ id: 'pg2', valor: 400, data_pagamento: '2026-08-20' }),
    ]]]),
  )

  assert.equal(movimentos.length, 2)
  assert.equal(movimentos.every(m => m.status === 'pago'), true)
  assert.equal(movimentos.reduce((total, m) => total + m.valor, 0), 1000)
})

test('calcularPainelFinanceiro soma pagamentos parciais no saldo diário na data real', () => {
  const result = calcularPainelFinanceiro({
    ano: 2026,
    mes: 8,
    hoje: '2026-08-12',
    saldoBase: 1000,
    competenciaBase: '2026-08-01',
    parcelas: [parcela({ valor: 1000, vencimento: '2026-08-20' })],
    pagamentos: [pagamento({ valor: 600, data_pagamento: '2026-08-05' })],
  })

  assert.equal(result.dias[4].saidas, 600)
  assert.equal(result.dias[4].saldoFinal, 400)
  assert.equal(result.dias[19].saidas, 400)
  assert.equal(result.dias[19].saldoFinal, 0)
})

test('parcela sem lançamento continua com um único movimento (regressão)', () => {
  const movimentos = normalizarMovimentacoes([parcela({ valor: 1000 })], '2026-08-12')

  assert.equal(movimentos.length, 1)
  assert.equal(movimentos[0].valor, 1000)
  assert.equal(movimentos[0].valor_total, 1000)
  assert.equal(movimentos[0].parcela_id, 'p1')
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/financeiro.test.mts`
Expected: FAIL — `valor_total`/`parcela_id` undefined, `pagamentos` não é aceito no input, `calcularStatusPagamento` não existe (esse último falha só na importação — se travar todo o arquivo, comente a linha de import e os testes que a usam até a Task 2; senão pode implementar as duas tasks em sequência aqui mesmo). Para esta task, ignore falhas relacionadas a `calcularStatusPagamento` — elas serão resolvidas na Task 2.

- [ ] **Step 3: Implementar o split de movimentos**

Em `lib/financeiro.ts`, substituir o bloco de tipos do topo e a função `normalizarMovimentacoes` inteira:

```ts
export type TipoMovimento = 'pagar' | 'receber'
export type StatusMovimento = 'pendente' | 'pago' | 'parcial' | 'cancelado'

export interface ParcelaFinanceira {
  id: string
  tipo: TipoMovimento
  origem: string
  origem_id: string | null
  numero_parcela: number
  vencimento: string
  valor: number
  status: StatusMovimento
  data_pagamento: string | null
  ativo: boolean
  numero_boleto: string | null
  observacoes: string | null
  descricao?: string
}

export interface PagamentoParcela {
  id: string
  parcela_id: string
  valor: number
  data_pagamento: string
}

export interface MovimentacaoFinanceira extends ParcelaFinanceira {
  parcela_id: string
  valor_total: number
  data: string
  entradas: number
  saidas: number
  atrasada: boolean
  inconsistente: boolean
}
```

```ts
export function normalizarMovimentacoes(
  parcelas: ParcelaFinanceira[],
  hoje: string,
  pagamentosPorParcela: Map<string, PagamentoParcela[]> = new Map(),
): MovimentacaoFinanceira[] {
  const movimentos: MovimentacaoFinanceira[] = []

  for (const parcela of parcelas.filter(item => item.ativo && item.status !== 'cancelado')) {
    const valorTotal = Number(parcela.valor)
    const pagamentos = pagamentosPorParcela.get(parcela.id) ?? []

    if (pagamentos.length === 0) {
      const { data, inconsistente } = obterDataEfetiva(parcela)
      movimentos.push({
        ...parcela,
        parcela_id: parcela.id,
        valor: valorTotal,
        valor_total: valorTotal,
        data,
        inconsistente,
        entradas: parcela.tipo === 'receber' ? valorTotal : 0,
        saidas: parcela.tipo === 'pagar' ? valorTotal : 0,
        atrasada: parcela.status === 'pendente' && parcela.vencimento < hoje,
      })
      continue
    }

    const valorPago = pagamentos.reduce((total, item) => total + Number(item.valor), 0)
    const saldoRestante = Math.max(0, valorTotal - valorPago)

    for (const item of pagamentos) {
      const valor = Number(item.valor)
      movimentos.push({
        ...parcela,
        id: item.id,
        parcela_id: parcela.id,
        status: 'pago',
        valor,
        valor_total: valorTotal,
        data: item.data_pagamento,
        inconsistente: false,
        entradas: parcela.tipo === 'receber' ? valor : 0,
        saidas: parcela.tipo === 'pagar' ? valor : 0,
        atrasada: false,
      })
    }

    if (saldoRestante > 0) {
      movimentos.push({
        ...parcela,
        parcela_id: parcela.id,
        status: 'parcial',
        valor: saldoRestante,
        valor_total: valorTotal,
        data: parcela.vencimento,
        inconsistente: false,
        entradas: parcela.tipo === 'receber' ? saldoRestante : 0,
        saidas: parcela.tipo === 'pagar' ? saldoRestante : 0,
        atrasada: parcela.vencimento < hoje,
      })
    }
  }

  return movimentos.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
}
```

Atualizar `CalculoFinanceiroInput` e o corpo de `calcularPainelFinanceiro` (só a montagem do mapa e a chamada de `normalizarMovimentacoes` mudam; o resto do corpo da função — laço de dias, resumo — permanece igual):

```ts
interface CalculoFinanceiroInput {
  ano: number
  mes: number
  hoje: string
  saldoBase: number
  competenciaBase: string
  parcelas: ParcelaFinanceira[]
  pagamentos?: PagamentoParcela[]
}
```

```ts
export function calcularPainelFinanceiro(input: CalculoFinanceiroInput): {
  movimentacoesMes: MovimentacaoFinanceira[]
  dias: DiaFinanceiro[]
  resumo: ResumoFinanceiro
} {
  const mes = String(input.mes).padStart(2, '0')
  const inicioMes = `${input.ano}-${mes}-01`
  const ultimoDia = new Date(input.ano, input.mes, 0).getDate()
  const fimMes = `${input.ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`

  const pagamentosPorParcela = new Map<string, PagamentoParcela[]>()
  for (const item of input.pagamentos ?? []) {
    const lista = pagamentosPorParcela.get(item.parcela_id) ?? []
    lista.push(item)
    pagamentosPorParcela.set(item.parcela_id, lista)
  }

  const movimentacoes = normalizarMovimentacoes(input.parcelas, input.hoje, pagamentosPorParcela)
    .filter(movimento => movimento.data >= input.competenciaBase && movimento.data <= fimMes)
  // ... restante do corpo idêntico ao atual (anteriores, saldoInicial, movimentacoesMes, laço de dias, resumo)
```

Não copie o comentário acima no arquivo real — ele só marca que o restante do corpo (a partir de `const anteriores = ...` até o final da função) **não muda** e deve ser mantido como está hoje.

- [ ] **Step 4: Rodar os testes de novo**

Run: `node --test tests/financeiro.test.mts`
Expected: os testes desta task passam; os que dependem de `calcularStatusPagamento` continuam falhando (esperado até a Task 2).

- [ ] **Step 5: Commit**

```bash
git add lib/financeiro.ts tests/financeiro.test.mts
git commit -m "feat(financeiro): divide movimentos por lancamento de pagamento parcial"
```

---

## Task 2: Motor financeiro — status derivado da soma de pagamentos

**Files:**
- Modify: `lib/financeiro.ts`
- Test: `tests/financeiro.test.mts`

**Interfaces:**
- Consumes: `PagamentoParcela`, `StatusMovimento` (Task 1).
- Produces: `calcularStatusPagamento(valorTotal: number, pagamentos: PagamentoParcela[]): { status: StatusMovimento; dataPagamento: string | null }` — usada por `app/caixa/page.tsx` (Task 8) para sincronizar `btx_parcelas.status` depois de qualquer alteração em `btx_pagamentos_parcela`.

- [ ] **Step 1: Escrever os testes que faltam (já foram escritos na Task 1, aqui só confirmamos)**

Os testes que usam `calcularStatusPagamento` já foram adicionados no Step 1 da Task 1 via o import. Adicionar agora, ao final de `tests/financeiro.test.mts`, os testes específicos da função:

```ts
test('calcularStatusPagamento: sem lançamento fica pendente', () => {
  const resultado = calcularStatusPagamento(1000, [])
  assert.deepEqual(resultado, { status: 'pendente', dataPagamento: null })
})

test('calcularStatusPagamento: soma parcial fica parcial com data do último lançamento', () => {
  const resultado = calcularStatusPagamento(1000, [
    pagamento({ id: 'pg1', valor: 300, data_pagamento: '2026-08-05' }),
    pagamento({ id: 'pg2', valor: 200, data_pagamento: '2026-08-12' }),
  ])
  assert.deepEqual(resultado, { status: 'parcial', dataPagamento: '2026-08-12' })
})

test('calcularStatusPagamento: soma igual ou maior que o total fica pago', () => {
  const resultado = calcularStatusPagamento(1000, [
    pagamento({ id: 'pg1', valor: 600, data_pagamento: '2026-08-05' }),
    pagamento({ id: 'pg2', valor: 400, data_pagamento: '2026-08-20' }),
  ])
  assert.deepEqual(resultado, { status: 'pago', dataPagamento: '2026-08-20' })
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/financeiro.test.mts`
Expected: FAIL em `calcularStatusPagamento is not a function`.

- [ ] **Step 3: Implementar**

Adicionar em `lib/financeiro.ts`, após `obterDataEfetiva`:

```ts
export function calcularStatusPagamento(
  valorTotal: number,
  pagamentos: PagamentoParcela[],
): { status: StatusMovimento; dataPagamento: string | null } {
  if (pagamentos.length === 0) return { status: 'pendente', dataPagamento: null }

  const valorPago = pagamentos.reduce((total, item) => total + Number(item.valor), 0)
  const dataPagamento = pagamentos.reduce(
    (maior, item) => (item.data_pagamento > maior ? item.data_pagamento : maior),
    pagamentos[0].data_pagamento,
  )

  if (valorPago >= valorTotal) return { status: 'pago', dataPagamento }
  return { status: 'parcial', dataPagamento }
}
```

- [ ] **Step 4: Rodar todos os testes do motor financeiro**

Run: `node --test tests/financeiro.test.mts`
Expected: todos os testes passam (os originais + os das Tasks 1 e 2).

- [ ] **Step 5: Commit**

```bash
git add lib/financeiro.ts tests/financeiro.test.mts
git commit -m "feat(financeiro): deriva status da parcela pela soma dos pagamentos"
```

---

## Task 3: Migração SQL — tabela de pagamentos parciais e status `parcial`

**Files:**
- Create: `supabase_migration_pagamento_parcial.sql`
- Modify: `supabase_schema.sql`
- Test: `tests/painel-financeiro-ui.test.cjs` (novo teste no arquivo já existente)

**Interfaces:**
- Produces: tabela `btx_pagamentos_parcela(id, parcela_id, valor, data_pagamento, observacoes, criado_por, created_at)` com RLS somente-admin.
- Produces: `btx_parcelas.status` aceita `'parcial'`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/painel-financeiro-ui.test.cjs`:

```js
test('migração cria pagamentos parciais e libera status parcial', () => {
  const sql = read('supabase_migration_pagamento_parcial.sql')
  assert.match(sql, /CHECK \(status IN \('pendente','pago','parcial','cancelado'\)\)/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela/)
  assert.match(sql, /parcela_id UUID NOT NULL REFERENCES btx_parcelas\(id\) ON DELETE CASCADE/)
  assert.match(sql, /valor NUMERIC\(12,2\) NOT NULL CHECK \(valor > 0\)/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /btx_admin_all_pagto_parc/)
})

test('schema consolidado inclui pagamentos parciais para instalações novas', () => {
  const schema = read('supabase_schema.sql')
  assert.match(schema, /CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela/)
  assert.match(schema, /status TEXT NOT NULL DEFAULT 'pendente' CHECK \(status IN \('pendente','pago','parcial','cancelado'\)\)/)
})
```

(O arquivo já importa `test`, `assert` e `read` no topo — não repetir os requires.)

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: FAIL — `supabase_migration_pagamento_parcial.sql` não existe.

- [ ] **Step 3: Criar a migração**

Criar `supabase_migration_pagamento_parcial.sql`:

```sql
-- Painel financeiro: pagamento parcial com log de lançamentos
ALTER TABLE btx_parcelas DROP CONSTRAINT IF EXISTS btx_parcelas_status_check;
ALTER TABLE btx_parcelas ADD CONSTRAINT btx_parcelas_status_check
  CHECK (status IN ('pendente','pago','parcial','cancelado'));

CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcela_id UUID NOT NULL REFERENCES btx_parcelas(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento DATE NOT NULL,
  observacoes TEXT,
  criado_por UUID REFERENCES btx_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS btx_pagamentos_parcela_parcela_idx ON btx_pagamentos_parcela(parcela_id);
ALTER TABLE btx_pagamentos_parcela ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "btx_admin_all_pagto_parc" ON btx_pagamentos_parcela;
CREATE POLICY "btx_admin_all_pagto_parc" ON btx_pagamentos_parcela FOR ALL USING ((select btx_get_my_role())='admin');
```

Em `supabase_schema.sql`, alterar a linha 264 (constraint de status de `btx_parcelas`):

```sql
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','parcial','cancelado')),
```

E adicionar, logo após o bloco `btx_caixa_mensal` (após a linha com `CREATE POLICY "btx_admin_all_caixa"`), a mesma definição de tabela e policy da migração:

```sql
-- ------------------------------------------------------------
-- btx_pagamentos_parcela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcela_id UUID NOT NULL REFERENCES btx_parcelas(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento DATE NOT NULL,
  observacoes TEXT,
  criado_por UUID REFERENCES btx_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS btx_pagamentos_parcela_parcela_idx ON btx_pagamentos_parcela(parcela_id);
ALTER TABLE btx_pagamentos_parcela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_pagto_parc" ON btx_pagamentos_parcela FOR ALL USING ((select btx_get_my_role())='admin');
```

- [ ] **Step 4: Rodar o teste de novo**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: PASS.

- [ ] **Step 5: Aplicar a migração no Supabase**

Abrir o SQL Editor do projeto Supabase e rodar o conteúdo de `supabase_migration_pagamento_parcial.sql` contra o banco real (mesmo fluxo usado nas migrações anteriores do projeto). Confirmar no painel do Supabase que a tabela `btx_pagamentos_parcela` foi criada e que `btx_parcelas` aceita `status = 'parcial'`.

- [ ] **Step 6: Commit**

```bash
git add supabase_migration_pagamento_parcial.sql supabase_schema.sql tests/painel-financeiro-ui.test.cjs
git commit -m "feat(db): adiciona pagamentos parciais e status parcial em parcelas"
```

---

## Task 4: Tipos da aplicação

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `StatusParcela` inclui `'parcial'`.
- Produces: `export interface PagamentoParcela { id: string; parcela_id: string; valor: number; data_pagamento: string; observacoes: string | null; criado_por: string | null; created_at: string }` (sem `unidade` — a tabela não tem essa coluna; a unidade já é resolvida via `parcela_id`).

- [ ] **Step 1: Atualizar `types/index.ts`**

Trocar a linha 5:

```ts
export type StatusParcela = 'pendente' | 'pago' | 'parcial' | 'cancelado'
```

Adicionar, logo após a interface `Parcela` (depois da linha `numero_boleto...ativo: boolean; created_at: string`):

```ts
export interface PagamentoParcela {
  id: string; parcela_id: string; valor: number; data_pagamento: string
  observacoes: string | null; criado_por: string | null; created_at: string
}
```

Nota: este `PagamentoParcela` (formato de linha do banco, com `id` de UUID de verdade) é diferente do tipo de mesmo nome em `lib/financeiro.ts` (formato mínimo usado só no cálculo). Isso é intencional — o mesmo padrão já existe entre `types/index.ts#Parcela` e `lib/financeiro.ts#ParcelaFinanceira`.

- [ ] **Step 2: Verificar que o projeto ainda compila**

Run: `npx tsc --noEmit`
Expected: sem novos erros relacionados a `types/index.ts` (o projeto pode já ter avisos pré-existentes não relacionados; não introduzir novos).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(tipos): adiciona status parcial e PagamentoParcela"
```

---

## Task 5: Card "Saldo em banco" com ajuste embutido

**Files:**
- Modify: `components/financeiro/ResumoFinanceiro.tsx`
- Modify: `app/caixa/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/painel-financeiro-ui.test.cjs`

**Interfaces:**
- Produces: `ResumoFinanceiro` aceita `isAdmin?: boolean` e `onAjustarSaldo?: () => void`.
- Consumes: `abrirSaldoBase` já existe em `app/caixa/page.tsx` (linha 128) — só muda de onde é disparado.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/painel-financeiro-ui.test.cjs`:

```js
test('card de saldo em banco tem rótulo e ação de ajuste', () => {
  const resumo = read('components/financeiro/ResumoFinanceiro.tsx')
  assert.match(resumo, /Saldo em banco/)
  assert.match(resumo, /onAjustarSaldo/)
  assert.doesNotMatch(resumo, /Saldo inicial/)
})

test('botão de ajuste de saldo-base não fica mais solto no cabeçalho', () => {
  const pagina = read('app/caixa/page.tsx')
  assert.match(pagina, /onAjustarSaldo=\{abrirSaldoBase\}/)
})
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: FAIL — texto "Saldo em banco" ainda não existe.

- [ ] **Step 3: Atualizar `ResumoFinanceiro.tsx`**

Substituir o arquivo inteiro:

```tsx
import { formatMoeda } from '@/lib/utils'
import type { ResumoFinanceiro as Resumo } from '@/lib/financeiro'

interface Props {
  resumo: Resumo
  isAdmin?: boolean
  onAjustarSaldo?: () => void
}

const ITENS = [
  { key: 'saldoInicial', label: 'Saldo em banco', tone: '' },
  { key: 'totalSaidas', label: 'Saídas do mês', tone: 'out' },
  { key: 'totalEntradas', label: 'Entradas do mês', tone: 'in' },
  { key: 'saldoFinal', label: 'Saldo final projetado', tone: 'final' },
] as const

export default function ResumoFinanceiro({ resumo, isAdmin, onAjustarSaldo }: Props) {
  return (
    <section className="finance-summary" aria-label="Resumo financeiro do mês">
      {ITENS.map(item => {
        const valor = resumo[item.key]
        const negativo = valor < 0
        const tone = item.tone === 'final' && negativo ? 'final negative' : item.tone
        const ehSaldoBanco = item.key === 'saldoInicial'

        return (
          <div key={item.key} className={`finance-stat ${tone}`.trim()}>
            <div className="finance-stat-topline">
              <span className="finance-stat-label">{item.label}</span>
              {ehSaldoBanco && isAdmin && onAjustarSaldo && (
                <button className="finance-stat-adjust" onClick={onAjustarSaldo} aria-label="Ajustar saldo em banco">
                  Ajustar
                </button>
              )}
            </div>
            <strong className="finance-stat-value">{formatMoeda(valor)}</strong>
          </div>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 4: Adicionar CSS do botão embutido no card**

Em `app/globals.css`, logo após a regra `.finance-stat-label { ... }` (linha 298), adicionar:

```css
.finance-stat-topline {
  display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;
}
.finance-stat-topline .finance-stat-label { margin-bottom: 0; }
.finance-stat-adjust {
  flex-shrink: 0; padding: 2px 7px; border: 1px solid var(--border); border-radius: 5px;
  background: var(--surface); color: var(--text-mid); font-size: 8px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer;
}
.finance-stat-adjust:hover { border-color: var(--purple); color: var(--navy); }
.finance-stat.final .finance-stat-adjust { border-color: rgba(255,255,255,0.3); background: transparent; color: rgba(255,255,255,0.75); }
```

- [ ] **Step 5: Atualizar `app/caixa/page.tsx`**

Remover o botão do cabeçalho (dentro de `finance-page-header`):

```tsx
{isAdmin && unidade && <button className="btn btn-secondary" onClick={abrirSaldoBase}>Ajustar saldo-base</button>}
```

Trocar a chamada de `<ResumoFinanceiro resumo={painel.resumo} />` por:

```tsx
<ResumoFinanceiro resumo={painel.resumo} isAdmin={isAdmin} onAjustarSaldo={abrirSaldoBase} />
```

- [ ] **Step 6: Rodar os testes de novo**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: PASS.

- [ ] **Step 7: Verificação manual**

Run: `npm run dev`, abrir `/caixa` como admin. Confirmar que o primeiro card se chama "Saldo em banco", tem um botão "Ajustar" dentro dele, e que o cabeçalho da página não tem mais o botão solto. Clicar em "Ajustar" deve abrir o mesmo modal de sempre.

- [ ] **Step 8: Commit**

```bash
git add components/financeiro/ResumoFinanceiro.tsx app/caixa/page.tsx app/globals.css tests/painel-financeiro-ui.test.cjs
git commit -m "feat(financeiro): destaca saldo em banco com ajuste embutido no card"
```

---

## Task 6: Modal de registro de pagamento

**Files:**
- Create: `components/financeiro/PagamentoModal.tsx`
- Test: `tests/painel-financeiro-ui.test.cjs`

**Interfaces:**
- Consumes: `Modal` (`components/Modal.tsx`).
- Produces: `PagamentoModal` com props `{ open: boolean; onClose: () => void; onSalvar: (dados: { valor: number; data: string; observacoes: string }) => void; saldoRestante: number; saving?: boolean; valorInicial?: { valor: number; data: string; observacoes: string } }`. Usado tanto para registrar um novo pagamento quanto para editar um lançamento existente (quando `valorInicial` é passado).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/painel-financeiro-ui.test.cjs`:

```js
test('modal de pagamento existe e valida contra o saldo restante', () => {
  const modal = read('components/financeiro/PagamentoModal.tsx')
  assert.match(modal, /saldoRestante/)
  assert.match(modal, /onSalvar/)
  assert.match(modal, /valor <= 0 \|\| valor > saldoRestante/)
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: FAIL — arquivo não existe.

- [ ] **Step 3: Criar `components/financeiro/PagamentoModal.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import { formatMoeda, hoje } from '@/lib/utils'

interface DadosPagamento {
  valor: number
  data: string
  observacoes: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSalvar: (dados: DadosPagamento) => void
  saldoRestante: number
  saving?: boolean
  valorInicial?: DadosPagamento
}

const VAZIO: DadosPagamento = { valor: 0, data: '', observacoes: '' }

export default function PagamentoModal({ open, onClose, onSalvar, saldoRestante, saving, valorInicial }: Props) {
  const [form, setForm] = useState<DadosPagamento>(VAZIO)

  useEffect(() => {
    if (!open) return
    setForm(valorInicial ?? { valor: saldoRestante, data: hoje(), observacoes: '' })
  }, [open, valorInicial, saldoRestante])

  const valor = Number(form.valor)
  const invalido = !form.data || valor <= 0 || valor > saldoRestante

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={valorInicial ? 'Editar pagamento' : 'Registrar pagamento'}
      size="sm"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={invalido || saving} onClick={() => onSalvar(form)}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </>}
    >
      <div className="alert alert-amber">Saldo restante desta parcela: {formatMoeda(saldoRestante)}</div>
      <div className="form-group">
        <label className="form-label">Valor pago (R$)</label>
        <input className="form-input mono" type="number" step="0.01" value={form.valor}
          onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))} />
      </div>
      <div className="form-group">
        <label className="form-label">Data do pagamento</label>
        <input className="form-input" type="date" value={form.data}
          onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
      </div>
      <div className="form-group">
        <label className="form-label">Observações</label>
        <textarea className="form-input" rows={2} value={form.observacoes}
          onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Rodar o teste de novo**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/financeiro/PagamentoModal.tsx tests/painel-financeiro-ui.test.cjs
git commit -m "feat(financeiro): cria modal de registro/edicao de pagamento parcial"
```

---

## Task 7: `ListaMovimentacoes` — agrupamento, badge parcial e log expansível

**Files:**
- Modify: `components/financeiro/ListaMovimentacoes.tsx`
- Modify: `app/globals.css`
- Test: `tests/painel-financeiro-ui.test.cjs`

**Interfaces:**
- Consumes: `MovimentacaoFinanceira` (Task 1), `PagamentoModal` (Task 6).
- Produces: `ListaMovimentacoes` aceita novas props `isAdmin?: boolean`, `onRegistrarPagamento?: (parcelaId: string, saldoRestante: number) => void`, `onEditarPagamento?: (movimento: MovimentacaoFinanceira) => void`, `onExcluirPagamento?: (movimento: MovimentacaoFinanceira) => void`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/painel-financeiro-ui.test.cjs`:

```js
test('lista de movimentações agrupa por parcela e permite registrar pagamento', () => {
  const lista = read('components/financeiro/ListaMovimentacoes.tsx')
  assert.match(lista, /agruparPorParcela/)
  assert.match(lista, /badge-purple/)
  assert.match(lista, /Registrar pagamento/)
  assert.match(lista, /onEditarPagamento/)
  assert.match(lista, /onExcluirPagamento/)
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: FAIL — `agruparPorParcela` não existe.

- [ ] **Step 3: Reescrever `components/financeiro/ListaMovimentacoes.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { formatData, formatMoeda } from '@/lib/utils'
import type { MovimentacaoFinanceira, StatusMovimento } from '@/lib/financeiro'

interface Props {
  tipo: 'pagar' | 'receber'
  movimentacoes: MovimentacaoFinanceira[]
  diaSelecionado: string | null
  mobileActive?: boolean
  isAdmin?: boolean
  onRegistrarPagamento?: (parcelaId: string, saldoRestante: number) => void
  onEditarPagamento?: (movimento: MovimentacaoFinanceira) => void
  onExcluirPagamento?: (movimento: MovimentacaoFinanceira) => void
}

interface GrupoMovimentacao {
  parcelaId: string
  representante: MovimentacaoFinanceira
  data: string
  valorTotal: number
  valorPago: number
  saldoRestante: number
  status: StatusMovimento
  atrasada: boolean
  inconsistente: boolean
  pagamentos: MovimentacaoFinanceira[]
}

const ROTULOS_ORIGEM: Record<string, string> = {
  compra: 'Compra',
  venda: 'Venda',
  despesa: 'Despesa',
  manual: 'Manual',
}

function agruparPorParcela(movimentos: MovimentacaoFinanceira[]): GrupoMovimentacao[] {
  const grupos = new Map<string, GrupoMovimentacao>()

  for (const movimento of movimentos) {
    const ehPagamento = movimento.id !== movimento.parcela_id
    const existente = grupos.get(movimento.parcela_id)

    if (!existente) {
      grupos.set(movimento.parcela_id, {
        parcelaId: movimento.parcela_id,
        representante: movimento,
        data: movimento.data,
        valorTotal: movimento.valor_total,
        valorPago: ehPagamento ? movimento.valor : 0,
        saldoRestante: ehPagamento ? 0 : movimento.valor,
        status: movimento.status,
        atrasada: movimento.atrasada,
        inconsistente: movimento.inconsistente,
        pagamentos: ehPagamento ? [movimento] : [],
      })
      continue
    }

    if (ehPagamento) {
      existente.valorPago += movimento.valor
      existente.pagamentos.push(movimento)
    } else {
      existente.saldoRestante = movimento.valor
      existente.status = movimento.status
      existente.atrasada = movimento.atrasada
      existente.inconsistente = movimento.inconsistente
      existente.data = movimento.data
    }
  }

  for (const grupo of grupos.values()) {
    if (grupo.pagamentos.length > 0 && grupo.saldoRestante === 0) grupo.status = 'pago'
    grupo.pagamentos.sort((a, b) => a.data.localeCompare(b.data))
  }

  return [...grupos.values()].sort((a, b) => a.data.localeCompare(b.data) || a.parcelaId.localeCompare(b.parcelaId))
}

export default function ListaMovimentacoes({
  tipo,
  movimentacoes,
  diaSelecionado,
  mobileActive = false,
  isAdmin = false,
  onRegistrarPagamento,
  onEditarPagamento,
  onExcluirPagamento,
}: Props) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const filtradas = movimentacoes.filter(movimento => (
    movimento.tipo === tipo && (!diaSelecionado || movimento.data === diaSelecionado)
  ))
  const grupos = agruparPorParcela(filtradas)
  const pagar = tipo === 'pagar'
  const titulo = pagar ? 'Contas a pagar' : 'Contas a receber'
  const valorPrefixo = pagar ? '−' : '+'

  return (
    <section
      className={`finance-panel finance-list-panel ${pagar ? 'payable' : 'receivable'}${mobileActive ? ' mobile-active' : ''}`}
      aria-label={titulo}
    >
      <header className="finance-panel-header">
        <h2>{titulo}</h2>
        <span>{grupos.length} {grupos.length === 1 ? 'lançamento' : 'lançamentos'}</span>
      </header>

      <div className="finance-movement-list">
        {grupos.length === 0 ? (
          <div className="finance-list-empty">
            {diaSelecionado ? 'Nenhuma movimentação neste dia.' : `Nenhuma conta a ${pagar ? 'pagar' : 'receber'} neste mês.`}
          </div>
        ) : grupos.map(grupo => {
          const movimento = grupo.representante
          const badge = grupo.inconsistente
            ? { text: 'Data inconsistente', className: 'badge-red' }
            : grupo.atrasada
              ? { text: 'Atrasada', className: 'badge-red' }
              : grupo.status === 'pago'
                ? { text: pagar ? 'Pago' : 'Recebido', className: 'badge-green' }
                : grupo.status === 'parcial'
                  ? { text: 'Parcial', className: 'badge-purple' }
                  : { text: 'Pendente', className: 'badge-amber' }
          const temLog = grupo.pagamentos.length > 0
          const estaExpandido = expandido === grupo.parcelaId

          return (
            <article key={grupo.parcelaId} className="finance-movement">
              <div className="finance-movement-topline">
                <strong title={movimento.descricao}>{movimento.descricao || `Parcela ${movimento.numero_parcela}`}</strong>
                <span className={`badge ${badge.className}`}>{badge.text}</span>
              </div>
              <div className="finance-movement-meta">
                <span>{formatData(grupo.data)} · {ROTULOS_ORIGEM[movimento.origem] ?? movimento.origem}</span>
                <strong>{valorPrefixo} {formatMoeda(grupo.saldoRestante || grupo.valorTotal)}</strong>
              </div>
              {(movimento.numero_boleto || movimento.observacoes) && (
                <div className="finance-movement-detail">
                  {movimento.numero_boleto ? `Doc. ${movimento.numero_boleto}` : movimento.observacoes}
                </div>
              )}
              {grupo.status === 'parcial' && (
                <div className="finance-movement-progress">
                  {formatMoeda(grupo.valorPago)} de {formatMoeda(grupo.valorTotal)} pago
                </div>
              )}
              <div className="finance-movement-actions">
                {isAdmin && grupo.status !== 'pago' && onRegistrarPagamento && (
                  <button className="btn btn-secondary btn-sm" onClick={() => onRegistrarPagamento(grupo.parcelaId, grupo.saldoRestante || grupo.valorTotal)}>
                    Registrar pagamento
                  </button>
                )}
                {temLog && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setExpandido(estaExpandido ? null : grupo.parcelaId)}>
                    {estaExpandido ? 'Ocultar histórico' : `Histórico (${grupo.pagamentos.length})`}
                  </button>
                )}
              </div>
              {temLog && estaExpandido && (
                <ul className="finance-payment-log">
                  {grupo.pagamentos.map(pagamento => (
                    <li key={pagamento.id}>
                      <span>{formatData(pagamento.data)} · {formatMoeda(pagamento.valor)}</span>
                      {isAdmin && (
                        <span className="finance-payment-log-actions">
                          {onEditarPagamento && <button className="btn btn-secondary btn-sm" onClick={() => onEditarPagamento(pagamento)}>Editar</button>}
                          {onExcluirPagamento && <button className="btn btn-danger btn-sm" onClick={() => onExcluirPagamento(pagamento)}>Excluir</button>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Adicionar CSS do log e das ações**

Em `app/globals.css`, logo após a regra `.finance-movement-detail { ... }` (linha 357), adicionar:

```css
.finance-movement-progress {
  margin-top: 6px; color: var(--purple); font-family: var(--mono); font-size: 9px;
}
.finance-movement-actions {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
}
.finance-movement-actions .btn { padding: 3px 8px; font-size: 9px; }
.finance-payment-log {
  margin: 8px 0 0; padding: 8px; border-top: 1px dashed var(--border);
  list-style: none; display: flex; flex-direction: column; gap: 6px;
}
.finance-payment-log li {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 9px; color: var(--text-mid);
}
.finance-payment-log-actions { display: flex; gap: 4px; }
.finance-payment-log-actions .btn { padding: 2px 6px; font-size: 8px; }
```

- [ ] **Step 5: Rodar o teste de novo**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/financeiro/ListaMovimentacoes.tsx app/globals.css tests/painel-financeiro-ui.test.cjs
git commit -m "feat(financeiro): agrupa movimentacoes por parcela com log de pagamentos"
```

---

## Task 8: `app/caixa/page.tsx` — carregar, registrar, editar e excluir pagamentos

**Files:**
- Modify: `app/caixa/page.tsx`
- Test: `tests/painel-financeiro-ui.test.cjs`

**Interfaces:**
- Consumes: `calcularStatusPagamento` (Task 2), `PagamentoModal` (Task 6), `ListaMovimentacoes` com as novas props (Task 7), `types/index.ts#PagamentoParcela` (Task 4).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `tests/painel-financeiro-ui.test.cjs`:

```js
test('rota caixa carrega e sincroniza pagamentos parciais', () => {
  const pagina = read('app/caixa/page.tsx')
  assert.match(pagina, /btx_pagamentos_parcela/)
  assert.match(pagina, /calcularStatusPagamento/)
  assert.match(pagina, /PagamentoModal/)
  assert.match(pagina, /sincronizarStatusParcela/)
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: FAIL.

- [ ] **Step 3: Atualizar os imports de `app/caixa/page.tsx`**

Trocar:

```tsx
import { calcularPainelFinanceiro, type ParcelaFinanceira } from '@/lib/financeiro'
```

por:

```tsx
import { calcularPainelFinanceiro, calcularStatusPagamento, type ParcelaFinanceira, type PagamentoParcela as PagamentoCalculo, type MovimentacaoFinanceira } from '@/lib/financeiro'
import PagamentoModal from '@/components/financeiro/PagamentoModal'
```

- [ ] **Step 4: Adicionar estado de pagamentos e do modal**

Dentro do componente `CaixaPage`, junto aos demais `useState` já existentes (depois de `const [saving, setSaving] = useState(false)`):

```tsx
  const [pagamentoModal, setPagamentoModal] = useState<{ parcelaId: string; saldoRestante: number; edicao?: { id: string; valor: number; data: string; observacoes: string } } | null>(null)
  const [pagamentoSaving, setPagamentoSaving] = useState(false)
```

- [ ] **Step 5: Carregar pagamentos junto com as parcelas**

Dentro de `loadData`, logo após a linha `const parcelas = (parcelasResult.data ?? []) as Parcela[]`, adicionar a busca dos pagamentos e passar para `calcularPainelFinanceiro`:

```tsx
    const parcelaIds = parcelas.map(item => item.id)
    const pagamentosResult = parcelaIds.length
      ? await sb.from('btx_pagamentos_parcela').select('*').in('parcela_id', parcelaIds)
      : { data: [] as PagamentoCalculo[] }
    const pagamentos: PagamentoCalculo[] = (pagamentosResult.data ?? []).map((item: { id: string; parcela_id: string; valor: number; data_pagamento: string }) => ({
      id: item.id, parcela_id: item.parcela_id, valor: Number(item.valor), data_pagamento: item.data_pagamento,
    }))
```

E trocar a chamada de `calcularPainelFinanceiro` para incluir `pagamentos`:

```tsx
    const calculado = calcularPainelFinanceiro({
      ano, mes, hoje: hoje(), saldoBase: Number(base?.saldo_inicial ?? 0), competenciaBase, parcelas: parcelasEnriquecidas, pagamentos,
    })
```

- [ ] **Step 6: Adicionar as funções de CRUD de pagamento**

Adicionar, depois da função `salvarSaldoBase`:

```tsx
  async function sincronizarStatusParcela(parcelaId: string, valorTotal: number) {
    const { data } = await sb.from('btx_pagamentos_parcela').select('*').eq('parcela_id', parcelaId)
    const pagamentos: PagamentoCalculo[] = (data ?? []).map((item: { id: string; parcela_id: string; valor: number; data_pagamento: string }) => ({
      id: item.id, parcela_id: item.parcela_id, valor: Number(item.valor), data_pagamento: item.data_pagamento,
    }))
    const { status, dataPagamento } = calcularStatusPagamento(valorTotal, pagamentos)
    await sb.from('btx_parcelas').update({ status, data_pagamento: dataPagamento }).eq('id', parcelaId)
  }

  function abrirRegistrarPagamento(parcelaId: string, saldoRestante: number) {
    setPagamentoModal({ parcelaId, saldoRestante })
  }

  function abrirEditarPagamento(movimento: MovimentacaoFinanceira) {
    setPagamentoModal({
      parcelaId: movimento.parcela_id,
      saldoRestante: movimento.valor_total,
      edicao: { id: movimento.id, valor: movimento.valor, data: movimento.data, observacoes: movimento.observacoes ?? '' },
    })
  }

  async function salvarPagamento(dados: { valor: number; data: string; observacoes: string }) {
    if (!pagamentoModal) return
    setPagamentoSaving(true)
    const parcela = painel?.movimentacoesMes.find(item => item.parcela_id === pagamentoModal.parcelaId)
    const valorTotal = parcela?.valor_total ?? pagamentoModal.saldoRestante
    const { error: saveError } = pagamentoModal.edicao
      ? await sb.from('btx_pagamentos_parcela').update({
          valor: dados.valor, data_pagamento: dados.data, observacoes: dados.observacoes || null,
        }).eq('id', pagamentoModal.edicao.id)
      : await sb.from('btx_pagamentos_parcela').insert({
          parcela_id: pagamentoModal.parcelaId, valor: dados.valor, data_pagamento: dados.data, observacoes: dados.observacoes || null,
        })
    if (saveError) {
      setPagamentoSaving(false)
      setError('Não foi possível registrar o pagamento.')
      return
    }
    await sincronizarStatusParcela(pagamentoModal.parcelaId, valorTotal)
    setPagamentoSaving(false)
    setPagamentoModal(null)
    loadData()
  }

  async function excluirPagamento(movimento: MovimentacaoFinanceira) {
    setSaving(true)
    await sb.from('btx_pagamentos_parcela').delete().eq('id', movimento.id)
    await sincronizarStatusParcela(movimento.parcela_id, movimento.valor_total)
    setSaving(false)
    loadData()
  }
```

- [ ] **Step 7: Ligar `ListaMovimentacoes` e adicionar o `PagamentoModal` no JSX**

Trocar as duas chamadas de `<ListaMovimentacoes .../>`:

```tsx
            <ListaMovimentacoes
              tipo="pagar"
              movimentacoes={painel.movimentacoesMes}
              diaSelecionado={diaSelecionado}
              mobileActive={mobileTab === 'pagar'}
              isAdmin={isAdmin}
              onRegistrarPagamento={abrirRegistrarPagamento}
              onEditarPagamento={abrirEditarPagamento}
              onExcluirPagamento={excluirPagamento}
            />
            <CalendarioFinanceiro ano={ano} mes={mes} dias={painel.dias} hoje={hoje()} diaSelecionado={diaSelecionado} onSelectDia={setDiaSelecionado} />
            <ListaMovimentacoes
              tipo="receber"
              movimentacoes={painel.movimentacoesMes}
              diaSelecionado={diaSelecionado}
              mobileActive={mobileTab === 'receber'}
              isAdmin={isAdmin}
              onRegistrarPagamento={abrirRegistrarPagamento}
              onEditarPagamento={abrirEditarPagamento}
              onExcluirPagamento={excluirPagamento}
            />
```

E adicionar, depois do `<Modal open={saldoModal} ...>` já existente, antes do fechamento de `</div>` final do componente:

```tsx
      <PagamentoModal
        open={!!pagamentoModal}
        onClose={() => setPagamentoModal(null)}
        onSalvar={salvarPagamento}
        saldoRestante={pagamentoModal?.saldoRestante ?? 0}
        saving={pagamentoSaving}
        valorInicial={pagamentoModal?.edicao ? { valor: pagamentoModal.edicao.valor, data: pagamentoModal.edicao.data, observacoes: pagamentoModal.edicao.observacoes } : undefined}
      />
```

- [ ] **Step 8: Rodar o teste de novo**

Run: `node --test tests/painel-financeiro-ui.test.cjs`
Expected: PASS.

- [ ] **Step 9: Rodar a suíte completa de testes de lógica e smoke**

Run: `node --test tests/financeiro.test.mts tests/painel-financeiro-ui.test.cjs`
Expected: todos passam.

- [ ] **Step 10: Verificação manual**

Run: `npm run dev`, abrir `/caixa` como admin, selecionar uma unidade com contas a pagar/receber pendentes.
- Clicar em "Registrar pagamento" numa conta, lançar um valor menor que o total, salvar. Confirmar que o card mostra badge "Parcial", a barra "R$ X de R$ Y pago", e que o dia do lançamento no calendário reflete o valor pago.
- Registrar outro pagamento até completar o valor total. Confirmar que o badge vira "Pago"/"Recebido" e some o botão "Registrar pagamento".
- Abrir o histórico, editar um lançamento (mudar valor ou data) e confirmar que os totais recalculam. Excluir um lançamento e confirmar que o status volta para "Parcial" ou "Pendente" conforme o caso.
- Repetir em mobile (abas "A pagar"/"A receber").
- Conferir que como usuário não-admin (ou verificando o código com `isAdmin=false`) os botões de registrar/editar/excluir não aparecem.

- [ ] **Step 11: Commit**

```bash
git add app/caixa/page.tsx tests/painel-financeiro-ui.test.cjs
git commit -m "feat(financeiro): integra registro, edicao e exclusao de pagamentos parciais no painel"
```

---

## Task 9: Regressão final

**Files:** nenhum arquivo novo — apenas verificação.

- [ ] **Step 1: Rodar toda a suíte de testes do projeto**

Run: `node --test tests/financeiro.test.mts tests/painel-financeiro-ui.test.cjs tests/estoque.test.mts tests/estoque-ui.test.cjs`
Expected: todos passam, sem regressão nas telas de estoque.

- [ ] **Step 2: Rodar o build de produção**

Run: `npm run build`
Expected: build conclui sem erros de tipo ou de lint relacionados às mudanças.

- [ ] **Step 3: Commit (se o build tiver corrigido algo)**

Se o Step 2 exigir algum ajuste de tipos, corrigir, rodar `npm run build` de novo até passar, e então:

```bash
git add -A
git commit -m "fix(financeiro): ajustes finais de build para pagamento parcial"
```

Se nada precisar de ajuste, não há o que commitar — pular este passo.
