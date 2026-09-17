// Monograma "NB" com a seta ascendente, inspirado na logo da New Bluetex.
// currentColor deixa herdar a cor do container (branco na sidebar escura,
// navy no login claro).
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 120 86" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text x="0" y="70" fontFamily="Arial, Helvetica, sans-serif" fontWeight={800} fontSize="80" fill="currentColor">N</text>
      <text x="54" y="70" fontFamily="Arial, Helvetica, sans-serif" fontWeight={800} fontSize="80" fill="currentColor">B</text>
      <path d="M14 62 L62 14 M62 14 L44 18 M62 14 L58 32" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export default function Logo({ tamanho = 'md', cor = 'claro' }: { tamanho?: 'sm' | 'md' | 'lg'; cor?: 'claro' | 'escuro' }) {
  const px = tamanho === 'sm' ? 22 : tamanho === 'lg' ? 44 : 30
  const nomeCor = cor === 'claro' ? '#fff' : 'var(--navy)'
  const subCor = cor === 'claro' ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: nomeCor }}>
      <LogoMark size={px} />
      <div>
        <div style={{ fontSize: tamanho === 'lg' ? 22 : tamanho === 'sm' ? 14 : 17, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.05, color: nomeCor }}>
          NEW BLUETEX
        </div>
        <div style={{ fontSize: tamanho === 'lg' ? 11 : 9, fontWeight: 600, letterSpacing: '0.22em', color: subCor, marginTop: 2 }}>
          DISTRIBUIDORA
        </div>
      </div>
    </div>
  )
}
