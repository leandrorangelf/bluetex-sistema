# Catálogo de unidades de medida (painel editável)

## Contexto

Segue [[2026-08-06-unidades-conversao-produto-design]]. Aquela primeira etapa deixou
`unidade_base`/`unidade_maior` como texto livre digitado em cada produto. Na prática isso gera
inconsistência ("Caixa" vs "caixa" vs "CX") e não dá um lugar central pra gerenciar quais unidades
existem.

## Problema

O usuário quer um painel editável onde cadastra os nomes de unidade uma vez (Carteira, Caixa,
Display, etc.) e o cadastro de produto escolhe entre eles, em vez de digitar texto livre toda vez.

## Solução

### Schema (`supabase_schema.sql`)

Nova tabela:

```sql
CREATE TABLE IF NOT EXISTS btx_unidades_medida (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_unidades_medida ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_unidades_medida" ON btx_unidades_medida FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_unidades_medida" ON btx_unidades_medida FOR ALL USING (btx_get_my_role()='admin');

INSERT INTO btx_unidades_medida(nome) VALUES ('Carteira'),('Caixa'),('Unidade'),('Display')
ON CONFLICT DO NOTHING;
```

Em `btx_produtos`: trocar as colunas `unidade_base TEXT` e `unidade_maior TEXT` por
`unidade_base_id UUID REFERENCES btx_unidades_medida(id)` e
`unidade_maior_id UUID REFERENCES btx_unidades_medida(id)`. `fator_conversao` continua igual (número
por produto, não muda de lugar).

### Migração de dados (produção)

Para o banco já provisionado (que tem `unidade_base`/`unidade_maior` como texto, da etapa
anterior):
1. Inserir em `btx_unidades_medida` os valores distintos hoje presentes em
   `btx_produtos.unidade_base` e `btx_produtos.unidade_maior`.
2. Adicionar as colunas `unidade_base_id`/`unidade_maior_id`, preenchendo via `UPDATE ... JOIN`
   pelo nome.
3. Dropar as colunas antigas `unidade_base`/`unidade_maior` (texto).

### Nova tela: Unidades (`app/unidades/page.tsx`)

Mesmo padrão de `app/produtos/page.tsx`: tabela com nome + ações (editar/excluir, soft-delete via
`ativo=false`), modal de criar/editar com um campo (Nome). Só admin edita; todo mundo lê. Adicionar
item "Unidades" no menu lateral (`components/Sidebar.tsx`), perto de "Produtos".

### Cadastro de produtos (`app/produtos/page.tsx`)

Os dois campos de texto livre (Unidade base, Unidade maior) viram `<select>` populados a partir de
`btx_unidades_medida` (carregada junto com a lista de produtos). Continuam obrigatórios. Fator de
conversão não muda.

### Telas que exibem/leem unidade do produto

`app/compras/page.tsx`, `app/vendas/page.tsx`, `app/estoque-inicial/page.tsx`,
`app/relatorios/page.tsx`, `app/dashboard/page.tsx` hoje leem `produto.unidade_base` e
`produto.unidade_maior` como string direto do produto. Passam a ler o nome via relação:
`unidade_base:btx_unidades_medida!unidade_base_id(nome)` e
`unidade_maior:btx_unidades_medida!unidade_maior_id(nome)` no select do Supabase (precisa do alias
`!coluna_fk` porque há duas FKs de `btx_produtos` pra `btx_unidades_medida`). O tipo `Produto` em
`types/index.ts` passa a ter `unidade_base_id: string; unidade_maior_id: string; unidade_base:
{ nome: string }; unidade_maior: { nome: string }` no lugar dos dois campos string.

## Fora de escopo

- Editar o nome de uma unidade já em uso não recalcula nada — é só rótulo, os `fator_conversao`
  continuam nos produtos.
- Excluir (soft-delete) uma unidade em uso por um produto ativo não é bloqueado nesta etapa — o
  produto continua funcionando com a unidade antiga (ela some da lista de opções pra novos
  cadastros, mas a referência existente permanece válida).
- Mais de 2 níveis de conversão por produto — confirmado com o usuário que 2 níveis (base + maior)
  seguem suficientes.
