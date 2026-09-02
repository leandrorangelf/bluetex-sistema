# Painel Executivo — Fase 2: redesenho do dashboard + tela Lançar

Data: 2026-09-02
Status: aprovado (aguardando revisão do spec)
Depende de: `2026-09-02-painel-executivo-resumo-design.md` (já em produção — `lib/painel-resumo.ts`, coluna `grupo`).

## Problema

O painel entregue na fase 1 ficou confuso: cards enormes, nada clicável, e o
"Consolidado" só tinha uma tabela pequena embaixo. Além disso, alimentar o painel
exige passar por 4 telas diferentes (`/caixa`, `/vendas`, `/despesas`, `/compras`),
cada uma pedindo mais campos que o necessário e obrigando a repetir o valor numa
linha de "Parcela".

## Parte 1 — Redesenho do `/dashboard`

Reaproveita `lib/painel-resumo.ts` sem mudança de cálculo. Só muda a apresentação.

### Layout "Consolidado" (admin / diretoria)

Formato da planilha da diretoria: **3 colunas lado a lado**, uma por unidade
(MG · SC · AM).

1. **Faixa-resumo** no topo (linha fina, não card): `Saldo total` · `A receber` ·
   `A pagar` · `Resultado` — soma das 3 unidades. Fonte mono, ~14px, sem os
   `stat-card` grandes.
2. **Grid de 3 colunas** (`display:grid; grid-template-columns: repeat(3,1fr); gap:16px`;
   abaixo de ~900px vira 1 coluna). Cada coluna é um `card` com:
   - Cabeçalho: nome curto da unidade (`MG`/`SC`/`AM`) + `Resultado de caixa`
     (mono, verde/vermelho). Clicar no cabeçalho troca para a aba daquela unidade.
   - Duas linhas pequenas: `Saldo hoje` / `A receber` (label à esquerda, valor mono à direita).
   - `Contas a pagar`: por grupo (ordem fixa de `GRUPOS_CATEGORIA`). Cada grupo é
     uma linha clicável `nome do grupo … subtotal` que expande/recolhe as contas.
     Estado começa recolhido no consolidado.
   - Ao expandir: cada conta = linha `descrição · vence dd/mm · valor`. Vencida em
     vermelho com ⚠, ≤7 dias em âmbar com ⏰. **Clicar na conta abre o modal de ação** (ver abaixo).
   - Rodapé da coluna: `Total despesas` (mono, vermelho).
   - Sem contas no mês: linha "sem contas a pagar".
3. Alerta de parcelas vencidas (as 3 somadas) fica acima do grid, vermelho, só se `> 0`.

### Layout de unidade única (aba MG/SC/AM, ou papel `unidade`)

Uma coluna só, largura cheia, **grupos sempre expandidos**. Mesma faixa-resumo no
topo com os números daquela unidade. Mesmo modal de ação ao clicar numa conta.

### Modal de ação da conta a pagar

Abre ao clicar numa linha de conta a pagar (qualquer view). Título = descrição da conta.
Conteúdo:
- `Vencimento` (input date) e `Valor` (input number) editáveis.
- Botões: **✓ Marcar pago** (grava `status='pago'`, `data_pagamento = hoje`),
  **Salvar alteração** (grava vencimento/valor), **Cancelar conta**
  (`status='cancelado'`), **Fechar**.
- Diretoria: modal abre só-leitura, sem botões de ação.
- Após qualquer gravação: fecha o modal e recarrega a unidade afetada.

As gravações são `update` direto em `btx_parcelas` pelo `id` (a conta carrega o
`id` da parcela — já está em `ContaPagar.id`).

### Navegação

Mantém navegação de mês (`← mês →`) e as abas `Consolidado / MG / SC / AM`.

### O que sai

Nada além do que a fase 1 já removeu. Os `stat-card` grandes de hero são
substituídos pela faixa-resumo fina.

## Parte 2 — Tela nova `/lancar`

Item no menu, seção "Financeiro", **acima** de "Parcelas a Pagar". Label: `Lançar`.
Papel `diretoria` **não** vê o item (somente leitura).

Página com 3 abas (mesma classe `.tabs`/`.tab` do dashboard). Estado local, sem rota aninhada.

### Aba "Conta a pagar"

Campos:
- `Unidade` — select, só para admin; para papel `unidade` usa `unidadeAtiva` (campo oculto).
- `Descrição` * — texto.
- `Categoria` * — select das `btx_categorias_despesas` ativas da unidade, agrupadas
  visualmente por grupo via `<optgroup>` (label do grupo por `GRUPOS_CATEGORIA`).
- `Valor (R$)` * — number.
- `Vencimento` * — date (default hoje).
- `Nº boleto/doc` — texto, opcional.
- `☐ Parcelar` — checkbox. Se marcado: aparece `Nº de parcelas` (2–24). Gera N
  vencimentos mensais a partir do `Vencimento`, valor dividido igualmente (resto de
  centavos na 1ª parcela).

