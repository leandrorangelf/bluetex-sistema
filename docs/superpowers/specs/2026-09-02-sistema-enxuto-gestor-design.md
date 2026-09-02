# Sistema enxuto — visão do gestor

Data: 2026-09-02
Status: em revisão
Substitui os rascunhos de "fase 3 / enxugar" (aquele plano de deletar Compras/Vendas estava errado).

## Premissa

O dono está longe. Precisa **abrir o Painel e entender a situação em segundos**, e **descer ao detalhe quando algo chamar atenção**. Duas coisas mandam: **caixa** (vou fechar o mês?) e **estoque** (tenho mercadoria? o que entrou/saiu, de quem, pra quem, qual NF?).

Nada de tela que não sirva a isso. Mas o que serve ao detalhe **fica** — incluindo NF de entrada/saída, quantidades por produto e **pagamento parcial a fornecedor**.

## Arquitetura de navegação (menu final)

| Item | Papel |
|---|---|
| **Painel** | Home. Só leitura. Tudo clicável → desce ao detalhe. |
| **Lançar** | Hub único de entrada de dados. Abas. |
| **Entradas** | Lista do que entrou (compra): data, fornecedor, NF, produtos+qtd, valor, parcelas. Só consulta. |
| **Saídas** | Lista do que saiu (venda): data, cliente, NF, produtos+qtd, valor, parcelas. Só consulta. |
| **Despesas** | Lista de contas a pagar sem mercadoria. Só consulta. |
| **Contas a Pagar** | Parcelas a pagar + baixa **total ou parcial** + histórico de pagamentos por conta. |
| **Contas a Receber** | Parcelas a receber **por cliente** + baixa total ou parcial. |
| **Estoque** | Saldo atual por produto×unidade + **extrato de movimentos** (entrada/saída, origem/destino, qtd, NF, data) com filtro. |
| **Estoque Inicial** | Abertura de saldo. |
| **Cadastros** | Produtos, Clientes, Fornecedores, Categorias, Unidades. |

**Deletado:** `Relatórios` (o resumo vira o Painel; o extrato vira parte de Estoque) e `Painel Financeiro /caixa` (calendário projetado — sai; o registro de pagamento parcial que vivia lá migra para **Contas a Pagar**).

Criação/edição de Entradas, Saídas e Despesas **sai dessas telas** e passa a ser feita só no **Lançar**. Elas viram listas com filtro + link para o detalhe.

## Painel (`/dashboard`) — o que muda

Reaproveita `lib/painel-resumo.ts`; acrescenta estoque e alertas.

### 1. Faixa "Precisa de ação"
Aparece no topo, só as linhas com conteúdo. Cada uma clicável (leva à tela de detalhe já filtrada):
- 🔴 `N contas vencidas · R$ X` → Contas a Pagar (filtro vencidas)
- 🟡 `N contas vencem em ≤7 dias · R$ X` → Contas a Pagar (filtro próximas)
- 🔴 `N clientes em atraso · R$ X` → Contas a Receber (filtro vencidas)
- 🟡 `Estoque baixo: <produtos>` → Estoque

### 2. Caixa por unidade
3 colunas (MG·SC·AM) + coluna **Total**. Por unidade: **Resultado de caixa** (número-chave), Saldo hoje · A receber · A pagar. Cada valor clicável → lista por trás (ex.: "A receber" → Contas a Receber daquela unidade). *(já existe hoje em 3 colunas; adicionar a coluna Total e tornar os números clicáveis)*

### 3. Contas a pagar do mês
Por grupo (Fornecedores, Impostos, Funcionários, Custos Fixos, Outros), clicável → modal de ação. *(já existe)*

### 4. Estoque — resumo
Uma linha por produto: saldo em cada unidade + total. **Vermelho** se `< estoque_minimo` (ou `< 0` quando não há mínimo). Clica → Estoque.

## Estoque baixo — campo novo

`btx_produtos` ganha `estoque_minimo INTEGER` (nullable, em carteiras). Editável no cadastro de Produtos. Alerta do Painel usa: baixo quando `saldo_total < estoque_minimo`; se `estoque_minimo IS NULL`, só alerta quando `saldo_total < 0`.

Migração: `supabase_migration_estoque_minimo.sql` + refletir em `supabase_schema.sql`.

## Lançar (`/lancar`) — passa a ser o hub completo

Abas (papel `diretoria` não vê a tela):

### "Entrada" (compra)
Cria `btx_compras` + `btx_compras_itens` + `btx_parcelas(tipo=pagar, origem=compra)`.
Campos: unidade · fornecedor (select) · data · nº NF · **linhas de produto** (produto + qtd em carteiras + valor) com "+ item" · valor ST · valor total (auto = Σ itens + ST, editável) · **parcelas** (editor: nº parcelas ou linhas manuais de vencimento/valor).

