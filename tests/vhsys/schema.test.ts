// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(resolve(process.cwd(), 'supabase_schema.sql'), 'utf8')

describe('schema da integração VHSYS', () => {
  it('cria tabelas de análise, itens e fotografias bancárias', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS btx_vhsys_sincronizacoes')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS btx_vhsys_sincronizacao_itens')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS btx_vhsys_saldos_bancarios')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS btx_vhsys_estoque_atual')
  })

  it('impede IDs externos duplicados por entidade', () => {
    expect(schema).toContain('btx_vendas_vhsys_uidx')
    expect(schema).toContain('btx_compras_vhsys_uidx')
    expect(schema).toContain('btx_parcelas_vhsys_uidx')
  })

  it('restringe auditoria VHSYS a administradores', () => {
    expect(schema).toContain('CREATE POLICY "btx_admin_vhsys_sync"')
    expect(schema).toContain("WITH CHECK (btx_get_my_role()='admin')")
  })

  it('confirma cada domínio por função transacional sem SQL dinâmico', () => {
    expect(schema).toContain('FUNCTION btx_confirmar_vhsys_dominio')
    expect(schema).toContain('SECURITY INVOKER')
    expect(schema).not.toContain('EXECUTE format(')
  })
})
