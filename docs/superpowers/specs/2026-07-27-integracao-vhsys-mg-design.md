# Integração VHSYS — Unidade MG

## Objetivo

Integrar o sistema Bluetex ao VHSYS em modo somente leitura para organizar os
dados da unidade `NEW BLUETEX MG`, sem alterar informações no ERP e sem apagar o
histórico lançado manualmente.

O marco zero operacional é 1º de julho de 2026. A integração deve importar as
movimentações relevantes a partir dessa data, preservar obrigações financeiras
anteriores ainda em aberto e ignorar o histórico anterior já liquidado.

## Escopo

### Incluído

- Vendas e notas faturadas desde 01/07/2026.
- Itens vendidos e respectivas saídas de estoque.
- Compras e entradas de mercadoria desde 01/07/2026.
- Itens comprados e respectivas entradas de estoque.
- Todas as contas a receber ainda em aberto, mesmo quando anteriores ao marco
  zero.
- Todas as contas a pagar ainda em aberto, mesmo quando anteriores ao marco
  zero.
- Posição atual do estoque no VHSYS.
- `saldo_atual` da conta Santander ativa, identificada pelo código bancário
  `033`.
- Conciliação dos dados importados com lançamentos manuais já existentes.
- Sincronização iniciada manualmente pelo usuário.
- Histórico auditável de cada sincronização.

### Não incluído nesta fase

- Escrita, atualização ou exclusão de dados no VHSYS.
- Automação do site do VHSYS por login e senha.
- Sincronização automática agendada.
- Outras unidades além da MG.
- Consulta direta à API do Santander.
- Importação de contas anteriores ao marco zero que já estejam liquidadas.
- Importação completa do histórico anterior a 01/07/2026.

## Fonte oficial e propriedade dos dados

O VHSYS será a fonte oficial dos registros importados. Esses registros serão
identificados visualmente e bloqueados para edição manual no sistema Bluetex.

Os lançamentos manuais existentes serão preservados. Quando um lançamento manual
for conciliado com um registro do VHSYS, ele receberá o identificador externo e
passará a seguir o estado retornado pelo ERP. Nenhum lançamento será apagado
automaticamente.

## Arquitetura

A integração será executada exclusivamente no servidor:

1. O navegador solicita uma análise pela rota interna do sistema.
2. A rota interna usa as credenciais secretas para consultar a API do VHSYS.
3. Um serviço normaliza as respostas para o modelo de dados do Bluetex.
4. Um conciliador compara os dados normalizados com os registros existentes.
5. A interface apresenta uma prévia sem gravar alterações definitivas.
6. Após confirmação explícita, o servidor persiste a sincronização.

As credenciais `access-token` e `secret-access-token` serão armazenadas como
variáveis secretas do ambiente. Elas não serão enviadas ao navegador, persistidas
nas tabelas de negócio nem incluídas em logs. Caso um endpoint exija
`partner-token`, ele também será tratado como segredo de servidor.

## Componentes

### Cliente VHSYS

Responsável por autenticação, paginação, limites de requisição, timeouts e
normalização dos erros HTTP. Toda listagem deve percorrer as páginas necessárias,
respeitando o limite máximo informado pela API.

### Importadores por domínio

Importadores independentes para:

- vendas e seus itens;
- compras/entradas e seus itens;
- contas a receber;
- contas a pagar;
- estoque;
- contas bancárias.

Cada importador retorna dados normalizados e métricas, sem escrever diretamente
nas tabelas finais.

### Conciliador

Classifica cada registro como:

- `novo`;
- `ja_vinculado`;
- `correspondencia_exata`;
- `possivel_duplicidade`;
- `divergente`;
- `ignorado`;
- `erro`.

### Persistência

A confirmação grava os registros aprovados, vínculos externos, fotografias de
saldo e estoque, conflitos pendentes e o relatório da execução. Uma restrição de
unicidade por unidade, entidade e ID externo torna a operação idempotente.

### Interface

A interface terá um botão **Sincronizar agora**, seguido de:

1. etapa de análise;
2. resumo por módulo e classificação;
3. lista de conflitos que exigem decisão;
4. confirmação;
5. resultado final auditável.

## Regras de seleção

### Vendas

Importar somente documentos faturados com data a partir de 01/07/2026, incluindo
itens, cliente, número do documento, valores, situação e datas disponíveis.
Documentos cancelados não entram nos totais nem nas saídas válidas de estoque.

### Compras

Importar entradas de mercadoria com data a partir de 01/07/2026, incluindo itens,
fornecedor, número do documento, valores, situação e datas disponíveis.
Entradas canceladas não entram nos totais nem nas entradas válidas de estoque.

### Contas a receber

Importar todas as contas não liquidadas, independentemente da data de origem.
Contas anteriores a 01/07/2026 já liquidadas serão ignoradas. Quando uma conta
antes aberta passar a liquidada no VHSYS, seu vínculo local será atualizado.