### "Saída" (venda)
Cria `btx_vendas` + `btx_vendas_itens` + `btx_parcelas(tipo=receber, origem=venda)`.
Campos iguais à Entrada, trocando fornecedor→cliente e ST some.

### "Despesa"
Cria `btx_despesas` + `btx_parcelas(tipo=pagar, origem=despesa)`.
Campos: unidade · descrição · categoria (agrupada por grupo) · valor · vencimento · nº boleto · parcelas.

### "Recebimento avulso"
Cria `btx_parcelas(tipo=receber, origem=manual)` (sem venda).
Campos: unidade · cliente (opcional) · descrição · valor · data prevista · parcelas.

### "Ajustar saldo"
`ajustarSaldoBanco` (helper já existe). unidade · saldo real hoje.

**Movimento de estoque puro** (entrada/saída sem compra/venda) deixa de existir como "ajuste" avulso no Lançar — quem move estoque é Entrada e Saída. Correção pontual continua em **Estoque Inicial** / cadastro. *(as abas "Entrada/Saída de estoque" adicionadas na fase 2 são removidas — viram as abas "Entrada"/"Saída" completas acima.)*

O editor de parcelas (`ParcelasEditor`) e o multi-item são reaproveitados das telas atuais de Compras/Vendas/Despesas antes delas virarem lista.

## Contas a Pagar (`/parcelas-pagar` → título "Contas a Pagar")

- Lista: vencimento · **fornecedor/origem** (resolver `origem_id`: compra→fornecedor, despesa→descrição+categoria, manual→observações) · valor · **pago** · **saldo** · status.
- Filtros: pendentes · vencidas · pagas · todas.
- Linha → modal: **Registrar pagamento** (valor pré-preenchido com o saldo, editável para **parcial**; data). Grava `btx_pagamentos_parcela`; status vira `parcial` ou `pago` conforme soma. Também: editar vencimento/valor, cancelar.
- Modal mostra o **histórico de pagamentos** da conta (data · valor).
- Reaproveita a lógica de `btx_pagamentos_parcela` que hoje vive no `/caixa` (`PagamentoModal`, `calcularStatusPagamento`). O componente `PagamentoModal` é movido/adaptado para cá.

## Contas a Receber (`/parcelas-receber` → título "Contas a Receber")

- Agrupado/ordenável **por cliente**. Colunas: cliente · vencimento · valor · recebido · saldo · dias em atraso.
- Cliente resolvido: origem venda→`btx_vendas.cliente`; origem manual→`observacoes`.
- Linha → modal de baixa total/parcial (mesmo mecanismo de `btx_pagamentos_parcela`).
- Filtros: a receber · vencidas · recebidas · todas.

## Estoque (`/estoque-atual` → "Estoque")

- **Saldo atual** por produto × unidade + total (já existe via `calcularEstoque`).
- **Extrato de movimentos** novo: tabela unificada de `btx_compras_itens` (entrada, mostra fornecedor + NF), `btx_vendas_itens` (saída, cliente + NF), `btx_ajustes_estoque` (ajuste, motivo), `btx_estoque_inicial` (abertura). Colunas: data · tipo · produto · qtd (+entrada / −saída) · origem/destino · NF · unidade. Filtro por produto, unidade, período, tipo.
- Marca em vermelho produto com saldo `< estoque_minimo`.

## Detalhe: telas que viram lista

`app/compras/page.tsx`, `app/vendas/page.tsx`, `app/despesas/page.tsx`: remover os modais de criar/editar e o botão "+ Novo"; manter a tabela + filtros + (opcional) link "ver no Lançar" para editar. A rota continua existindo para consulta e para os links do Painel.

*(Alternativa considerada e descartada: manter "+ Novo" em cada tela — o usuário escolheu hub único.)*

## Erros / bordas

- Pagamento parcial que zera o saldo → status `pago`; parcial que excede → limitar ao saldo, avisar.
- Entrada/Saída sem nenhum item de produto → erro, não grava.
- `estoque_minimo` vazio → sem alerta de baixo (só negativo).
- Produto sem movimento → aparece no saldo com 0, não some do extrato só por não ter linha.
- Diretoria: Painel e todas as listas em modo leitura; sem Lançar; sem botões de baixa.

## Fora de escopo desta rodada

- Multi-moeda, anexo de NF em PDF, conciliação bancária.
- Relatório exportável (CSV) — pode voltar depois como botão no Estoque/Contas.

## Testes

- `lib/painel-resumo.ts`: alertas (vencidas, próximas, a receber vencidas) e resumo de estoque baixo — casos de `estoque_minimo` nulo vs preenchido.
- `calcularStatusPagamento` já tem teste; garantir que a baixa parcial em Contas a Pagar/Receber usa o mesmo caminho.
- Manual: lançar uma Entrada com 2 produtos + 3 parcelas → conferir estoque sobe, 3 contas a pagar surgem, Painel reflete; pagar 1 parcial → status parcial, saldo no Painel cai só o pago.
