const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('migração amplia ajustes com data e tipo', () => {
  const sql = read('supabase_migration_estoque_atual_auditoria.sql')
  assert.match(sql, /ADD COLUMN IF NOT EXISTS data_ajuste DATE/i)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS tipo TEXT/i)
  assert.match(sql, /CHECK \(tipo IN \('entrada','saida'\)\)/i)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS btx_ajustes_estoque_unidade_data_idx/i)
})

test('migração cria log protegido e função de auditoria', () => {
  const sql = read('supabase_migration_estoque_atual_auditoria.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS btx_auditoria_estoque/i)
  assert.match(sql, /dados_anteriores JSONB/i)
  assert.match(sql, /dados_novos JSONB/i)
  assert.match(sql, /usuario_id UUID/i)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /FOR SELECT TO authenticated/i)
  assert.match(sql, /select btx_get_my_role\(\)/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION btx_auditar_estoque\(\)/i)
  assert.match(sql, /SECURITY DEFINER/i)
  assert.match(sql, /SET search_path = public/i)
  assert.match(sql, /IF TG_OP = 'DELETE' THEN\s+RETURN OLD/i)
})

test('migração audita todas as tabelas que alteram saldo', () => {
  const sql = read('supabase_migration_estoque_atual_auditoria.sql')
  const tabelas = [
    'btx_estoque_inicial',
    'btx_compras',
    'btx_compras_itens',
    'btx_vendas',
    'btx_vendas_itens',
    'btx_ajustes_estoque',
  ]
  for (const tabela of tabelas) {
    assert.match(sql, new RegExp(`AFTER INSERT OR UPDATE OR DELETE ON ${tabela}`, 'i'))
  }
})

test('schema consolidado inclui auditoria para instalações novas', () => {
  const schema = read('supabase_schema.sql')
  assert.match(schema, /CREATE TABLE IF NOT EXISTS btx_auditoria_estoque/i)
  assert.match(schema, /data_ajuste DATE NOT NULL/i)
})

test('componentes mostram resumo, saldos e relatório progressivo', () => {
  const resumo = read('components/estoque/ResumoEstoque.tsx')
  const saldos = read('components/estoque/TabelaSaldosEstoque.tsx')
  const movimentos = read('components/estoque/RelatorioMovimentosEstoque.tsx')

  assert.match(resumo, /Entradas do mês/)
  assert.match(resumo, /Saídas do mês/)
  assert.match(saldos, /Saldo inicial/)
  assert.match(saldos, /Ajustes/)
  assert.match(saldos, /saldoAtual < 0/)
  assert.match(movimentos, /Saldo após/)
  assert.match(movimentos, /Nenhuma movimentação/)
})

test('histórico administrativo exibe autor e diferenças', () => {
  const auditoria = read('components/estoque/HistoricoAuditoriaEstoque.tsx')

  assert.match(auditoria, /Histórico de alterações/)
  assert.match(auditoria, /dados_anteriores/)
  assert.match(auditoria, /dados_novos/)
  assert.match(auditoria, /Usuário/)
  assert.match(auditoria, /Data e hora/)
})

test('rota Estoque Atual integra fontes, cálculo e ajuste manual', () => {
  const pagina = read('app/estoque-atual/page.tsx')
  const layout = read('app/estoque-atual/layout.tsx')

  assert.match(layout, /AppLayout/)
  assert.match(pagina, /btx_estoque_inicial/)
  assert.match(pagina, /btx_compras/)
  assert.match(pagina, /btx_vendas/)
  assert.match(pagina, /btx_ajustes_estoque/)
  assert.match(pagina, /calcularEstoque/)
  assert.match(pagina, /Novo ajuste/)
  assert.match(pagina, /tipo: ajusteForm.tipo/)
  assert.match(pagina, /motivo: ajusteForm.motivo/)
})

test('página protege histórico por perfil administrativo', () => {
  const pagina = read('app/estoque-atual/page.tsx')

  assert.match(pagina, /profile\?\.role === 'admin'/)
  assert.match(pagina, /btx_auditoria_estoque/)
  assert.match(pagina, /Histórico de alterações/)
  assert.match(pagina, /HistoricoAuditoriaEstoque/)
})

test('menu e estilos incluem Estoque Atual', () => {
  const sidebar = read('components/Sidebar.tsx')
  const css = read('app/globals.css')

  assert.match(sidebar, /href: '\/estoque-atual', label: 'Estoque'/)
  assert.match(css, /\.stock-summary-grid/)
  assert.match(css, /\.stock-tabs/)
  assert.match(css, /@media \(max-width: 900px\)/)
})