### Contas a pagar

Aplicar as mesmas regras de contas a receber, usando o estado de liquidação do
VHSYS como fonte oficial.

### Estoque

Na primeira sincronização confirmada, registrar a posição atual do VHSYS como
marco inicial. Nas sincronizações seguintes, atualizar a posição observada sem
somar novamente movimentos já processados. Movimentos detalhados poderão ser
armazenados para auditoria, mas o saldo vigente deve ser reconciliado com a
posição retornada pelo ERP.

### Santander

Selecionar a conta ativa cujo `numero_banco` seja `033`. Armazenar o
`saldo_atual` como uma fotografia com data e hora da consulta. O saldo não será
somado às receitas ou despesas como se fosse uma movimentação.

Se nenhuma conta Santander ativa for encontrada, a análise deve falhar apenas
nesse módulo e informar o problema. Se houver mais de uma, o usuário deverá
selecionar a conta antes da confirmação; a escolha ficará salva por ID externo
para sincronizações futuras.

## Conciliação com dados manuais

A correspondência será avaliada nesta ordem:

1. mesmo ID externo já vinculado;
2. mesmo número de documento, CNPJ normalizado e valor total;
3. mesma data, pessoa e valor total;
4. sem correspondência.

A regra 2 gera uma correspondência exata quando todos os campos estiverem
presentes e coincidirem. A regra 3 gera apenas uma possível duplicidade e exige
decisão humana.

Para cada possível duplicidade ou divergência, o usuário poderá:

- vincular ao lançamento existente;
- importar como um registro separado;
- ignorar apenas nessa execução.

Ignorar não apaga nem altera o registro manual. As decisões de vínculo ficam
registradas para evitar nova pergunta em sincronizações futuras.

## Cálculos

A visão financeira de posição projetada será:

`saldo atual do Santander + contas a receber em aberto - contas a pagar em aberto`

Esse valor é uma projeção simples, não um extrato bancário. Estoque, vendas
faturadas e compras não devem ser somados novamente quando já estiverem
representados nas contas financeiras, evitando dupla contagem.

## Transação e recuperação de falhas

A análise nunca altera as tabelas finais. Na confirmação, cada domínio será
processado de forma controlada e terá status próprio:

- `concluido`;
- `falhou`;
- `nao_executado`.

Dentro de cada domínio, os registros e o relatório correspondente serão
persistidos atomicamente. Uma falha em um domínio não deve produzir registros
parciais nele. Outros domínios já concluídos permanecem válidos e podem ser
reexecutados com segurança por causa das chaves externas únicas.

O sistema deve tratar explicitamente:

- credenciais inválidas ou expiradas;
- ausência de permissão para um endpoint;
- paginação incompleta;
- timeout e indisponibilidade temporária;
- respostas com campos ausentes ou valores inválidos;
- múltiplas contas Santander;
- registros externos cancelados;
- diferenças entre totais do cabeçalho e dos itens.

## Auditoria

Cada execução armazenará:

- usuário que iniciou e confirmou;
- início e término;
- unidade;
- marco temporal utilizado;
- módulos executados;
- quantidades lidas, incluídas, vinculadas, atualizadas, ignoradas, conflitantes
  e com erro;
- IDs externos afetados;
- mensagens de erro sanitizadas;
- fotografia resumida dos dados externos utilizados na decisão.

Segredos e cabeçalhos de autenticação nunca serão armazenados.

## Validação e testes

Antes da primeira confirmação:

1. testar o cliente com respostas simuladas;
2. validar paginação com mais de 250 registros;
3. testar normalização de datas, moeda, CNPJ e estados;
4. testar repetição da mesma sincronização sem duplicação;
5. testar correspondências exatas e possíveis duplicidades;
6. testar conta liquidada após uma sincronização anterior;
7. testar cancelamentos;
8. testar zero, uma e múltiplas contas Santander;
9. executar somente a análise contra a conta real;
10. comparar manualmente as contagens e os totais com o VHSYS;
11. confirmar a primeira carga somente após essa conferência.

## Critérios de aceite

- Nenhum dado é escrito no VHSYS.
- Nenhuma credencial chega ao navegador ou aos logs.
- A primeira análise não altera dados locais.
- Repetir uma sincronização não cria duplicidades.
- Dados manuais não são apagados.
- Conflitos exigem decisão explícita.
- Contas antigas abertas aparecem; contas antigas já liquidadas não são
  importadas.
- Vendas e compras anteriores ao marco zero não são importadas como histórico.
- Estoque reflete a posição atual do VHSYS.
- O saldo exibido para o Santander corresponde ao `saldo_atual` retornado pela
  conta externa selecionada.
- A projeção financeira não conta vendas ou compras duas vezes.
- Toda confirmação gera um relatório auditável.

