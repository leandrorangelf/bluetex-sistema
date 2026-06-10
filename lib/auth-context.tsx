'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import type { Profile, Unidade } from '@/types'

interface AuthCtx {
  user: User | null
  profile: Profile | null
  unidadeAtiva: Unidade | null
  setUnidadeAtiva: (u: Unidade) => void
  loading: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  user: null, profile: null, unidadeAtiva: null,
  setUnidadeAtiva: () => {}, loading: true, signOut: async () => {}
})

const STORAGE_KEY = 'btx_unidade_ativa'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [unidadeAtiva, setUnidadeAtivaState] = useState<Unidade | null>(null)
  const [loading, setLoading] = useState(true)
  const sb = createClient()

  function setUnidadeAtiva(u: Unidade) {
    setUnidadeAtivaState(u)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, u)
  }

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setUnidadeAtivaState(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile(uid: string) {
    const { data } = await sb.from('btx_profiles').select('*').eq('id', uid).single()
    if (data) {
      setProfile(data as Profile)
      if (data.role === 'unidade' && data.unidade) {
        setUnidadeAtivaState(data.unidade as Unidade)
      } else if (data.role === 'admin') {
        const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
        if (saved) setUnidadeAtivaState(saved as Unidade)
      }
    }
    setLoading(false)
  }

  async function signOut() {
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    await sb.auth.signOut()
  }

  return (
    <Ctx.Provider value={{ user, profile, unidadeAtiva, setUnidadeAtiva, loading, signOut }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
