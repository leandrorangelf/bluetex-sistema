# Estoque Atual e Auditoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar saldo atual por produto, relatório de entradas e saídas, ajustes manuais e log administrativo das alterações que afetam estoque.

**Architecture:** Um motor TypeScript puro normaliza e calcula saldos a partir da abertura mais recente, compras, vendas e ajustes. A página Next.js apenas carrega dados do Supabase e renderiza componentes focados. Uma migração PostgreSQL amplia ajustes e instala auditoria por triggers com RLS administrativa.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase/PostgreSQL, CSS existente e `node:test`.

## Global Constraints

- Preservar as alterações locais não relacionadas já existentes.
- Calcular quantidades em unidade base inteira e exibir conversão para unidade maior.
- Histórico de auditoria somente para administradores e sem exclusão pela interface.
- Não incluir custo médio, valoração, lotes, validade, reservas ou transferências.

---

### Task 1: Motor de estoque

**Files:**
- Create: `lib/estoque.ts`
- Test: `tests/estoque.test.mts`

**Interfaces:**
- Produces: `calcularEstoque({ ano, mes, produtos, aberturas, movimentos })` e tipos `MovimentoEstoque`, `SaldoProduto` e `PainelEstoque`.

- [ ] **Step 1: Write the failing tests** para abertura mais recente, descarte de movimentos anteriores à abertura, compra/ajuste como entrada, venda/ajuste como saída, saldo progressivo e filtro mensal.
- [ ] **Step 2: Run test to verify it fails** com `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/estoque.test.mts`; esperado: módulo `lib/estoque.ts` ausente.
- [ ] **Step 3: Write minimal implementation** normalizando datas `YYYY-MM-DD`, escolhendo abertura por produto com competência máxima até o fim do mês e ordenando movimentos por data/id.
- [ ] **Step 4: Run test to verify it passes** com o mesmo comando; esperado: todos PASS.
- [ ] **Step 5: Commit** `git add lib/estoque.ts tests/estoque.test.mts && git commit -m "feat(estoque): adiciona motor de saldo atual"`.

### Task 2: Banco, ajustes e auditoria

**Files:**
- Create: `supabase_migration_estoque_atual_auditoria.sql`
- Modify: `supabase_schema.sql`
- Modify: `types/index.ts`
- Test: `tests/estoque-ui.test.cjs`

**Interfaces:**
- Consumes: movimento de ajuste com `data_ajuste`, `tipo`, `qtd_carteiras`, `motivo` e `ativo`.
- Produces: tabela `btx_auditoria_estoque` e função trigger `btx_auditar_estoque()`.

- [ ] **Step 1: Write the failing structural test** exigindo colunas, tabela, RLS, política admin e triggers das seis tabelas.
- [ ] **Step 2: Run test to verify it fails** com `node --test tests/estoque-ui.test.cjs`; esperado: migração ausente.
- [ ] **Step 3: Write migration and consolidated schema** usando `auth.uid()`, JSONB `dados_anteriores/dados_novos`, `SECURITY DEFINER`, search path fixo e RLS de leitura admin.
- [ ] **Step 4: Update TypeScript types** adicionando `TipoAjusteEstoque`, `data_ajuste`, `tipo` e `AuditoriaEstoque`.
- [ ] **Step 5: Run structural test**; esperado: PASS.
- [ ] **Step 6: Commit** `git add supabase_migration_estoque_atual_auditoria.sql supabase_schema.sql types/index.ts tests/estoque-ui.test.cjs && git commit -m "feat(estoque): adiciona ajustes e auditoria"`.

### Task 3: Componentes do relatório

**Files:**
- Create: `components/estoque/ResumoEstoque.tsx`
- Create: `components/estoque/TabelaSaldosEstoque.tsx`
- Create: `components/estoque/RelatorioMovimentosEstoque.tsx`
- Create: `components/estoque/HistoricoAuditoriaEstoque.tsx`
- Modify: `tests/estoque-ui.test.cjs`

**Interfaces:**
- Consumes: `PainelEstoque`, `Produto`, `AuditoriaEstoque` e filtro de produto.
- Produces: componentes de apresentação sem acesso direto ao Supabase.

- [ ] **Step 1: Extend failing structural test** para títulos, colunas de entrada/saída/saldo, saldo negativo e dados anterior/novo.
- [ ] **Step 2: Run test to verify it fails**; esperado: componentes ausentes.
- [ ] **Step 3: Implement focused components** com estados vazios, tabela responsiva e quantidades formatadas.
- [ ] **Step 4: Run test to verify it passes**; esperado: PASS.
- [ ] **Step 5: Commit** `git add components/estoque tests/estoque-ui.test.cjs && git commit -m "feat(estoque): cria componentes do relatorio"`.

### Task 4: Página Estoque Atual

**Files:**
- Create: `app/estoque-atual/page.tsx`
- Create: `app/estoque-atual/layout.tsx`
- Modify: `components/Sidebar.tsx`
- Modify: `app/globals.css`
- Modify: `tests/estoque-ui.test.cjs`

**Interfaces:**
- Consumes: consultas `btx_produtos`, `btx_estoque_inicial`, `btx_compras`, `btx_vendas`, `btx_ajustes_estoque`, `btx_auditoria_estoque` e `calcularEstoque`.
- Produces: rota `/estoque-atual` com abas `Movimentações` e `Histórico de alterações`.

- [ ] **Step 1: Extend failing UI test** para rota, item de menu, filtros, modal de ajuste, inserção Supabase e guarda administrativa do histórico.
- [ ] **Step 2: Run test to verify it fails**; esperado: rota ausente.
- [ ] **Step 3: Implement data loading** com tratamento conjunto de erros e normalização de compras/vendas/ajustes.
- [ ] **Step 4: Implement interaction** de mês, produto, abas, modal validado e recarga após salvar.
- [ ] **Step 5: Add responsive CSS** somente no final de `app/globals.css`, preservando os hunks locais existentes.
- [ ] **Step 6: Run tests** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/estoque.test.mts tests/estoque-ui.test.cjs`; esperado: PASS.
- [ ] **Step 7: Commit only feature hunks** com `git add` por arquivos e hunk seletivo de CSS; mensagem `feat(estoque): integra painel atual e ajustes`.

### Task 5: Verificação final

**Files:** Todos os arquivos da entrega.

- [ ] **Step 1: Run complete feature tests**; esperado: zero falhas.
- [ ] **Step 2: Run TypeScript** com `npx tsc --noEmit`; esperado: exit 0.
- [ ] **Step 3: Detect active Next.js processes** antes do build para evitar concorrência em `.next`.
- [ ] **Step 4: Run production build** com `npm run build`; esperado: compilação, tipos e geração de rotas concluídos.
- [ ] **Step 5: Audit git diff/status** garantindo que arquivos locais anteriores não entrem nos commits.
