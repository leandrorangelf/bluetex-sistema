# Entrega 2 + Limpeza — pagamento parcial, menu enxuto, telas deletadas

**Goal:** Menu de 8 itens. Contas a Pagar/Receber com baixa **parcial** + histórico. Estoque com abas (Saldo/Entradas/Saídas). Deletar `/caixa`, `/relatorios`, `/compras`, `/vendas`, `/despesas`.

**Menu final (`components/Sidebar.tsx` `NAV`):**
```ts
const NAV = [
  { href: '/dashboard', label: 'Painel' },
  { href: '/lancar', label: 'Lançar' },
  { href: '/parcelas-pagar', label: 'Contas a Pagar' },
  { href: '/parcelas-receber', label: 'Contas a Receber' },
  { href: '/estoque-atual', label: 'Estoque' },
  { section: 'Cadastros' },
  { href: '/produtos', label: 'Produtos' },
  { href: '/clientes', label: 'Clientes' },
  { href: '/fornecedores', label: 'Fornecedores' },
  { href: '/categorias', label: 'Categorias' },
]
```
`/estoque-inicial` e `/unidades` continuam como rota, fora do menu (Estoque linka pro primeiro; Unidades acessa por URL). Guard de `diretoria` em `/lancar` mantém.

## Constraints
- `'use client'`, `dynamic='force-dynamic'`. Só design system. Sem dep nova.
- `btx_pagamentos_parcela`: `{ parcela_id, valor (>0), data_pagamento, observacoes, criado_por? }`.
- `calcularStatusPagamento(valorTotal, pagamentos[])` (`@/lib/financeiro`) → `{ status, dataPagamento }`. Reusar.
- `PagamentoModal` (`@/components/financeiro/PagamentoModal`) — **manter** (passa a ser usado aqui). Props: `{ open, onClose, onSalvar(dados), saldoRestante, saving, valorInicial? }`, `dados = { valor, data, observacoes }`.

---

### Task 1: `lib/pagamentos.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularStatusPagamento, type PagamentoParcela } from '@/lib/financeiro'

export interface PagamentoRow { id: string; parcela_id: string; valor: number; data_pagamento: string; observacoes: string | null }

export function saldoRestante(valorParcela: number, pagamentos: { valor: number }[]): number {
  return Number(valorParcela) - pagamentos.reduce((s, p) => s + Number(p.valor), 0)
}

export async function listarPagamentos(sb: SupabaseClient, parcelaIds: string[]): Promise<PagamentoRow[]> {
  if (!parcelaIds.length) return []
  const { data } = await sb.from('btx_pagamentos_parcela').select('id,parcela_id,valor,data_pagamento,observacoes').in('parcela_id', parcelaIds).order('data_pagamento')
  return (data ?? []).map((p: PagamentoRow) => ({ ...p, valor: Number(p.valor) }))
}

// registra 1 pagamento e re-sincroniza o status da parcela
export async function registrarPagamento(
  sb: SupabaseClient,
  parcela: { id: string; valor: number },
  dados: { valor: number; data: string; observacoes: string },
): Promise<{ error: string | null }> {
  const ins = await sb.from('btx_pagamentos_parcela').insert({
    parcela_id: parcela.id, valor: dados.valor, data_pagamento: dados.data, observacoes: dados.observacoes || null,
  })
  if (ins.error) return { error: 'Não foi possível registrar o pagamento.' }
  const todos = await listarPagamentos(sb, [parcela.id])
  const { status, dataPagamento } = calcularStatusPagamento(
    Number(parcela.valor),
    todos.map(p => ({ parcela_id: p.parcela_id, valor: p.valor, data_pagamento: p.data_pagamento, id: p.id })) as PagamentoParcela[],
  )
  const upd = await sb.from('btx_parcelas').update({ status, data_pagamento: dataPagamento }).eq('id', parcela.id)
  return { error: upd.error ? 'Pagamento salvo mas o status não atualizou.' : null }
}

