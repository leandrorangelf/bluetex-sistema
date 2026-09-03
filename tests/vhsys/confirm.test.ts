// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateDecisions } from '@/lib/vhsys/confirm'

describe('validateDecisions', () => {
  const items = [
    { id: 'safe', classificacao: 'novo', local_id: null },
    { id: 'conflict', classificacao: 'possivel_duplicidade', local_id: 'local-1' },
  ]

  it('exige decisão explícita para conflitos', () => {
    expect(() => validateDecisions(items, [])).toThrow(
      'Há conflitos sem decisão.',
    )
  })

  it('rejeita vínculo sem registro local', () => {
    expect(() => validateDecisions(items, [
      { itemId: 'conflict', decision: 'vincular' },
    ])).toThrow('O vínculo exige um registro local.')
  })

  it('aceita decisão completa e preserva importação automática segura', () => {
    expect(validateDecisions(items, [{
      itemId: 'conflict',
      decision: 'vincular',
      localId: 'local-1',
    }])).toEqual([{
      itemId: 'conflict',
      decision: 'vincular',
      localId: 'local-1',
    }])
  })
})
