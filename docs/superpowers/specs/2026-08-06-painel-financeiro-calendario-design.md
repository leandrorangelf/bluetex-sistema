# Painel Financeiro com Calendário de Saldo

## Objetivo

Substituir a tela atual **Caixa Mensal** (`/caixa`) por um painel que reúna contas a pagar, contas a receber e a evolução diária do saldo. O usuário deve conseguir identificar, antes de cada vencimento, se o caixa será suficiente e em quais dias ficará positivo ou negativo.

O painel continua respeitando a unidade ativa e as políticas de acesso já existentes.

## Escopo aprovado

- Contas a pagar na lateral esquerda.
- Calendário financeiro no centro.
- Contas a receber na lateral direita.
- Saldo acumulado exibido em cada dia do calendário.
- Saldo final de um mês transportado automaticamente para o mês seguinte.
- Contas pendentes calculadas na data original do vencimento.
- Contas concluídas calculadas na data real de pagamento ou recebimento.
- Contas pendentes vencidas mantidas na data original e destacadas como atrasadas.
- Resumo mensal com saldo inicial, saídas, entradas e saldo final projetado.
- Seleção de um dia para destacar suas movimentações nas duas laterais.
- Ajuste administrativo de saldo-base.
- Layout responsivo.

## Regras financeiras

### Data efetiva da movimentação

Para cada registro ativo de `btx_parcelas`:

- `cancelado`: ignorar no painel e nos cálculos;
- `pendente`: usar `vencimento`;
- `pago`: usar `data_pagamento`;
- `pago` sem `data_pagamento`: usar `vencimento` como fallback defensivo e sinalizar a inconsistência na interface.

O tipo define o sinal da movimentação:

- `pagar`: saída, valor negativo;
- `receber`: entrada, valor positivo.

### Saldo diário

O saldo de um dia é:

`saldo do dia anterior + entradas do dia - saídas do dia`

Dias sem movimentação repetem o saldo anterior. O primeiro dia do mês parte do saldo final apurado no mês anterior.

### Saldo-base e encadeamento mensal

A tabela existente `btx_caixa_mensal` será mantida como fonte de pontos de saldo-base, sem exigir uma nova tabela.

Para calcular um mês, o sistema localiza o ponto de saldo-base mais recente da unidade cuja competência seja anterior ou igual ao mês selecionado. O campo `saldo_inicial` representa o saldo no início daquela competência. A partir dele, todas as movimentações com data efetiva entre o início da competência-base e o fim do mês selecionado são acumuladas.

Consequências:

- o saldo final é transportado automaticamente entre meses;
- um administrador pode corrigir o saldo no início de qualquer competência;
- uma correção afeta aquela competência e as seguintes, até existir outro ponto de saldo-base posterior;
- se a unidade não tiver saldo-base cadastrado, o cálculo começa em zero e a interface informa essa condição.

## Estrutura da tela

### Cabeçalho e filtros

- Título **Painel Financeiro**.
- Subtítulo com a unidade ativa.
- Navegação entre mês anterior e próximo mês.
- Seletor de unidade para administradores, seguindo o comportamento atual.
- Ação **Ajustar saldo-base**, visível apenas para administradores.

### Resumo mensal

Quatro indicadores aparecem antes do painel principal:

1. Saldo inicial do mês.
2. Saídas do mês.
3. Entradas do mês.
4. Saldo final projetado.

Valores negativos usam vermelho; entradas e saldos positivos usam verde; o saldo final recebe maior contraste.

### Lateral esquerda — contas a pagar

Lista cronológica das saídas cuja data efetiva pertence ao mês selecionado. Cada item apresenta:

- descrição da origem ou contraparte quando disponível;
- data efetiva;
- origem (`compra`, `despesa` ou `manual`);
- valor;
- status;
- identificação de conta atrasada.

### Centro — calendário financeiro

Grade mensal com sete colunas. Cada dia apresenta:

- número do dia;
- total de entradas, quando houver;
- total de saídas, quando houver;
- saldo acumulado ao final do dia.

Um dia com saída recebe tratamento vermelho; com entrada, verde; com ambos, tratamento neutro de alto contraste. Saldo negativo é sempre destacado em vermelho. O dia atual e o dia selecionado têm estados visuais distintos.

