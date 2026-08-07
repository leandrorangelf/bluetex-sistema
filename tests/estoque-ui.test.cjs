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
  assert.match(sql, /btx_get_my_role\(\)='admin'/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION btx_auditar_estoque\(\)/i)
  assert.match(sql, /SECURITY DEFINER/i)
  assert.match(sql, /SET search_path = public/i)
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
