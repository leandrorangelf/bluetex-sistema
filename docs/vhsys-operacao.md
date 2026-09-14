# Integração VHSYS — operação multi-unidade

## Escopo

A integração é somente de leitura no VHSYS e atende as 6 unidades: `NEW
BLUETEX MG`, `NEW BLUETEX SC`, `NEW BLUETEX AM`, `GB SP`, `GB CE` e `GB MA`.
Cada unidade tem sua própria conta VHSYS (API keys independentes). O marco
zero é `01/07/2026`.

Só entram automaticamente do VHSYS: **vendas, notas de compra, estoque e os
boletos a receber gerados pela venda**. Contas a pagar e saldo bancário
**não vêm mais do VHSYS** — são lançados manualmente por cada unidade
direto no sistema.

- Contas a receber: importa os boletos atualmente em aberto, mesmo quando
  emitidos antes do marco zero.
- Títulos pagos anteriores ao marco zero: não são criados.
- Títulos já vinculados: continuam sendo atualizados quando forem liquidados.
- Vendas, notas e compras: entram a partir do marco zero.
- Estoque: usa o saldo atual informado pelo VHSYS, sem somá-lo novamente aos
  movimentos já importados.
- Registros manuais existentes são preservados e comparados antes da confirmação.

## Configuração segura

As credenciais nunca devem ser enviadas por mensagem nem colocadas no Git.
Copie `.env.example` para `.env.local` e preencha um bloco por unidade (veja
o arquivo — o sufixo da variável é o código da unidade em
`lib/vhsys/unidades.ts`: `MG`, `SC`, `AM`, `GB_SP`, `GB_CE`, `GB_MA`):

```dotenv
VHSYS_API_BASE_URL=
VHSYS_ACCESS_TOKEN_MG=
VHSYS_SECRET_ACCESS_TOKEN_MG=
VHSYS_PARTNER_TOKEN_MG=
# ... repita para SC, AM, GB_SP, GB_CE, GB_MA
```

No Vercel, cadastre essas variáveis em Project Settings → Environment
Variables (18 variáveis no total: 3 por unidade × 6 unidades, mais a URL
base compartilhada). O sistema comporta isso sem problema — é só
configuração, cada rota escolhe a credencial certa pelo código da unidade.

Também mantenha as variáveis do Supabase já usadas pelo sistema. Depois,
execute `docs/vhsys-multi-unidade-migration.sql` no SQL Editor do projeto
Supabase (com backup antes — ele apaga contas a pagar e saldos bancários que
tinham vindo do VHSYS). Para uma instalação nova, `supabase_schema.sql` já
sai no estado final.

## Primeira validação

1. Acesse **Integrações > VHSYS** como administrador.
2. Escolha a unidade no seletor e clique em **Sincronizar agora**.
3. Compare os totais exibidos com o VHSYS e com os lançamentos manuais:
   vendas, notas, compras e estoque.
4. Para correspondências seguras, mantenha **Vincular**. Para possíveis
   duplicidades, escolha conscientemente entre vincular, importar ou ignorar.
5. Repita para cada uma das 6 unidades.
6. Confira o dashboard, Caixa e Relatórios. Itens com origem VHSYS ficam
   identificados e bloqueados para edição manual.

Se qualquer domínio apresentar erro, a análise permanece auditável e a
confirmação deve ser adiada até corrigir a configuração ou permissão da API
daquela unidade.

## Repetição e recuperação

A sincronização é idempotente pelo identificador do VHSYS: repeti-la atualiza o
mesmo registro e não cria outra cópia. Se a execução falhar, corrija a causa e
inicie uma nova análise. As chaves jamais aparecem nos logs ou mensagens de erro.
