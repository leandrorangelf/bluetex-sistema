# Painel Executivo — resumo de caixa por unidade

Data: 2026-09-02
Status: aprovado (aguardando revisão do spec)

## Objetivo

Substituir o `/dashboard` atual por um **painel-resumo estilo planilha executiva**: por
unidade e por mês, mostrar SALDO HOJE, A RECEBER no mês, as CONTAS A PAGAR agrupadas
em blocos (Fornecedores / Impostos / Funcionários / Custos Fixos / Outros) e o
RESULTADO DE CAIXA do mês. Visual moderno, foco em poucos números grandes e legíveis.

Motivação: a diretoria hoje mantém esse resumo numa planilha manual. O sistema já tem
os dados (parcelas, pagamentos, saldo mensal) mas o dashboard atual mistura estoque,
lista plana de contas e comparativos e não bate com o formato que eles usam.

## Escopo

### Dentro
1. Migração: coluna `grupo` em `btx_categorias_despesas`.
2. Tela Categorias: campo "Grupo" no modal + coluna na tabela.
3. `lib/painel-resumo.ts`: cálculo dos números do painel por unidade/mês.
4. Reescrita de `app/dashboard/page.tsx` no novo formato.

### Fora (fase 2, depois de validar o painel)
- Simplificar o lançamento de despesa / parcela / saldo do dia.
- Qualquer limpeza/zeragem de dados históricos — é operação manual no banco feita
  pela diretoria, não faz parte deste trabalho. O navegador de mês já permite
  apontar o painel para agosto/julho e conferir contra a planilha.

## Cálculo — `lib/painel-resumo.ts`

Função `calcularResumoUnidade(input)` que devolve, para uma unidade e um mês/ano:

| Campo | Fonte |
|---|---|
| `saldoHoje` | `calcularSaldoRealizado({ hoje, competenciaInicio, parcelas, pagamentos })` somado ao `saldo_inicial` da base de `btx_caixa_mensal` vigente — mesma lógica de "saldo em banco" já usada no Painel Financeiro |
| `aReceberMes` | Σ restante das parcelas `tipo=receber`, `status in (pendente,parcial)`, com `vencimento` dentro do mês selecionado |
| `contasPagar[]` | parcelas `tipo=pagar`, `status in (pendente,parcial)`, `vencimento` dentro do mês. Cada item: `{ descricao, vencimento, valor: restante, grupo, vencida, proxima }` |
| `gruposPagar` | `contasPagar` agrupado por `grupo`, com subtotal por grupo |
| `totalDespesas` | Σ restante de `contasPagar` |
| `resultado` | `(saldoHoje + aReceberMes) − totalDespesas` |

`restante` = `valor - Σ pagamentos_parcela` (mesma conta já feita no dashboard atual).

### Classificação do grupo de cada conta a pagar
- `origem = 'compra'` → grupo `fornecedores` (sempre, ignora categoria).
- `origem = 'despesa'` → grupo da `btx_categorias_despesas` ligada à despesa
  (`btx_despesas.categoria_id`). Sem categoria → `outros`.
- `origem = 'manual'` ou `'venda'` → `outros`.

Consolidado (admin/diretoria) = soma dos campos das 3 unidades; `contasPagar`
concatenadas mantendo a marcação de unidade para exibição.

## Migração — `supabase_migration_categoria_grupo.sql`

```sql
ALTER TABLE btx_categorias_despesas
  ADD COLUMN IF NOT EXISTS grupo TEXT NOT NULL DEFAULT 'outros'
  CHECK (grupo IN ('fornecedores','impostos','funcionarios','custos_fixos','outros'));
```

Também refletir a coluna em `supabase_schema.sql`. Categorias existentes ficam em
`outros` até a diretoria reclassificar na tela.

## Tela Categorias — `app/categorias/page.tsx`

- Modal novo/editar: `<select>` "Grupo" com as 5 opções (label legível:
  "Fornecedores", "Impostos", "Funcionários", "Custos Fixos", "Outros").
