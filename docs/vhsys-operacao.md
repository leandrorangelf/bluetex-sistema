# Integração VHSYS — operação da unidade MG

## Escopo

A integração é somente de leitura no VHSYS e atende exclusivamente a unidade
`NEW BLUETEX MG`. O marco zero é `01/07/2026`.

- Contas a receber e a pagar: importa todos os títulos atualmente em aberto,
  mesmo quando emitidos antes do marco zero.
- Títulos pagos anteriores ao marco zero: não são criados.
- Títulos já vinculados: continuam sendo atualizados quando forem liquidados.
- Vendas, notas e compras: entram a partir do marco zero.
- Estoque: usa o saldo atual informado pelo VHSYS, sem somá-lo novamente aos
  movimentos já importados.
- Banco: usa o saldo atual da conta Santander retornada pelo VHSYS.
- Registros manuais existentes são preservados e comparados antes da confirmação.

## Configuração segura

As credenciais nunca devem ser enviadas por mensagem nem colocadas no Git.
Copie `.env.example` para `.env.local` e preencha localmente:

```dotenv
VHSYS_BASE_URL=
VHSYS_ACCESS_TOKEN=
VHSYS_SECRET_ACCESS_TOKEN=
VHSYS_PARTNER_API_KEY=
```

Também mantenha as variáveis do Supabase já usadas pelo sistema. Depois, execute
o conteúdo atualizado de `supabase_schema.sql` no SQL Editor do projeto Supabase.

## Primeira validação

1. Acesse **Integrações > VHSYS** como administrador.
2. Clique em **Sincronizar agora**. Essa etapa somente analisa; não grava os
   dados operacionais.
3. Compare os totais exibidos com o VHSYS e com os lançamentos manuais:
   contas em aberto, notas, compras, estoque e saldo Santander.
4. Para correspondências seguras, mantenha **Vincular**. Para possíveis
   duplicidades, escolha conscientemente entre vincular, importar ou ignorar.
5. Só então clique em **Confirmar sincronização**.
6. Confira o dashboard, Caixa e Relatórios. Itens com origem VHSYS ficam
   identificados e bloqueados para edição manual.

Se qualquer domínio apresentar erro, a análise permanece auditável e a
confirmação deve ser adiada até corrigir a configuração ou permissão da API.

## Repetição e recuperação

A sincronização é idempotente pelo identificador do VHSYS: repeti-la atualiza o
mesmo registro e não cria outra cópia. Se a execução falhar, corrija a causa e
inicie uma nova análise. As chaves jamais aparecem nos logs ou mensagens de erro.
