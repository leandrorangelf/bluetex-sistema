# Entrega 1 — `/lancar` vira o hub de lançamento

> Execução: 1 subagente implementa a entrega inteira (é coesa e mecânica), depois review + merge.

**Goal:** Toda criação de Entrada (compra), Saída (venda) e Despesa passa a ser feita no `/lancar` por abas. As telas `/compras`, `/vendas`, `/despesas` viram lista de consulta (sem "+ Novo", sem editar; mantêm excluir).

**Contexto:** `/lancar` hoje (fase 2) tem abas `pagar` (despesa simples via `gerarParcelas`), `receber`, `saldo`. Vamos trocar `pagar` por uma aba **Despesa** completa e adicionar **Entrada** e **Saída** (com fornecedor/cliente, NF, itens de produto, `ParcelasEditor`). O código dessas 3 formas já existe nos modais de `app/compras/page.tsx`, `app/vendas/page.tsx`, `app/despesas/page.tsx` — é extração + remoção do caminho de edição.

## Constraints

- `'use client'`, `export const dynamic = 'force-dynamic'`.
- Só classes do design system. Sem dep nova.
- `ParcelasEditor` (`@/components/ParcelasEditor`, props `{ parcelas, onChange, tipo }`) é reaproveitado como está.
- `diretoria` não acessa `/lancar` (guard já existe: `if (!podeUsar) return ...`).
- Produtos são globais (sem coluna `unidade`). Fornecedores/Clientes/Categorias filtram por `unidade`.
- Conversão de quantidade: `qtdParaBase(item, produtos)` — se `unidade==='maior'` multiplica por `fator_conversao`, arredonda; senão usa direto. Copiar de `app/compras/page.tsx:20-24`.

---

### Task 1: componente `components/lancar/FormMovimento.tsx`

Cobre Entrada (compra) e Saída (venda) — são 95% iguais.

**Props:**
```ts
interface Props {
  tipo: 'compra' | 'venda'
  unidade: string
  onResult: (m: { tipo: 'ok' | 'erro'; texto: string }) => void
}
```

**Comportamento:**
- `tipo==='compra'`: parceiro = **fornecedor** (`btx_fornecedores` da unidade), tem campo **Valor ST**, grava em `btx_compras` / `btx_compras_itens` / `btx_parcelas(tipo:'pagar', origem:'compra')`, `data_compra`.
- `tipo==='venda'`: parceiro = **cliente** (`btx_clientes` da unidade), **sem** ST, grava em `btx_vendas` / `btx_vendas_itens` / `btx_parcelas(tipo:'receber', origem:'venda')`, `data_venda`.
- Carrega produtos (globais) + parceiros (por unidade) num `useEffect` dependente de `unidade`.
- Estado: `form` (parceiro_id, data=hoje(), numero_nf, valor_st, observacoes), `itens: ItemForm[]` (começa com 1), `parcelas: ParcelaForm[]`.
- `ItemForm = { produto_id, qtdInput, unidade: 'base'|'maior', valor }`.
- `totalProdutos = Σ itens.valor`; `totalNF = totalProdutos + (tipo==='compra' ? valor_st : 0)`.
- JSX: reaproveitar **exatamente** o corpo do `<Modal>` de `app/compras/page.tsx` (campos + grid de itens + totais + `<ParcelasEditor tipo={tipo==='compra'?'pagar':'receber'} />`), tirando o wrapper `<Modal>` — renderiza direto num `<div>`. Para venda, ocultar o campo ST.
- Botão "Salvar lançamento" (`btn btn-primary`, disabled enquanto `saving`).
- `salvar()`:
  - valida: `itens[0].produto_id` preenchido, senão `onResult({tipo:'erro', texto:'Adicione pelo menos um produto.'})`.
  - `insert` na tabela mãe → pega `id` → `insert` itens (`qtd_carteiras: qtdParaBase(i, produtos)`, `valor`) → se `parcelas.length` `insert` parcelas.
  - sucesso: `onResult({tipo:'ok', texto:'Lançamento salvo.'})` + reset do form (form=EMPTY, itens=[1 vazio], parcelas=[]).
  - erro em qualquer passo: `onResult({tipo:'erro', texto:'Não foi possível salvar o lançamento.'})` e não continua.
- **Sem** caminho de edição (`editId`), sem `delete` de itens, sem `update ativo:false` — é só criação.

**Test:** `npx tsc --noEmit` limpo. (Sem teste unitário — é form; a lógica de parcelas/estoque já tem cobertura.)

---

### Task 2: componente `components/lancar/FormDespesa.tsx`

Extrai o modal de `app/despesas/page.tsx` (criação apenas).