- Tabela: nova coluna "Grupo" exibindo o label.
- `save()` passa `grupo` no insert/update. Default no form: `outros`.
- Tipo `CategoriaDespesa` em `types/` ganha `grupo`.

## Página — `app/dashboard/page.tsx` (reescrita)

Mantém: `'use client'`, `useAuth`, navegação de mês igual à de `/relatorios`
(`navMes`), abas Consolidado/MG/SC/AM para admin e diretoria (`UNIDADE_SHORT` já
existe), classes do design system (`stat-card`, `card`, `grid-3`, `badge`, `mono`,
`text-green/red/amber`, `alert`).

Layout, de cima para baixo:

1. **Header** — título "Painel Executivo", subtítulo com mês; controles de mês.
2. **Abas** (só admin/diretoria).
3. **Faixa hero** — `grid-3`, cartões grandes:
   - SALDO HOJE (`saldoHoje`, verde/vermelho)
   - A RECEBER · MÊS (`aReceberMes`, roxo)
   - RESULTADO DE CAIXA (`resultado`) — visualmente o maior/destacado, verde se ≥0
     senão vermelho; subtítulo "(saldo + a receber) − contas a pagar".
4. **Alerta** de parcelas vencidas sem pagamento (se houver), vermelho.
5. **Contas a pagar** — para cada grupo com itens (ordem fixa: Fornecedores,
   Impostos, Funcionários, Custos Fixos, Outros):
   - `card` com cabeçalho: nome do grupo + subtotal em mono à direita.
   - Linhas: `descricao` · `vencimento` (mono) · `valor` (mono, à direita).
     Vencida → vermelho + `⚠`; vence em ≤7 dias → âmbar + `⏰`.
     No Consolidado, tag curta da unidade (MG/SC/AM) na linha.
   - Grupo sem itens não aparece.
   - Se nenhuma conta a pagar no mês: empty-state "Nenhuma conta a pagar em <mês>".
6. **Barra TOTAL DESPESAS DO MÊS** — faixa destacada com `totalDespesas`.
7. **Consolidado apenas:** tabela compacta por unidade — colunas Unidade / Saldo
   Hoje / A Receber / A Pagar / Resultado; linha clicável troca a aba.

Sai do dashboard: bloco de Estoque Atual e a lista plana de "Contas a Pagar"
atuais (estoque continua em `/relatorios` e `/estoque-atual`).

Carregamento: para admin/diretoria, uma passada por unidade (`Promise.all` das 3),
igual ao padrão atual de `carregarTodas`. Reaproveitar as queries de
`btx_caixa_mensal` / `btx_parcelas` / `btx_pagamentos_parcela` já feitas hoje;
adicionar join/lookup de `btx_despesas.categoria_id → grupo` para as parcelas de
despesa (uma query `btx_despesas` por unidade com `id, categoria_id` + uma
`btx_categorias_despesas` com `id, grupo`, ou um único select aninhado).

## Erros / bordas

- Unidade sem `btx_caixa_mensal`: `saldoHoje` usa base 0 (comportamento atual).
- Mês futuro sem dados: painel zerado, sem erro.
- Categoria inativa/removida ligada a parcela ainda pendente: cai em `outros`.
- Diretoria: somente leitura (sem botões de ação — o painel não tem ações mesmo).

## Testes

- `lib/painel-resumo.test.ts` (ou bloco `demo()` com `assert`, padrão do projeto):
  - classificação de grupo por origem (compra→fornecedores, despesa→grupo da
    categoria, manual→outros);
  - `resultado = (saldoHoje + aReceberMes) − totalDespesas`;
  - parcela parcial entra pelo restante, não pelo valor cheio;
  - conta com vencimento fora do mês não entra;
  - consolidado = soma das unidades.
- Conferência manual: apontar o painel para o mês fechado anterior e comparar
  SALDO / A RECEBER / TOTAL DESPESAS / RESULTADO com a planilha da diretoria.
