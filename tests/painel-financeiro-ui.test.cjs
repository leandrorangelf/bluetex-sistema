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
  assert.match(page, /Ajustar saldo-base/)
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
