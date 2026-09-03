'use client'

import { useAuth } from '@/lib/auth-context'
import VhsysSyncClient from './VhsysSyncClient'

export default function VhsysPage() {
  const { profile } = useAuth()

  if (profile?.role !== 'admin') {
    return (
      <div className="alert alert-red">
        A integração VHSYS é restrita a administradores.
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Integração VHSYS</h1>
          <div className="page-subtitle">
            NEW BLUETEX MG · Marco zero em 01/07/2026
          </div>
        </div>
      </div>
      <VhsysSyncClient />
    </div>
  )
}