export async function excluirPagamento(sb: SupabaseClient, pagamentoId: string, parcela: { id: string; valor: number }): Promise<{ error: string | null }> {
  const del = await sb.from('btx_pagamentos_parcela').delete().eq('id', pagamentoId)
  if (del.error) return { error: 'Não foi possível excluir o pagamento.' }
  const todos = await listarPagamentos(sb, [parcela.id])
  const { status, dataPagamento } = calcularStatusPagamento(Number(parcela.valor), todos as unknown as PagamentoParcela[])
  await sb.from('btx_parcelas').update({ status, data_pagamento: dataPagamento }).eq('id', parcela.id)
  return { error: null }
}
```

- [ ] Teste `tests/pagamentos.test.mts`: `saldoRestante(1000, [{valor:300},{valor:200}]) === 500`; `saldoRestante(1000, []) === 1000`.
- [ ] `node --test ... tests/pagamentos.test.mts` PASS.
- [ ] commit `feat(financeiro): helper de pagamentos (parcial + status)`

---

### Task 2: Contas a Pagar (`app/parcelas-pagar/page.tsx`) — reescrever

Manter a estrutura de tabela + filtros; trocar o fluxo de baixa.

- Título `Contas a Pagar`, subtítulo `contas a pagar — {n} · {total}`.
- `load()`: `btx_parcelas` `tipo='pagar'`, `ativo`, filtro por `unidadeAtiva`, filtro de status (`pendente|parcial` juntos em "Em aberto", `pago`, `cancelado`, `todos`). Depois:
  - `listarPagamentos(sb, ids)` → `Map<parcela_id, PagamentoRow[]>`.
  - resolver **origem**: coletar `origem_id` por origem; `btx_compras`→`fornecedor:btx_fornecedores(nome)` ; `btx_despesas`→`descricao, categoria:btx_categorias_despesas(nome)`. Montar `Map<parcela_id, string>` com: compra→nome fornecedor; despesa→`descricao` (+ ` · ` + categoria se houver); manual→`observacoes ?? '—'`.
- Filtro extra de **origem** (botões: Todas · Compra · Despesa · Manual) — client-side sobre `rows`.
- Colunas: Vencimento · Origem (o texto resolvido) · Valor · Pago · Saldo · Status · Ações.
  - `pago = Σ pagamentos`; `saldo = saldoRestante(valor, pagamentos)`.
  - Status badge: `pago`→verde, `parcial`→amber "Parcial", `pendente`+vencida→vermelho "Vencida", `pendente`→amber "Pendente", `cancelado`→cinza.
- Ações por linha (`!isDiretoria`):
  - **Pagar** (se status ≠ pago/cancelado) → abre `<PagamentoModal saldoRestante={saldo} onSalvar={dados => registrarPagamento(sb, {id,valor}, dados).then(...)}/>`.
  - **Ver** → abre um `<Modal>` simples com: dados da parcela + **histórico** (lista de pagamentos: data · valor · obs, cada um com "excluir" que chama `excluirPagamento`) + campos editar `vencimento`/`valor` (update direto) + botão **Cancelar conta** (`status:'cancelado'`).
  - **Excluir** (soft: `ativo:false` na parcela — mantém).
- Remover o `marcarPago` antigo de update direto; agora tudo passa por `registrarPagamento` (pagar total = registrar 1 pagamento no valor do saldo).
- commit `feat(contas-pagar): baixa parcial, historico de pagamentos, origem resolvida`

---

### Task 3: Contas a Receber (`app/parcelas-receber/page.tsx`) — reescrever

Mesma lógica da Task 2, `tipo='receber'`, textos "receber/recebido".
- Coluna **Cliente**: `origem='venda'` → resolver `btx_vendas.cliente(nome)`; `origem='manual'` → `observacoes ?? '—'`.
- Ordenar por cliente e depois vencimento; mostrar "dias em atraso" quando vencida e em aberto.
- Baixa parcial via `PagamentoModal` + `registrarPagamento` (mesmo helper — `btx_pagamentos_parcela` serve os dois tipos).
- Filtros: Em aberto · Recebidas · Todas.
- commit `feat(contas-receber): baixa parcial por cliente`

---

### Task 4: Estoque com abas (`app/estoque-atual/page.tsx`)

- Adicionar `<div className="tabs">` no topo: **Saldo · Entradas · Saídas**.
- `Saldo` = todo o conteúdo atual da página (mover pra dentro do `{aba==='saldo' && (...)}`).
- `Entradas` = a tabela de `app/compras/page.tsx` (a versão lista da entrega 1: data, NF, fornecedor, produtos, ST, total, excluir). Copiar o `load`/`remove`/JSX pra dentro de um subcomponente `AbaEntradas` no mesmo arquivo (ou `components/estoque/ListaEntradas.tsx`).
- `Saídas` = idem de `app/vendas/page.tsx` (cliente no lugar de fornecedor, sem ST).
- No cabeçalho da aba Saldo, um link/botão **"Estoque inicial →"** para `/estoque-inicial`.
- commit `feat(estoque): abas Saldo/Entradas/Saidas; entrada por Lancar`

---

### Task 5: deletar + menu

```bash
git rm -r app/compras app/vendas app/despesas app/caixa app/relatorios
git rm components/financeiro/CalendarioFinanceiro.tsx components/financeiro/ListaMovimentacoes.tsx components/financeiro/ResumoFinanceiro.tsx
```
- **Manter** `components/financeiro/PagamentoModal.tsx` (usado nas Tasks 2/3) e `components/ParcelasEditor.tsx` (usado por FormMovimento/FormDespesa).
- `components/Sidebar.tsx`: `NAV` = o array de 8 itens do topo deste plano.
- `npx tsc --noEmit`: resolver qualquer import órfão. `lib/financeiro.ts` fica intacto (`calcularPainelFinanceiro` sem uso mas com teste — deixar).
- commit `chore: remove /caixa, /relatorios, /compras, /vendas, /despesas; menu de 8 itens`

---

### Task 6: verificação + merge

- `npx tsc --noEmit` limpo.
- `node --test --experimental-strip-types tests/*.test.mts` — tudo verde.
- `npm run dev`: `/dashboard`, `/lancar`, `/parcelas-pagar` (pagar parcial → status "Parcial", saldo cai; histórico aparece; segundo pagamento fecha → "Pago"), `/parcelas-receber`, `/estoque-atual` (3 abas). `/caixa` e `/relatorios` → 404. Menu com 8 itens. Console limpo.
- Branch `feat/entrega2-limpeza` de `main`; merge `--no-ff` + push ao fim.

## Self-review
- Menu 8 itens → Task 5 ✓
- Baixa parcial + histórico (pagar e receber) → Tasks 1-3 ✓
- Despesas viram filtro em Contas a Pagar → Task 2 (filtro origem) ✓
- Entradas/Saídas viram abas em Estoque → Task 4 ✓
- Deletar /caixa /relatorios /compras /vendas /despesas → Task 5 ✓
- Pagamento parcial (que vivia no /caixa) preservado via `lib/pagamentos.ts` + `PagamentoModal` → Task 1 ✓
- `PagamentoModal`/`ParcelasEditor` não deletados (ainda usados) ✓
- Type consistency: `registrarPagamento(sb, {id,valor}, {valor,data,observacoes})`; `saldoRestante(valor, pagamentos[])`; `PagamentoModal.onSalvar(dados)` conforme componente existente.
