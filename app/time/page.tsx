import { redirect } from 'next/navigation'
// O quadro de atividades agora vive fora do ERP, em /quadro.
export default function Page() { redirect('/quadro') }
