# Unidades de conversão configuráveis por produto

## Problema

Todo o sistema trata quantidade de produto como "carteiras" (coluna `qtd_carteiras` em
`btx_compras_itens`, `btx_vendas_itens`, `btx_estoque_inicial`, `btx_ajustes_estoque`), com um
único fator fixo `carteiras_por_caixa` em `btx_produtos` para converter pra caixas nos relatórios.

Um novo produto — display com 6 unidades — não se encaixa nesse modelo de carteira/caixa: não há
como cadastrar ou escolher outra unidade de medida.

## Solução

Generalizar o conceito de unidade no cadastro de produto, sem renomear as colunas `qtd_carteiras`
nas tabelas transacionais (elas continuam guardando a quantidade na unidade base do produto — só
o rótulo na tela muda).

### Schema (`supabase_schema.sql`)

Em `btx_produtos`:
- Renomear `carteiras_por_caixa` → `fator_conversao` (mesma semântica: quantas unidades base cabem
  na unidade maior).
- Adicionar `unidade_base TEXT NOT NULL DEFAULT 'Carteira'`.
- Adicionar `unidade_maior TEXT NOT NULL DEFAULT 'Caixa'`.

Produtos existentes ficam com os defaults, preservando o comportamento atual. Migration via
`ALTER TABLE ... RENAME COLUMN` + `ADD COLUMN ... DEFAULT`.

`types/index.ts`: `Produto` passa a ter `unidade_base: string; unidade_maior: string;
fator_conversao: number` no lugar de `carteiras_por_caixa: number`.

### Cadastro de produtos (`app/produtos/page.tsx`)

Formulário com 4 campos: Nome, Unidade base (texto livre), Unidade maior (texto livre), Fator de
conversão (número). Tabela de listagem mostra as 3 colunas de unidade.

### Compras e vendas (`app/compras/page.tsx`, `app/vendas/page.tsx`)

Cada linha de item ganha um seletor de unidade (base | maior), usando os nomes do produto
selecionado na linha. Ao salvar, se a unidade escolhida for a maior, multiplica pelo
`fator_conversao` do produto antes de gravar em `qtd_carteiras`. Ao editar um lançamento existente,
o campo sempre reabre na unidade base (não se guarda qual unidade foi usada na digitação original).

### Estoque inicial e ajustes de estoque (`app/estoque-inicial/page.tsx`, ajustes de estoque)

Telas de matriz (uma linha por produto). Em vez de seletor por linha, um toggle único no topo da
tabela ("Lançar em: Unidade base | Unidade maior") que muda o modo de entrada pra tabela inteira.

### Relatórios (`app/relatorios/page.tsx`)

Cabeçalhos fixos "Carteiras/cx" e "caixa" viram os nomes reais de cada produto
(`unidade_base`/`unidade_maior`), lidos por linha.

### `lib/utils.ts`

`carteirasParaCaixas(carteiras, carteiras_por_caixa)` renomeia para algo genérico, ex:
`converterParaUnidadeMaior(qtd, fator_conversao)` — mesma matemática, nome não amarrado a
"carteira/caixa".

## Fora de escopo

- Renomear a coluna `qtd_carteiras` nas 4 tabelas transacionais (compras_itens, vendas_itens,
  estoque_inicial, ajustes_estoque) — sem ganho real, só aumenta o diff.
- Hierarquias de unidade com mais de 2 níveis.
- Guardar qual unidade foi usada na digitação original de um item (edição sempre reabre na base).
