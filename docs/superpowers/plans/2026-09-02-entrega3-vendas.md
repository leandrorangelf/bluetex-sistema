# Entrega 3 — Vendas como tela própria + NF nas contas

**Goal:** Vendas volta como tela dedicada (Registrar + Lista), sai do `/lancar` e do Estoque. Contas a Pagar e a Receber ganham coluna **Nº NF** e legenda "previsão até confirmar".

Sem perfil novo: quem registra é o papel `unidade` (secretaria da filial) e `admin`. `diretoria` só consulta.

## Constraints
- `'use client'`, `dynamic='force-dynamic'`. Só design system (`tabs`/`tab`, `table-wrap`, `form-*`, `btn*`, `alert*`, `empty-state`, `page-*`). Sem dep nova.
- `FormMovimento` (`@/components/lancar/FormMovimento`) props: `{ tipo: 'compra'|'venda', unidade: string, onResult: (m:{tipo:'ok'|'erro',texto:string})=>void }`. Reusar para o "Registrar".
- `useAuth()` dá `profile` (`.role`: 'admin'|'unidade'|'diretoria') e `unidadeAtiva`.
- Unidades: `UNIDADES`, `Unidade` de `@/types`.

---

### Task 1: `app/vendas/page.tsx` + `app/vendas/layout.tsx`

`layout.tsx` = cópia de `app/lancar/layout.tsx`.

`page.tsx`:
- Guard: `profile.role === 'diretoria'` → só a aba Lista (sem Registrar).
- Estado: `aba: 'registrar' | 'lista'` (default 'registrar', ou 'lista' se diretoria), `unidade` (para admin: seletor; para `unidade`: `unidadeAtiva`), `msg`.
- Header: título "Vendas", subtítulo "Registro de saídas e contas a receber".
- Seletor de unidade só para `admin` (igual `app/lancar/page.tsx` linhas ~49-58).
- Aba **Registrar** (oculta para diretoria): se `!unidade` → aviso "Selecione a unidade"; senão `<FormMovimento tipo="venda" unidade={unidade} onResult={setMsg} />` dentro de um `<div className="card" style={{ maxWidth: 720 }}>`. Mostrar `msg` num `alert alert-green/alert-red` acima.
- Aba **Lista** = componente `ListaVendas` (abaixo). Filtra por `unidadeAtiva` (para `unidade`) ou mostra todas / pela `unidade` selecionada (admin).

`ListaVendas` — copiar de `ListaSaidas` em `app/estoque-atual/page.tsx` (linhas ~319-372), com colunas: Data · NF · Cliente · Produtos (nome — qtd caixas) · Total NF · Ações (Excluir soft para não-diretoria). `remove()` faz `btx_vendas.update({ativo:false})` + `btx_parcelas.update({ativo:false}).eq('origem_id', id)`.
Ajuste: aceitar prop `unidade?: string` para o filtro (admin com unidade escolhida) — se não vier, usa `unidadeAtiva`.

commit `feat(vendas): tela dedicada (registrar + lista), fora do hub`

---

### Task 2: tirar "Saída" do `/lancar`

`app/lancar/page.tsx`:
- `type Aba` → `'entrada' | 'despesa' | 'receber' | 'saldo'` (remove `'saida'`).
- Remover o `<button className="tab" ...>Saída</button>` e a linha `{aba === 'saida' && <FormMovimento tipo="venda" .../>}`.
- `useState<Aba>('entrada')` continua.
- `FormMovimento` ainda é importado (usado por `entrada`). Manter.

commit incluído no da Task 3.

---

### Task 3: tirar "Saídas" do Estoque

`app/estoque-atual/page.tsx`:
- `aba` type → `'saldo' | 'entradas'` (remove `'saidas'`).
- Remover o `<button ...>Saídas</button>` e `{aba === 'saidas' && <ListaSaidas />}`.
- **Remover a função `ListaSaidas` inteira** e o import de `Venda` se ficar órfão (`npx tsc --noEmit` diz).
- `ListaEntradas` fica.

commit `refactor(lancar,estoque): Saida/Saidas saem; vendas agora em /vendas`

---

### Task 4: menu

`components/Sidebar.tsx` `NAV` — inserir depois de `{ href: '/lancar', label: 'Lançar' }`:
```ts
{ href: '/vendas', label: 'Vendas' },
```
`/vendas` some para `diretoria`? Não — diretoria vê a Lista. Deixar visível para todos (o guard na página cuida do resto). Não adicionar guard no Sidebar.

commit incluído no da Task 3.

---

### Task 5: Nº NF em Contas a Receber

`app/parcelas-receber/page.tsx`, dentro de `load()`:
- A query de vendas já traz `id,cliente:btx_clientes(nome)`. Trocar por `id,numero_nf,cliente:btx_clientes(nome)`.
- Novo estado `const [nfMap, setNfMap] = useState<Map<string,string>>(new Map())`.
- Ao montar `vendaCliente`, montar também `vendaNf = new Map(v.id -> v.numero_nf ?? '')`. Para cada parcela `origem==='venda'`: `nfMap.set(p.id, (p.origem_id && vendaNf.get(p.origem_id)) || '—')`; senão `nfMap.set(p.id, p.numero_boleto ?? '—')`.
- Na tabela: adicionar `<th>NF</th>` após Cliente e `<td className="mono">{nfMap.get(r.id) ?? '—'}</td>`. Ajustar `colSpan` dos estados vazio/carregando.
- Acima da tabela, um `<div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Tudo aqui é previsão até o recebimento ser confirmado.</div>`.

commit `feat(contas-receber): coluna NF + aviso de previsao`

---

### Task 6: Nº NF em Contas a Pagar

`app/parcelas-pagar/page.tsx`, dentro de `load()` (onde já resolve origem):
- Na busca de `btx_compras`: incluir `numero_nf`. Na de `btx_despesas`: incluir `numero_nf`.
- Montar `nfMap: Map<parcela_id, string>`: compra → `numero_nf` da compra; despesa → `numero_nf` da despesa; manual → `numero_boleto ?? '—'`. Fallback `'—'`.
- Tabela: `<th>NF</th>` após a coluna de origem/fornecedor; `<td className="mono">{nfMap.get(r.id) ?? '—'}</td>`. Ajustar `colSpan`.
- Aviso igual: "Tudo aqui é previsão até o pagamento ser confirmado."

commit `feat(contas-pagar): coluna NF + aviso de previsao`

---

### Task 7: verificação + merge
- `npx tsc --noEmit` limpo.
- `node --test --experimental-strip-types tests/*.test.mts` + `node --test tests/*.cjs` — verde. (Se `tests/estoque-ui.test.cjs` assertar sobre a aba "Saídas" ou `ListaSaidas`, ajustar.)
- `npm run dev`: `/vendas` (Registrar + Lista), `/lancar` (4 abas), `/estoque-atual` (Saldo + Entradas), menu com Vendas. `/parcelas-pagar` e `/parcelas-receber` com coluna NF.
- Branch `feat/entrega3-vendas` de `main`; merge `--no-ff` + push ao fim.

## Self-review
- Vendas tela própria (registrar+lista) → Task 1 ✓
- Sai de /lancar e Estoque → Tasks 2-3 ✓
- Menu → Task 4 ✓
- NF em Contas a Receber + legenda previsão → Task 5 ✓
- NF em Contas a Pagar + legenda → Task 6 ✓
- Sem perfil/RLS novo (papel `unidade` já insere venda) ✓
- diretoria: só Lista em /vendas ✓
