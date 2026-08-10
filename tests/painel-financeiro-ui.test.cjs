const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const read = path => fs.readFileSync(path, 'utf8')

test('painel financeiro possui os três componentes principais', () => {
  const arquivos = [
    'components/financeiro/ResumoFinanceiro.tsx',
    'components/financeiro/ListaMovimentacoes.tsx',
    'components/financeiro/CalendarioFinanceiro.tsx',
  ]

  for (const arquivo of arquivos) {
    assert.equal(fs.existsSync(arquivo), true, `${arquivo} deve existir`)
  }
})

test('rota caixa expõe saldo-base, calendário e recuperação de erro', () => {
  const page = read('app/caixa/page.tsx')
  assert.match(page, /Painel Financeiro/)
  assert.match(page, /abrirSaldoBase/)
  assert.match(page, /Tentar novamente/)
  assert.match(page, /CalendarioFinanceiro/)
  assert.match(page, /ListaMovimentacoes/)
})

test('painel possui layout responsivo e menu atualizado', () => {
  const css = read('app/globals.css')
  const sidebar = read('components/Sidebar.tsx')
  assert.match(css, /\.finance-layout/)
  assert.match(css, /\.finance-mobile-tabs/)
  assert.match(css, /@media \(max-width: 900px\)/)
  assert.match(sidebar, /href: '\/caixa', label: 'Painel Financeiro'/)
})

test('migração cria pagamentos parciais e libera status parcial', () => {
  const sql = read('supabase_migration_pagamento_parcial.sql')
  assert.match(sql, /CHECK \(status IN \('pendente','pago','parcial','cancelado'\)\)/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela/)
  assert.match(sql, /parcela_id UUID NOT NULL REFERENCES btx_parcelas\(id\) ON DELETE CASCADE/)
  assert.match(sql, /valor NUMERIC\(12,2\) NOT NULL CHECK \(valor > 0\)/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /btx_admin_all_pagto_parc/)
})

test('schema consolidado inclui pagamentos parciais para instalações novas', () => {
  const schema = read('supabase_schema.sql')
  assert.match(schema, /CREATE TABLE IF NOT EXISTS btx_pagamentos_parcela/)
  assert.match(schema, /status TEXT NOT NULL DEFAULT 'pendente' CHECK \(status IN \('pendente','pago','parcial','cancelado'\)\)/)
})

test('card de saldo em banco tem rótulo e ação de ajuste', () => {
  const resumo = read('components/financeiro/ResumoFinanceiro.tsx')
  assert.match(resumo, /Saldo em banco/)
  assert.match(resumo, /onAjustarSaldo/)
  assert.doesNotMatch(resumo, /Saldo inicial/)
})

test('botão de ajuste de saldo-base não fica mais solto no cabeçalho', () => {
  const pagina = read('app/caixa/page.tsx')
  assert.match(pagina, /onAjustarSaldo=\{abrirSaldoBase\}/)
})

test('modal de pagamento existe e valida contra o saldo restante', () => {
  const modal = read('components/financeiro/PagamentoModal.tsx')
  assert.match(modal, /saldoRestante/)
  assert.match(modal, /onSalvar/)
  assert.match(modal, /valor <= 0 \|\| valor > saldoRestante/)
})