Ao salvar:
1. `insert` em `btx_despesas`: `{ unidade, categoria_id, data_despesa: vencimento da 1ª parcela, descricao, valor_total: valor cheio, numero_nf: boleto || null }`.
2. `insert` em `btx_parcelas` (1 ou N linhas): `{ unidade, tipo:'pagar', origem:'despesa', origem_id: <id da despesa>, numero_parcela, vencimento, valor, numero_boleto: boleto || null }`.
3. Toast/alerta de sucesso, limpa o formulário.

Isso faz a conta cair no grupo certo do painel (o painel resolve `origem='despesa' → categoria.grupo`).

### Aba "Recebimento"

Campos: `Unidade` (igual acima) · `Cliente` (select `btx_clientes` ativos da unidade, opcional) ·
`Descrição` * · `Valor (R$)` * · `Data prevista` * (date, default hoje) · `☐ Parcelar` (igual).

Ao salvar: `insert` em `btx_parcelas` (1 ou N): `{ unidade, tipo:'receber', origem:'manual', origem_id: null, numero_parcela, vencimento: data prevista, valor, observacoes: descricao + (cliente ? ' — ' + nome : '') }`.

Não cria venda nem NF. O painel conta `tipo='receber'` independente da origem.

### Aba "Ajustar saldo"

Campos: `Unidade` (igual) · `Saldo real hoje no banco (R$)` * · botão **Salvar saldo**.

Lógica (extraída de `app/caixa/page.tsx:160-174` para um helper compartilhado
`lib/saldo.ts`):
- Carrega as parcelas + pagamentos da unidade, calcula
  `realizadoEsteMes = calcularSaldoRealizado({ hoje, competenciaInicio: chaveCompetencia(anoAtual, mesAtual), parcelas, pagamentos })`.
- `novoSaldoInicial = saldoInformado − realizadoEsteMes`.
- `upsert` em `btx_caixa_mensal` `{ unidade, mes: mesAtual(), ano: anoAtual(), saldo_inicial: novoSaldoInicial, updated_at }` com `onConflict: 'unidade,mes,ano'`.
- `/caixa` passa a usar o mesmo helper (sem mudança de comportamento).

Helper: `export async function ajustarSaldoBanco(sb, unidade, saldoInformadoHoje): Promise<{ error: string | null }>`.

### Estrutura de arquivos

- `app/lancar/page.tsx` — página com as 3 abas (client component). Se ficar > ~250
  linhas, extrair cada aba para `app/lancar/FormContaPagar.tsx` etc.
- `app/lancar/layout.tsx` — igual aos outros (`AppLayout` wrapper — copiar de `app/despesas/layout.tsx`).
- `lib/saldo.ts` — `ajustarSaldoBanco`.
- `lib/parcelamento.ts` — `export function gerarParcelas(valorTotal: number, primeiroVencimento: string, n: number): { numero_parcela: number; vencimento: string; valor: number }[]` (mensal, resto na 1ª). Usado pelas 3… 2 abas.
- `components/Sidebar.tsx` — novo item.
- `app/dashboard/page.tsx` — reescrita do layout (Parte 1).

## Erros / bordas

- `/lancar` sem unidade ativa (papel `unidade` sem unidade): bloqueia com aviso.
- Valor ≤ 0 ou campos obrigatórios vazios: erro inline, não grava.
- Parcelar com N=1: trata como não-parcelado.
- Falha de `insert` da despesa: aborta antes de criar parcelas, mostra erro.
- Modal de ação: se a parcela já não existe (removida noutra aba), o `update` não
  falha ruidosamente — recarrega e o item some.
- Redesenho do dashboard: uma unidade que falha ao carregar continua não travando
  o painel (já resolvido na fase 1 com `Promise.allSettled`).

## Testes

- `lib/parcelamento.test.mts`:
  - N=3, R$100 → `[33.34, 33.33, 33.33]` (soma = 100), vencimentos mensais.
  - N=1 → uma parcela com o valor cheio.
  - regra de data: parcela `i` vence no mesmo dia do mês `primeiroVencimento + i meses`,
    fazendo **clamp ao último dia** quando o mês de destino é mais curto (31/01 → 28/02).
- `lib/painel-resumo.ts` sem alteração — testes da fase 1 seguem valendo.
- Conferência manual: lançar uma conta a pagar em `/lancar`, abrir `/dashboard` e
  ver ela no grupo certo da coluna certa; marcar pago pelo modal e ver sair de
  "A pagar" e o "Saldo hoje" não mudar (só muda quando a data de pagamento entra no realizado).
- `/caixa` continua ajustando saldo igual (regressão do helper).
