import test from 'node:test'
import assert from 'node:assert/strict'
import { saldoRestante } from '../lib/pagamentos.ts'

test('saldoRestante sem pagamentos = valor cheio', () => {
  assert.equal(saldoRestante(1000, []), 1000)
})

test('saldoRestante desconta os pagamentos', () => {
  assert.equal(saldoRestante(1000, [{ valor: 300 }, { valor: 200 }]), 500)
})

test('saldoRestante zera quando quitado', () => {
  assert.equal(saldoRestante(1000, [{ valor: 1000 }]), 0)
})
