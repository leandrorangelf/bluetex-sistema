'use client'
import Modal from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message?: string
  loading?: boolean
}

export default function ConfirmDialog({ open, onClose, onConfirm, title = 'Confirmar exclusão', message = 'Esta ação não pode ser desfeita.', loading }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Excluindo...' : 'Excluir'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>{message}</p>
    </Modal>
  )
}
