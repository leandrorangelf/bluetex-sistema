// @vitest-environment node
import { expect, it } from 'vitest'
import { isVhsysManaged } from '@/lib/vhsys/read-only'

it('identifica somente registros gerenciados pelo VHSYS', () => {
  expect(isVhsysManaged({ origem_sistema: 'vhsys' })).toBe(true)
  expect(isVhsysManaged({ origem_sistema: 'manual' })).toBe(false)
  expect(isVhsysManaged({})).toBe(false)
})