**Props:** `{ unidade: string; categorias: {id,nome,grupo}[]; onResult }`.
- Campos: descrição * · categoria (select com `<optgroup>` por grupo, usando `GRUPOS_CATEGORIA`) · fornecedor (opcional, `btx_fornecedores` da unidade — carregar aqui) · data (=hoje) · nº NF/doc · valor total * · `<ParcelasEditor tipo="pagar" />`.
- `salvar()`: valida descrição + ≥1 parcela (igual à regra atual de despesas). `insert` `btx_despesas` `{ unidade, categoria_id: categoria_id||null, fornecedor_id: fornecedor_id||null, data_despesa: data, numero_nf: nf||null, descricao, valor_total, observacoes: null }` → `id` → `insert` parcelas `btx_parcelas(tipo:'pagar', origem:'despesa', origem_id:id, ...)`.
- sucesso → `onResult` ok + reset.

---

### Task 3: reescrever `app/lancar/page.tsx`

Abas: **Entrada · Saída · Despesa · Recebimento · Ajustar saldo**.
```ts
type Aba = 'entrada' | 'saida' | 'despesa' | 'receber' | 'saldo'
```
- Mantém: seletor de unidade (admin), guard `diretoria`, `msg`, carga de `categorias`/`clientes` por unidade (clientes ainda usados por `FormReceber`; categorias por `FormDespesa`).
- Render por aba:
  - `entrada` → `<FormMovimento tipo="compra" unidade={unidade} onResult={setMsg} />`
  - `saida` → `<FormMovimento tipo="venda" unidade={unidade} onResult={setMsg} />`
  - `despesa` → `<FormDespesa unidade={unidade} categorias={categorias} onResult={setMsg} />`
  - `receber` → `<FormReceber .../>` (o componente atual da fase 2 — manter)
  - `saldo` → `<FormSaldo .../>` (manter)
- **Remover** o componente `FormPagar` (fase 2) do arquivo — substituído por `FormDespesa`.
- Card wrapper: Entrada/Saída são largos (`maxWidth: 720`), os outros `maxWidth: 560`.
- Subtítulo da página: "Todo lançamento do sistema entra por aqui".

`npx tsc --noEmit` limpo; `npm run dev` → abrir `/lancar`, cada aba renderiza; lançar uma Entrada de teste (1 produto, 1 parcela) → sucesso, conferir em `/compras` que apareceu e em `/estoque-atual` que o saldo subiu.

---

### Task 4: `/compras`, `/vendas`, `/despesas` viram lista

Em cada page.tsx:
- Remover: `openNew`, `openEdit`, `save`, o `<Modal>` inteiro, o import de `Modal` e `ParcelasEditor`, o botão "+ Nova…", os estados `modal`, `form`, `itens`, `parcelas`, `editId`, `err`, e o botão "Editar" da coluna Ações.
- Manter: a tabela, o `load()`, o filtro por `unidadeAtiva`, o botão "Excluir" (soft delete) + `ConfirmDialog`, o `remove()`.
- Títulos: Compras → **"Entradas"** (subtítulo "O que entrou — consulta"); Vendas / NFs → **"Saídas"** ("O que saiu — consulta"); Despesas → **"Despesas"** ("Contas a pagar sem mercadoria — consulta").
- Manter os estados `rows`, `loading`, `confirm`, `saving` (usados por list + remove).
- Se sobrar import não usado (`hoje`, `Produto`, `Fornecedor`…), remover.

---

### Task 5: menu

`components/Sidebar.tsx` `NAV`: renomear labels — `Compras`→`Entradas`, `Vendas / NFs`→`Saídas`. Manter posição e o resto do menu como está (reorg completa e deleção de `/caixa`/`/relatorios` é a Entrega 2/4).

---

### Task 6: verificação + commit + merge

- `npx tsc --noEmit` limpo.
- `node --test --experimental-strip-types tests/*.test.mts` — tudo verde (nenhum teste toca essas telas).
- `npm run dev`: `/lancar` (5 abas), `/compras` `/vendas` `/despesas` (listas sem "+ Novo"), `/dashboard` (intacto). Console limpo. Screenshot do `/lancar`.
- Commits sugeridos:
  - `feat(lancar): formularios completos de entrada, saida e despesa`
  - `refactor(compras,vendas,despesas): viram lista de consulta; criacao no /lancar`
  - `chore(menu): Compras->Entradas, Vendas->Saidas`
- Branch `feat/entrega1-lancar-hub` a partir de `main`; ao fim, merge `--no-ff` + push.

## Self-review

- Criação de compra/venda/despesa movida pro `/lancar` → Tasks 1-3 ✓
- Telas viram consulta → Task 4 ✓
- `ParcelasEditor` reaproveitado → Tasks 1-2 ✓
- Sem caminho de edição nas 3 telas (spec: "opcional link ver no Lançar" — descartado por simplicidade; excluir+relançar cobre o caso) ✓
- Menu renomeado → Task 5 ✓
- `/caixa`, `/relatorios`, Painel, Estoque: **não tocar** nesta entrega ✓
- Placeholder scan: ok. Type consistency: `onResult` mesma assinatura de `FormBase` da fase 2; `ItemForm`/`ParcelaForm` como nos originais.
