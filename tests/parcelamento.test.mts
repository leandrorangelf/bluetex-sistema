import test from 'node:test'
import assert from 'node:assert/strict'
import { gerarParcelas } from '../lib/parcelamento.ts'

test('n<=1 devolve uma parcela cheia', () => {
  assert.deepEqual(gerarParcelas(100, '2026-03-10', 1), [{ numero_parcela: 1, vencimento: '2026-03-10', valor: 100 }])
})

test('divide 100 em 3 e fecha a soma', () => {
  const p = gerarParcelas(100, '2026-03-10', 3)
  assert.equal(p.length, 3)
  assert.equal(p.reduce((s, x) => s + x.valor, 0), 100)
  assert.deepEqual(p.map(x => x.valor), [33.34, 33.33, 33.33])
  assert.deepEqual(p.map(x => x.vencimento), ['2026-03-10', '2026-04-10', '2026-05-10'])
})

test('clampa dia 31 para o ultimo dia do mes curto', () => {
  const p = gerarParcelas(300, '2026-01-31', 3)
  assert.deepEqual(p.map(x => x.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31'])
})

test('vira o ano', () => {
  const p = gerarParcelas(200, '2026-12-15', 2)
  assert.deepEqual(p.map(x => x.vencimento), ['2026-12-15', '2027-01-15'])
})