Ao selecionar um dia, o rodapé do calendário resume as entradas, saídas e o saldo daquele dia, e as listas laterais passam a mostrar somente suas movimentações. Uma ação **Ver mês inteiro** limpa a seleção.

### Lateral direita — contas a receber

Lista cronológica das entradas do mês, com a mesma anatomia da lateral esquerda e tratamento verde.

## Origem e descrição dos lançamentos

O painel usa `origem` e `origem_id` para enriquecer a descrição quando possível:

- `compra`: fornecedor e número da nota;
- `venda`: cliente e número da nota;
- `despesa`: descrição e fornecedor;
- `manual`: observações ou número do documento.

Se o registro de origem não existir, o painel exibe um rótulo seguro baseado na origem, número da parcela e documento, sem impedir o cálculo.

## Estados da interface

- **Carregando:** skeleton ou mensagem discreta dentro das três áreas.
- **Sem unidade:** instrução para selecionar uma unidade.
- **Sem saldo-base:** aviso com saldo inicial zero e ação administrativa para configurar.
- **Sem movimentações:** calendário permanece visível com saldo constante; laterais mostram estado vazio.
- **Erro de consulta:** alerta visível e ação para tentar novamente, sem apresentar totais parciais como corretos.
- **Data inconsistente:** parcela paga sem data de pagamento usa o vencimento como fallback e exibe aviso no item.

## Responsividade

Em telas amplas, a composição usa três colunas: pagar, calendário e receber. Em telas menores:

- o calendário ocupa toda a largura e vem primeiro;
- as listas ficam abaixo em abas **A pagar** e **A receber**;
- os quatro indicadores quebram para duas colunas e, em celulares estreitos, para uma coluna;
- nenhuma informação depende apenas de cor.

## Arquitetura proposta

- Manter `/caixa` como rota para preservar links existentes.
- Extrair a transformação financeira para funções puras em `lib`, separando consulta, normalização de datas e cálculo acumulado.
- Implementar componentes focados para resumo, listas e calendário, evitando concentrar toda a lógica em `app/caixa/page.tsx`.
- Reutilizar `btx_parcelas`, `btx_caixa_mensal`, os tipos existentes e o cliente Supabase atual.
- Não alterar as telas independentes de parcelas a pagar e receber neste escopo.

## Testes e critérios de aceite

Os cálculos devem ser cobertos por testes automatizados antes da implementação visual. Casos mínimos:

1. Uma saída no dia 10 reduz o saldo a partir do dia 10.
2. Uma entrada no dia 15 aumenta o saldo a partir do dia 15.
3. O saldo final do mês anterior inicia corretamente o mês seguinte.
4. Conta pendente vencida permanece na data original.
5. Conta paga usa a data real, mesmo quando diferente do vencimento.
6. Conta cancelada ou inativa não afeta o saldo.
7. Conta paga sem data usa o vencimento e é marcada como inconsistente.
8. Dias sem movimentação carregam o saldo anterior.
9. Múltiplas entradas e saídas no mesmo dia são somadas corretamente.
10. Um saldo-base posterior interrompe o encadeamento do saldo-base anterior.
11. O filtro por unidade impede mistura de dados.
12. Selecionar um dia filtra as duas listas sem mudar os totais mensais.

A verificação visual deve cobrir desktop e celular, navegação mensal, seleção de dia, estados vazios, saldo negativo e ajuste administrativo do saldo-base.

## Fora do escopo

- Conciliação bancária automática.
- Integração com instituições financeiras.
- Novas formas de cadastrar parcelas.
- Alteração das políticas RLS.
- Relatórios financeiros adicionais ou exportação.
- Mudanças nas telas atuais de parcelas, compras, vendas e despesas.

## Direção visual aprovada

Foi aprovada a opção **A — calendário central**, compatível com a identidade atual do sistema: fundo bege, superfícies claras, navegação azul-marinho, vermelho para saídas e alertas, verde para entradas e fonte monoespaçada nos valores financeiros.

O mockup refinado da sessão de brainstorming está armazenado em `.superpowers/brainstorm/` como referência temporária e não faz parte do código de produção.
