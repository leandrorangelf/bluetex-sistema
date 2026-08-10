# Painel Financeiro — Saldo em Banco e Pagamento Parcial

## Objetivo

Duas melhorias no Painel Financeiro (`/caixa`):

1. Tornar o saldo-base existente visível como **"Saldo em banco"**, já que nem todo movimento financeiro é lançado no sistema como parcela e o usuário precisa de uma referência clara e fácil de ajustar.
2. Permitir registrar pagamentos **parciais** de contas a pagar e a receber diretamente no painel, com histórico (log) por parcela, já que muitos pagamentos acontecem em várias partes ao longo do tempo.

## Fora do escopo

- Qualquer mudança na integração VHSYS.
- Conciliação bancária automática ou integração com instituições financeiras.
- Pagamento parcial nas páginas dedicadas `/parcelas-pagar` e `/parcelas-receber` (continuam como estão, com "marcar pago" total).
- Mudança na regra de encadeamento mensal do saldo-base.

## Parte 1 — Saldo em banco

Renomeação e reorganização visual, sem mudança de cálculo:

- O item "Saldo inicial" do resumo (`ResumoFinanceiro`) passa a se chamar **"Saldo em banco"**.
- O botão "Ajustar saldo-base" sai do cabeçalho da página (`finance-page-header`) e passa a ficar associado ao card "Saldo em banco" (ex.: um ícone/botão dentro do próprio card), mantendo-se visível apenas para administradores.
- `lib/financeiro.ts`, a tabela `btx_caixa_mensal` e a regra de busca do saldo-base mais recente (competência igual ou anterior ao mês selecionado) não mudam.

## Parte 2 — Pagamento parcial com log

### Modelo de dados

**Status da parcela** (`StatusParcela`, hoje `pendente | pago | cancelado`) ganha o valor `parcial`.

```sql
ALTER TABLE btx_parcelas DROP CONSTRAINT IF EXISTS btx_parcelas_status_check;
ALTER TABLE btx_parcelas ADD CONSTRAINT btx_parcelas_status_check
  CHECK (status IN ('pendente','pago','parcial','cancelado'));
```

**Nova tabela `btx_pagamentos_parcela`** — um lançamento por pagamento (parcial ou total) feito via Painel Financeiro:

```sql
CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parcela_id UUID NOT NULL REFERENCES btx_parcelas(id) ON DELETE CASCADE,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento DATE NOT NULL,
  observacoes TEXT,
  criado_por UUID REFERENCES btx_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_pagamentos_parcela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_admin_all_pagto_parc" ON btx_pagamentos_parcela FOR ALL USING (btx_get_my_role()='admin');
```

Somente admin tem policy de acesso — usuários de unidade não leem nem escrevem nessa tabela, reforçando no banco a regra de que só admin registra pagamento (total ou parcial) pelo painel.

### Regras derivadas (calculadas, não persistidas na parcela)

Para uma parcela com lançamentos em `btx_pagamentos_parcela`:

- `valor_pago` = soma dos lançamentos.
- `saldo_restante` = `valor - valor_pago` (nunca negativo na prática; lançamentos que ultrapassem o valor total devem ser bloqueados na validação do formulário).
- Status:
  - `valor_pago = 0` → mantém o status atual (`pendente`).
  - `0 < valor_pago < valor` → `parcial`.
  - `valor_pago >= valor` → `pago`, com `data_pagamento` = data do lançamento mais recente.
- Editar ou excluir um lançamento do log recalcula `valor_pago`, `saldo_restante` e o status automaticamente (inclusive podendo voltar de `pago` para `parcial`, ou de `parcial` para `pendente` se todos os lançamentos forem excluídos).

### Motor de cálculo (`lib/financeiro.ts`)

- Parcela **sem** lançamentos em `btx_pagamentos_parcela` (inclui todas as marcações de "pago" feitas pelas páginas dedicadas `/parcelas-pagar` e `/parcelas-receber`): comportamento atual, sem mudança — um único movimento na `data_pagamento` (se paga) ou no `vencimento` (se pendente).
- Parcela **com** lançamentos: cada lançamento vira um movimento próprio, com sua própria data e valor — o dinheiro entra/sai no saldo diário no dia real em que o pagamento parcial aconteceu.
  - Se `saldo_restante > 0`, mais um movimento é gerado no `vencimento` original pelo valor restante, com status refletindo `parcial` (contando como atrasado se o vencimento já passou, igual à regra atual de `atrasada`).
  - Se `saldo_restante = 0` (status `pago`), nenhum movimento adicional além dos lançamentos do log.
- `normalizarMovimentacoes` passa a receber também o mapa de lançamentos por `parcela_id` (carregado junto com as parcelas do mês) para fazer essa expansão.

### Interface (`ListaMovimentacoes`, dentro do Painel Financeiro)

- Cada card de movimentação ganha uma ação **"Registrar pagamento"**, visível apenas para admin (mesma checagem `isAdmin` já usada para "Ajustar saldo-base").
- Formulário (modal, seguindo o padrão de `Modal` já usado na página): valor (default = saldo restante), data (default = hoje), observação opcional. Validação: valor > 0 e valor ≤ saldo restante.
- Novo badge `Parcial` (cor própria, distinta de `Pago`/`Pendente`/`Atrasada`), mostrando "R$ X de R$ Y pago" no card.
- Card de parcela com lançamentos pode ser expandido para mostrar o histórico (data, valor, observação), cada linha com ações de editar e excluir (admin), que recalculam o estado da parcela.

## Testes e critérios de aceite

Cobertura mínima em `lib/financeiro.ts` (estende `tests/financeiro.test.mts`):

1. Parcela sem lançamento no log continua se comportando exatamente como hoje (regressão).
2. Um lançamento parcial gera um movimento na data do lançamento, pelo valor lançado.
3. Saldo restante de uma parcela parcial aparece como movimento `parcial` no vencimento original.
4. Soma de lançamentos igual ao valor total muda o status para `pago` e usa a data do último lançamento.
5. Soma de lançamentos maior ou igual ao valor total sem lançamento exato também fecha como `pago`.
6. Editar um lançamento recalcula `valor_pago`, `saldo_restante` e o status.
7. Excluir todos os lançamentos de uma parcela `parcial` volta o status para `pendente`.
8. Parcela `parcial` vencida aparece como atrasada pelo saldo restante.
9. Saldo em banco: renomeação não altera nenhum valor calculado (regressão do encadeamento mensal existente).

Verificação visual: card com ação de registrar pagamento, badge `Parcial`, expansão do histórico com editar/excluir, e o card "Saldo em banco" com o botão de ajuste em sua nova posição — em desktop e mobile.
