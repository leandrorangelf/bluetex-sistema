# Estoque atual com movimentações e auditoria

## Objetivo e saldo
Adicionar uma área de Estoque Atual com saldo por produto e unidade, relatório de entradas e saídas e ajustes manuais rastreáveis. O saldo será `abertura + compras - vendas + ajustes de entrada - ajustes de saída`, usando a abertura mais recente disponível e carregando o resultado automaticamente entre meses.

## Interface
A navegação ganhará `Estoque Atual`. A página terá mês, filtro de produto, resumo, tabela por produto, relatório cronológico com saldo progressivo, ajuste manual obrigatório com data/tipo/quantidade/motivo e destaque de saldo negativo. Quantidades serão calculadas na unidade base e também exibidas na unidade maior.

## Auditoria e dados
Uma migração evoluirá `btx_ajustes_estoque` com data e tipo e criará um log imutável. Triggers PostgreSQL auditarão criação, edição e exclusão em estoque inicial, compras, itens de compras, vendas, itens de vendas e ajustes, gravando usuário, data/hora e valores anterior/novo. Somente administradores poderão consultar o histórico.

## Arquitetura e testes
O cálculo puro ficará em `lib/estoque.ts`. A página normalizará compras, vendas e ajustes em movimentos únicos. Testes cobrirão abertura mais recente, entradas, saídas, ajustes, saldo progressivo, filtros e estrutura da interface; a entrega também passará por TypeScript e build.

