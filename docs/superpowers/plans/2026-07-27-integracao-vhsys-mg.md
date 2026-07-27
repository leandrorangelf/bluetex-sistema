# Integração VHSYS MG — Plano de Implementação

> **Para agentes de implementação:** SUB-HABILIDADE OBRIGATÓRIA: use
> `subagent-driven-development` (recomendado) ou `executing-plans` para executar
> este plano tarefa por tarefa. Os passos usam caixas de seleção (`- [ ]`) para
> acompanhamento.

**Objetivo:** Implementar uma sincronização manual e somente de leitura do VHSYS
para a unidade `NEW BLUETEX MG`, com prévia, conciliação, confirmação idempotente
e auditoria.

**Arquitetura:** Rotas Next.js executadas no servidor consultam o VHSYS usando
segredos de ambiente e a sessão autenticada do Supabase. Cada importador
normaliza seu domínio em itens de uma execução de análise; a confirmação aplica
somente itens aprovados por meio de funções transacionais no PostgreSQL.

**Stack:** Next.js 16 App Router, React 19, TypeScript estrito, Supabase
PostgreSQL/RLS, Vitest e Testing Library.

## Restrições globais

- Integração exclusivamente de leitura no VHSYS.
- Unidade atendida nesta fase: `NEW BLUETEX MG`.
- Marco zero: `2026-07-01`.
- Incluir contas a pagar e receber anteriores ao marco zero somente se abertas.
- Não importar histórico anterior já liquidado.
- Não apagar lançamentos manuais.
- Registros vinculados ao VHSYS não podem ser editados manualmente.
- Sincronização somente pelo botão **Sincronizar agora**.
- A análise não altera as tabelas finais.
- Credenciais nunca chegam ao navegador, ao banco ou aos logs.
- Saldo Santander vem de `saldo_atual` da conta ativa de código `033`.
- Repetir uma sincronização não pode criar duplicidades.

## Estrutura de arquivos

- `lib/supabase-server.ts`: cliente Supabase autenticado para código de servidor.
- `lib/vhsys/config.ts`: leitura e validação de segredos.
- `lib/vhsys/client.ts`: HTTP, autenticação, timeout e paginação.
- `lib/vhsys/types.ts`: contratos externos mínimos e modelos normalizados.
- `lib/vhsys/normalizers.ts`: conversão segura de datas, moeda, CNPJ e status.
- `lib/vhsys/importers/*.ts`: leitura de cada domínio sem persistência final.
- `lib/vhsys/reconcile.ts`: classificação contra registros locais.
- `lib/vhsys/analyze.ts`: orquestração da prévia.
- `lib/vhsys/confirm.ts`: validação e chamada das funções transacionais.
- `app/api/vhsys/analyze/route.ts`: criação de análise.
- `app/api/vhsys/sync/[id]/route.ts`: consulta da prévia.
- `app/api/vhsys/sync/[id]/confirm/route.ts`: confirmação.
- `app/integracoes/vhsys/page.tsx`: fluxo visual.
- `app/integracoes/vhsys/VhsysSyncClient.tsx`: estado interativo da tela.
- `supabase_schema.sql`: tabelas, índices, RLS e funções da integração.
- `tests/vhsys/*.test.ts`: testes unitários e de orquestração.

---

### Tarefa 1: Infraestrutura de testes e cliente Supabase do servidor

**Arquivos:**

- Modificar: `package.json`
- Criar: `vitest.config.ts`
- Criar: `tests/setup.ts`
- Criar: `lib/supabase-server.ts`
- Criar: `tests/supabase-server.test.ts`

**Interfaces:**

- Produz: `createServerSupabase(): Promise<SupabaseClient>`
- Produz: comandos `npm test` e `npm run test:watch`

- [ ] **Passo 1: instalar o ambiente de teste**

Executar:

```powershell
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

Adicionar a `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Passo 2: configurar o Vitest**

Criar `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
  },
})
```

Criar `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Passo 3: escrever o teste inicialmente falho**

Criar `tests/supabase-server.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

const createServerClient = vi.fn(() => ({ auth: {} }))
vi.mock('@supabase/ssr', () => ({ createServerClient }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [{ name: 'sb-token', value: 'abc' }],
    set: vi.fn(),
  })),
}))

describe('createServerSupabase', () => {
  it('cria o cliente com URL, chave pública e cookies da sessão', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    const { createServerSupabase } = await import('@/lib/supabase-server')

    await createServerSupabase()

    expect(createServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon',
      expect.objectContaining({ cookies: expect.any(Object) }),
    )
  })
})
```

- [ ] **Passo 4: comprovar que o teste falha**

Executar:

```powershell
npm test -- tests/supabase-server.test.ts
```

Esperado: falha porque `lib/supabase-server.ts` ainda não existe.

- [ ] **Passo 5: implementar o cliente**

Criar `lib/supabase-server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries) => {
          for (const { name, value, options } of entries) {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // Server Components não podem gravar cookies.
            }
          }
        },
      },
    },
  )
}
```

- [ ] **Passo 6: verificar e versionar**

Executar:

```powershell
npm test -- tests/supabase-server.test.ts
npm run build
```

Esperado: teste aprovado e build concluído.

```powershell
git add package.json package-lock.json vitest.config.ts tests/setup.ts tests/supabase-server.test.ts lib/supabase-server.ts
git commit -m "test: add server test foundation"
```

---

### Tarefa 2: Modelo de dados, auditoria e idempotência

**Arquivos:**

- Modificar: `supabase_schema.sql`
- Modificar: `types/index.ts`

**Interfaces:**

- Produz tabelas: `btx_vhsys_sincronizacoes`,
  `btx_vhsys_sincronizacao_itens`, `btx_vhsys_saldos_bancarios`
- Produz campos de origem nas tabelas finais.
- Produz RPC: `btx_confirmar_vhsys_dominio(p_sincronizacao UUID, p_dominio TEXT)`

- [ ] **Passo 1: adicionar colunas de rastreio às entidades finais**

Acrescentar ao fim de `supabase_schema.sql`, antes do marcador final:

```sql
ALTER TABLE btx_clientes ADD COLUMN IF NOT EXISTS origem_sistema TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem_sistema IN ('manual','vhsys'));
ALTER TABLE btx_clientes ADD COLUMN IF NOT EXISTS vhsys_id TEXT;
ALTER TABLE btx_clientes ADD COLUMN IF NOT EXISTS vhsys_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS btx_clientes_vhsys_uidx
  ON btx_clientes(unidade, vhsys_id) WHERE vhsys_id IS NOT NULL;

ALTER TABLE btx_fornecedores ADD COLUMN IF NOT EXISTS origem_sistema TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem_sistema IN ('manual','vhsys'));
ALTER TABLE btx_fornecedores ADD COLUMN IF NOT EXISTS vhsys_id TEXT;
ALTER TABLE btx_fornecedores ADD COLUMN IF NOT EXISTS vhsys_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS btx_fornecedores_vhsys_uidx
  ON btx_fornecedores(unidade, vhsys_id) WHERE vhsys_id IS NOT NULL;

ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS origem_sistema TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem_sistema IN ('manual','vhsys'));
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS vhsys_id_mg TEXT;
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS vhsys_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS btx_produtos_vhsys_mg_uidx
  ON btx_produtos(vhsys_id_mg) WHERE vhsys_id_mg IS NOT NULL;

ALTER TABLE btx_vendas ADD COLUMN IF NOT EXISTS origem_sistema TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem_sistema IN ('manual','vhsys'));
ALTER TABLE btx_vendas ADD COLUMN IF NOT EXISTS vhsys_id TEXT;
ALTER TABLE btx_vendas ADD COLUMN IF NOT EXISTS vhsys_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS btx_vendas_vhsys_uidx
  ON btx_vendas(unidade, vhsys_id) WHERE vhsys_id IS NOT NULL;

ALTER TABLE btx_compras ADD COLUMN IF NOT EXISTS origem_sistema TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem_sistema IN ('manual','vhsys'));
ALTER TABLE btx_compras ADD COLUMN IF NOT EXISTS vhsys_id TEXT;
ALTER TABLE btx_compras ADD COLUMN IF NOT EXISTS vhsys_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS btx_compras_vhsys_uidx
  ON btx_compras(unidade, vhsys_id) WHERE vhsys_id IS NOT NULL;

ALTER TABLE btx_parcelas ADD COLUMN IF NOT EXISTS origem_sistema TEXT NOT NULL DEFAULT 'manual'
  CHECK (origem_sistema IN ('manual','vhsys'));
ALTER TABLE btx_parcelas ADD COLUMN IF NOT EXISTS vhsys_id TEXT;
ALTER TABLE btx_parcelas ADD COLUMN IF NOT EXISTS vhsys_synced_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS btx_parcelas_vhsys_uidx
  ON btx_parcelas(unidade, tipo, vhsys_id) WHERE vhsys_id IS NOT NULL;
```

- [ ] **Passo 2: criar tabelas de análise e saldo**

Adicionar:

```sql
CREATE TABLE IF NOT EXISTS btx_vhsys_sincronizacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade = 'NEW BLUETEX MG'),
  marco_zero DATE NOT NULL DEFAULT '2026-07-01',
  status TEXT NOT NULL CHECK (status IN ('analisando','pronto','confirmando','concluido','falhou')),
  iniciado_por UUID NOT NULL REFERENCES auth.users(id),
  confirmado_por UUID REFERENCES auth.users(id),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  resumo JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro_sanitizado TEXT
);

CREATE TABLE IF NOT EXISTS btx_vhsys_sincronizacao_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sincronizacao_id UUID NOT NULL REFERENCES btx_vhsys_sincronizacoes(id) ON DELETE CASCADE,
  dominio TEXT NOT NULL CHECK (dominio IN ('vendas','compras','receber','pagar','estoque','bancos')),
  vhsys_id TEXT NOT NULL,
  classificacao TEXT NOT NULL CHECK (classificacao IN
    ('novo','ja_vinculado','correspondencia_exata','possivel_duplicidade','divergente','ignorado','erro')),
  decisao TEXT CHECK (decisao IN ('vincular','importar','ignorar')),
  local_id UUID,
  dados_normalizados JSONB NOT NULL,
  erro_sanitizado TEXT,
  aplicado_em TIMESTAMPTZ,
  UNIQUE(sincronizacao_id, dominio, vhsys_id)
);

CREATE TABLE IF NOT EXISTS btx_vhsys_saldos_bancarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade = 'NEW BLUETEX MG'),
  vhsys_banco_id TEXT NOT NULL,
  numero_banco TEXT NOT NULL,
  nome_banco TEXT NOT NULL,
  saldo_atual NUMERIC(14,2) NOT NULL,
  consultado_em TIMESTAMPTZ NOT NULL,
  sincronizacao_id UUID NOT NULL REFERENCES btx_vhsys_sincronizacoes(id),
  UNIQUE(sincronizacao_id, vhsys_banco_id)
);

ALTER TABLE btx_vhsys_sincronizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE btx_vhsys_sincronizacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE btx_vhsys_saldos_bancarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btx_admin_vhsys_sync" ON btx_vhsys_sincronizacoes
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
CREATE POLICY "btx_admin_vhsys_items" ON btx_vhsys_sincronizacao_itens
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
CREATE POLICY "btx_admin_vhsys_saldos" ON btx_vhsys_saldos_bancarios
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
```

- [ ] **Passo 3: criar teste SQL de idempotência**

No SQL Editor de homologação, executar duas vezes após aplicar o schema:

```sql
INSERT INTO btx_vendas
  (unidade, data_venda, valor_total, origem_sistema, vhsys_id)
VALUES
  ('NEW BLUETEX MG', '2026-07-01', 10, 'vhsys', 'teste-idempotencia');
```

Esperado: primeira execução insere; segunda falha em
`btx_vendas_vhsys_uidx`. Remover o registro:

```sql
DELETE FROM btx_vendas WHERE vhsys_id = 'teste-idempotencia';
```

- [ ] **Passo 4: atualizar os tipos do frontend**

Adicionar em `types/index.ts`:

```ts
export type OrigemSistema = 'manual' | 'vhsys'
export type SyncClassificacao =
  | 'novo' | 'ja_vinculado' | 'correspondencia_exata'
  | 'possivel_duplicidade' | 'divergente' | 'ignorado' | 'erro'
export type SyncDecisao = 'vincular' | 'importar' | 'ignorar'

export interface VhsysSincronizacao {
  id: string
  unidade: 'NEW BLUETEX MG'
  marco_zero: string
  status: 'analisando' | 'pronto' | 'confirmando' | 'concluido' | 'falhou'
  iniciado_em: string
  concluido_em: string | null
  resumo: Record<string, number>
  erro_sanitizado: string | null
}

export interface VhsysSincronizacaoItem {
  id: string
  dominio: 'vendas' | 'compras' | 'receber' | 'pagar' | 'estoque' | 'bancos'
  vhsys_id: string
  classificacao: SyncClassificacao
  decisao: SyncDecisao | null
  local_id: string | null
  dados_normalizados: Record<string, unknown>
  erro_sanitizado: string | null
}
```

Adicionar `origem_sistema`, `vhsys_id` e `vhsys_synced_at` às interfaces
`Cliente`, `Fornecedor`, `Venda`, `Compra` e `Parcela`; em `Produto`, usar
`vhsys_id_mg`.

- [ ] **Passo 5: verificar e versionar**

Executar:

```powershell
npx tsc --noEmit
```

Esperado: nenhum erro.

```powershell
git add supabase_schema.sql types/index.ts
git commit -m "feat: add VHSYS synchronization schema"
```

---

### Tarefa 3: Cliente VHSYS seguro, paginado e testável

**Arquivos:**

- Criar: `lib/vhsys/config.ts`
- Criar: `lib/vhsys/client.ts`
- Criar: `lib/vhsys/types.ts`
- Criar: `tests/vhsys/client.test.ts`
- Criar: `.env.example`

**Interfaces:**

- Produz: `getVhsysConfig(): VhsysConfig`
- Produz: `VhsysClient.list<T>(path, query): Promise<T[]>`
- Produz: `VhsysClient.get<T>(path, query): Promise<T>`

- [ ] **Passo 1: escrever testes falhos para segredo, cabeçalhos e paginação**

Criar `tests/vhsys/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VhsysClient } from '@/lib/vhsys/client'

afterEach(() => vi.unstubAllGlobals())

describe('VhsysClient', () => {
  it('envia tokens somente nos cabeçalhos do servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 200, status: 'success',
      paging: { total: 0, offset: 0, limit: 250, limit_max: 250 },
      data: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new VhsysClient({
      baseUrl: 'https://api.example.test',
      accessToken: 'access',
      secretAccessToken: 'secret',
      timeoutMs: 5000,
    })

    await client.list('/clientes')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain('access')
    expect(new Headers(init.headers).get('access-token')).toBe('access')
    expect(new Headers(init.headers).get('secret-access-token')).toBe('secret')
  })

  it('percorre todas as páginas sem repetir registros', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 200, status: 'success',
        paging: { total: 3, offset: 0, limit: 2, limit_max: 250 },
        data: [{ id: 1 }, { id: 2 }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 200, status: 'success',
        paging: { total: 3, offset: 2, limit: 2, limit_max: 250 },
        data: [{ id: 3 }],
      })))
    vi.stubGlobal('fetch', fetchMock)
    const client = new VhsysClient({
      baseUrl: 'https://api.example.test',
      accessToken: 'access',
      secretAccessToken: 'secret',
      timeoutMs: 5000,
    })

    await expect(client.list<{ id: number }>('/pedidos', {}, 2))
      .resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Passo 2: executar e confirmar a falha**

Executar:

```powershell
npm test -- tests/vhsys/client.test.ts
```

Esperado: falha por módulos inexistentes.

- [ ] **Passo 3: definir contratos e configuração**

Criar `lib/vhsys/types.ts`:

```ts
export interface VhsysConfig {
  baseUrl: string
  accessToken: string
  secretAccessToken: string
  partnerToken?: string
  timeoutMs: number
}

export interface VhsysListResponse<T> {
  code: number | string
  status: string
  paging?: {
    total?: number | string
    total_count?: number | string
    offset?: number | string
    limit?: number | string
    limit_max?: number | string
  }
  data: T[]
}
```

Criar `lib/vhsys/config.ts`:

```ts
import 'server-only'
import type { VhsysConfig } from './types'

export function getVhsysConfig(): VhsysConfig {
  const baseUrl = process.env.VHSYS_API_BASE_URL
  const accessToken = process.env.VHSYS_ACCESS_TOKEN
  const secretAccessToken = process.env.VHSYS_SECRET_ACCESS_TOKEN
  if (!baseUrl || !accessToken || !secretAccessToken) {
    throw new Error('Configuração VHSYS incompleta')
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    accessToken,
    secretAccessToken,
    partnerToken: process.env.VHSYS_PARTNER_TOKEN,
    timeoutMs: 15_000,
  }
}
```

- [ ] **Passo 4: implementar cliente e paginação**

Criar `lib/vhsys/client.ts`:

```ts
import 'server-only'
import type { VhsysConfig, VhsysListResponse } from './types'

export class VhsysClient {
  constructor(private readonly config: VhsysConfig) {}

  private async request<T>(path: string, query: Record<string, string | number> = {}) {
    const url = new URL(`${this.config.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value))
    }
    const headers = new Headers({
      'access-token': this.config.accessToken,
      'secret-access-token': this.config.secretAccessToken,
      'Cache-Control': 'no-cache',
      'User-Agent': 'BluetexSistema/1.0',
      'Content-Type': 'application/json',
    })
    if (this.config.partnerToken) headers.set('partner-token', this.config.partnerToken)
    const response = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(this.config.timeoutMs),
    })
    if (!response.ok) throw new Error(`VHSYS_HTTP_${response.status}`)
    return response.json() as Promise<T>
  }

  async get<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    const response = await this.request<{ data: T }>(path, query)
    return response.data
  }

  async list<T>(
    path: string,
    query: Record<string, string | number> = {},
    pageSize = 250,
  ): Promise<T[]> {
    const result: T[] = []
    let offset = 0
    for (;;) {
      const page = await this.request<VhsysListResponse<T>>(path, {
        ...query, limit: pageSize, offset,
      })
      result.push(...page.data)
      const total = Number(page.paging?.total_count ?? page.paging?.total ?? result.length)
      if (page.data.length === 0 || result.length >= total) return result
      offset += page.data.length
    }
  }
}
```

- [ ] **Passo 5: documentar nomes de variáveis sem valores**

Criar `.env.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
VHSYS_API_BASE_URL=
VHSYS_ACCESS_TOKEN=
VHSYS_SECRET_ACCESS_TOKEN=
VHSYS_PARTNER_TOKEN=
```

- [ ] **Passo 6: verificar e versionar**

Executar:

```powershell
npm test -- tests/vhsys/client.test.ts
npx tsc --noEmit
```

Esperado: testes aprovados e nenhum erro de tipos.

```powershell
git add lib/vhsys tests/vhsys/client.test.ts .env.example
git commit -m "feat: add secure VHSYS API client"
```

---

### Tarefa 4: Normalização e regras do marco zero

**Arquivos:**

- Criar: `lib/vhsys/normalizers.ts`
- Criar: `tests/vhsys/normalizers.test.ts`

**Interfaces:**

- Produz: `money(value): number`
- Produz: `isoDate(value): string | null`
- Produz: `digits(value): string`
- Produz: `isOpen(value): boolean`
- Produz: `includeDocument(date, status): boolean`
- Produz: `includeAccount(liquidated): boolean`

- [ ] **Passo 1: escrever os testes das regras**

Criar `tests/vhsys/normalizers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  digits, includeAccount, includeDocument, isoDate, isOpen, money,
} from '@/lib/vhsys/normalizers'

describe('normalização VHSYS', () => {
  it('converte moeda sem erro binário de origem textual', () => {
    expect(money('1234.56')).toBe(1234.56)
    expect(money(null)).toBe(0)
  })
  it('rejeita datas zeradas', () => {
    expect(isoDate('0000-00-00')).toBeNull()
    expect(isoDate('2026-07-01 10:00:00')).toBe('2026-07-01')
  })
  it('normaliza documento', () => {
    expect(digits('12.345.678/0001-99')).toBe('12345678000199')
  })
  it('inclui somente documentos válidos desde o marco', () => {
    expect(includeDocument('2026-07-01', 'Faturado')).toBe(true)
    expect(includeDocument('2026-06-30', 'Faturado')).toBe(false)
    expect(includeDocument('2026-07-02', 'Cancelado')).toBe(false)
  })
  it('inclui contas abertas independentemente da data', () => {
    expect(includeAccount('Nao')).toBe(true)
    expect(includeAccount('Sim')).toBe(false)
    expect(isOpen('Em aberto')).toBe(true)
  })
})
```

- [ ] **Passo 2: executar e confirmar a falha**

Executar:

```powershell
npm test -- tests/vhsys/normalizers.test.ts
```

Esperado: falha porque o módulo não existe.

- [ ] **Passo 3: implementar as regras**

Criar `lib/vhsys/normalizers.ts`:

```ts
export const VHSYS_ZERO_DATE = '2026-07-01'

export function money(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.startsWith('0000-00-00')) return null
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

export function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function isOpen(value: unknown): boolean {
  return ['nao', 'não', 'em aberto', 'aberto', 'pendente']
    .includes(String(value ?? '').trim().toLocaleLowerCase('pt-BR'))
}

export function includeDocument(date: unknown, status: unknown): boolean {
  const normalized = isoDate(date)
  const state = String(status ?? '').toLocaleLowerCase('pt-BR')
  return normalized !== null
    && normalized >= VHSYS_ZERO_DATE
    && !state.includes('cancel')
    && (state.includes('fatur') || state.includes('emit'))
}

export function includeAccount(liquidated: unknown): boolean {
  return isOpen(liquidated)
}
```

- [ ] **Passo 4: verificar e versionar**

Executar:

```powershell
npm test -- tests/vhsys/normalizers.test.ts
```

Esperado: cinco testes aprovados.

```powershell
git add lib/vhsys/normalizers.ts tests/vhsys/normalizers.test.ts
git commit -m "feat: add VHSYS import rules"
```

---

### Tarefa 5: Importadores por domínio

**Arquivos:**

- Criar: `lib/vhsys/importers/shared.ts`
- Criar: `lib/vhsys/importers/vendas.ts`
- Criar: `lib/vhsys/importers/compras.ts`
- Criar: `lib/vhsys/importers/financeiro.ts`
- Criar: `lib/vhsys/importers/estoque.ts`
- Criar: `lib/vhsys/importers/bancos.ts`
- Criar: `tests/vhsys/importers.test.ts`

**Interfaces:**

- Consome: `VhsysClient`
- Produz: `ImportedItem[]`
- Produz: `importAllDomains(client): Promise<DomainResult[]>`

- [ ] **Passo 1: definir o contrato compartilhado**

Criar `lib/vhsys/importers/shared.ts`:

```ts
import type { VhsysClient } from '../client'

export type VhsysDomain = 'vendas' | 'compras' | 'receber' | 'pagar' | 'estoque' | 'bancos'

export interface ImportedItem {
  domain: VhsysDomain
  externalId: string
  data: Record<string, unknown>
}

export interface DomainResult {
  domain: VhsysDomain
  items: ImportedItem[]
  error: string | null
}

export type DomainImporter = (client: VhsysClient) => Promise<ImportedItem[]>
```

- [ ] **Passo 2: escrever teste de filtragem e isolamento de falhas**

Criar `tests/vhsys/importers.test.ts` com um cliente falso que retorne:

```ts
import { describe, expect, it, vi } from 'vitest'
import { importVendas } from '@/lib/vhsys/importers/vendas'
import { importBancos } from '@/lib/vhsys/importers/bancos'

describe('importadores VHSYS', () => {
  it('mantém apenas vendas faturadas desde o marco zero', async () => {
    const client = {
      list: vi.fn().mockResolvedValue([
        { id_pedido: 1, data_pedido: '2026-06-30', status_pedido: 'Faturado' },
        { id_pedido: 2, data_pedido: '2026-07-01', status_pedido: 'Faturado' },
        { id_pedido: 3, data_pedido: '2026-07-02', status_pedido: 'Cancelado' },
      ]),
    }
    const result = await importVendas(client as never)
    expect(result.map(item => item.externalId)).toEqual(['2'])
  })

  it('retorna somente contas Santander ativas', async () => {
    const client = {
      list: vi.fn().mockResolvedValue([
        { id_banco_cad: 1, numero_banco: '033', status_banco: 'Ativo', saldo_atual: '50.10' },
        { id_banco_cad: 2, numero_banco: '001', status_banco: 'Ativo', saldo_atual: '99.00' },
      ]),
    }
    const result = await importBancos(client as never)
    expect(result).toHaveLength(1)
    expect(result[0].data.saldo_atual).toBe(50.1)
  })
})
```

- [ ] **Passo 3: executar e confirmar a falha**

Executar:

```powershell
npm test -- tests/vhsys/importers.test.ts
```

Esperado: falha por importadores inexistentes.

- [ ] **Passo 4: implementar vendas e bancos**

Criar `lib/vhsys/importers/vendas.ts`:

```ts
import { includeDocument, money, isoDate } from '../normalizers'
import type { VhsysClient } from '../client'
import type { ImportedItem } from './shared'

export async function importVendas(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/pedidos')
  return rows
    .filter(row => includeDocument(row.data_pedido, row.status_pedido))
    .map(row => ({
      domain: 'vendas',
      externalId: String(row.id_pedido),
      data: {
        numero_documento: String(row.id_pedido),
        documento_pessoa: '',
        pessoa_nome: String(row.nome_cliente ?? ''),
        data: isoDate(row.data_pedido),
        cliente_vhsys_id: String(row.id_cliente ?? ''),
        cliente_nome: String(row.nome_cliente ?? ''),
        data_venda: isoDate(row.data_pedido),
        valor_total: money(row.valor_total_nota),
        valor_st: money(row.valor_ST),
        status: String(row.status_pedido ?? ''),
      },
    }))
}
```

Criar `lib/vhsys/importers/bancos.ts`:

```ts
import { money } from '../normalizers'
import type { VhsysClient } from '../client'
import type { ImportedItem } from './shared'

export async function importBancos(client: VhsysClient): Promise<ImportedItem[]> {
  const rows = await client.list<Record<string, unknown>>('/contas-bancarias')
  return rows
    .filter(row => String(row.numero_banco) === '033' && String(row.status_banco) === 'Ativo')
    .map(row => ({
      domain: 'bancos',
      externalId: String(row.id_banco_cad),
      data: {
        numero_banco: '033',
        nome_banco: String(row.nome_banco_cad ?? 'Santander'),
        saldo_atual: money(row.saldo_atual),
        consultado_em: new Date().toISOString(),
      },
    }))
}
```

- [ ] **Passo 5: implementar compras, financeiro e estoque**

Em `compras.ts`, consultar `/entradas-mercadoria`, aplicar
`includeDocument(data_pedido, status_pedido)` e normalizar fornecedor, data,
número, total, ST e itens. Em `financeiro.ts`, consultar `/contas-receber` e
`/contas-pagar`, mantendo somente `includeAccount(liquidado_rec)` e
`includeAccount(liquidado_pag)`. Em `estoque.ts`, listar `/produtos` e, para
cada produto ativo, consultar `/produtos/{id_prod}/estoque`; reduzir entradas e
saídas por produto e devolver uma posição única:

```ts
const signedQuantity = tipo === 'Saida' ? -Math.abs(quantity) : Math.abs(quantity)
```

Cada arquivo exporta exatamente:

```ts
export async function importCompras(client: VhsysClient): Promise<ImportedItem[]>
export async function importReceber(client: VhsysClient): Promise<ImportedItem[]>
export async function importPagar(client: VhsysClient): Promise<ImportedItem[]>
export async function importEstoque(client: VhsysClient): Promise<ImportedItem[]>
```

Não presumir nomes adicionais: antes de finalizar esta tarefa, executar uma
consulta real de análise com um registro por endpoint, sem persistir payloads, e
ajustar somente os mapeamentos aos nomes documentados/retornados.

- [ ] **Passo 6: verificar e versionar**

Executar:

```powershell
npm test -- tests/vhsys/importers.test.ts
npx tsc --noEmit
```

Esperado: testes aprovados e tipos válidos.

```powershell
git add lib/vhsys/importers tests/vhsys/importers.test.ts
git commit -m "feat: add VHSYS domain importers"
```

---

### Tarefa 6: Conciliação determinística

**Arquivos:**

- Criar: `lib/vhsys/reconcile.ts`
- Criar: `tests/vhsys/reconcile.test.ts`

**Interfaces:**

- Produz: `reconcileItem(external, locals): ReconciledItem`

- [ ] **Passo 1: escrever a matriz de testes**

Criar `tests/vhsys/reconcile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reconcileItem } from '@/lib/vhsys/reconcile'

const external = {
  domain: 'vendas' as const,
  externalId: '10',
  data: {
    numero_documento: '100',
    documento_pessoa: '12345678000199',
    data: '2026-07-10',
    pessoa_nome: 'Cliente A',
    valor_total: 250,
  },
}

describe('reconcileItem', () => {
  it('prioriza vínculo por ID VHSYS', () => {
    const result = reconcileItem(external, [{
      id: 'local-1', vhsys_id: '10', numero_documento: null,
      documento_pessoa: null, data: null, pessoa_nome: null, valor_total: 0,
    }])
    expect(result.classification).toBe('ja_vinculado')
  })
  it('reconhece documento, CNPJ e valor como exatos', () => {
    const result = reconcileItem(external, [{
      id: 'local-2', vhsys_id: null, numero_documento: '100',
      documento_pessoa: '12345678000199', data: '2026-07-09',
      pessoa_nome: 'Outro', valor_total: 250,
    }])
    expect(result.classification).toBe('correspondencia_exata')
  })
  it('marca data, pessoa e valor como possível duplicidade', () => {
    const result = reconcileItem(external, [{
      id: 'local-3', vhsys_id: null, numero_documento: null,
      documento_pessoa: null, data: '2026-07-10',
      pessoa_nome: 'Cliente A', valor_total: 250,
    }])
    expect(result.classification).toBe('possivel_duplicidade')
  })
  it('classifica ausência de candidato como novo', () => {
    expect(reconcileItem(external, []).classification).toBe('novo')
  })
})
```

- [ ] **Passo 2: executar e confirmar a falha**

Executar:

```powershell
npm test -- tests/vhsys/reconcile.test.ts
```

Esperado: falha porque `reconcileItem` não existe.

- [ ] **Passo 3: implementar a precedência**

Criar `lib/vhsys/reconcile.ts` com tipos explícitos e comparações nesta ordem:

```ts
import type { ImportedItem } from './importers/shared'

export interface LocalCandidate {
  id: string
  vhsys_id: string | null
  numero_documento: string | null
  documento_pessoa: string | null
  data: string | null
  pessoa_nome: string | null
  valor_total: number
}

export interface ReconciledItem extends ImportedItem {
  classification: 'novo' | 'ja_vinculado' | 'correspondencia_exata' | 'possivel_duplicidade'
  localId: string | null
}

export function reconcileItem(
  external: ImportedItem,
  locals: LocalCandidate[],
): ReconciledItem {
  const d = external.data
  const linked = locals.find(local => local.vhsys_id === external.externalId)
  if (linked) return { ...external, classification: 'ja_vinculado', localId: linked.id }
  const exact = locals.find(local =>
    local.numero_documento === d.numero_documento
    && local.documento_pessoa === d.documento_pessoa
    && Number(local.valor_total) === Number(d.valor_total),
  )
  if (exact) return { ...external, classification: 'correspondencia_exata', localId: exact.id }
  const possible = locals.find(local =>
    local.data === d.data
    && local.pessoa_nome === d.pessoa_nome
    && Number(local.valor_total) === Number(d.valor_total),
  )
  if (possible) {
    return { ...external, classification: 'possivel_duplicidade', localId: possible.id }
  }
  return { ...external, classification: 'novo', localId: null }
}
```

- [ ] **Passo 4: verificar e versionar**

Executar:

```powershell
npm test -- tests/vhsys/reconcile.test.ts
```

Esperado: quatro testes aprovados.

```powershell
git add lib/vhsys/reconcile.ts tests/vhsys/reconcile.test.ts
git commit -m "feat: add VHSYS reconciliation rules"
```

---

### Tarefa 7: API de análise, consulta e confirmação

**Arquivos:**

- Criar: `lib/vhsys/analyze.ts`
- Criar: `lib/vhsys/confirm.ts`
- Criar: `app/api/vhsys/analyze/route.ts`
- Criar: `app/api/vhsys/sync/[id]/route.ts`
- Criar: `app/api/vhsys/sync/[id]/confirm/route.ts`
- Criar: `tests/vhsys/routes.test.ts`
- Modificar: `supabase_schema.sql`

**Interfaces:**

- Produz: `POST /api/vhsys/analyze`
- Produz: `GET /api/vhsys/sync/:id`
- Produz: `POST /api/vhsys/sync/:id/confirm`

- [ ] **Passo 1: escrever testes de autorização**

Em `tests/vhsys/routes.test.ts`, simular `createServerSupabase()` com:

```ts
auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
```

Importar cada handler e comprovar que responde `401`. Simular usuário com perfil
`role = unidade` e comprovar `403`. Simular `role = admin`, validar que a análise
é criada apenas para `NEW BLUETEX MG`.

- [ ] **Passo 2: implementar guarda compartilhada**

Em cada rota, obter usuário e perfil:

```ts
const supabase = await createServerSupabase()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 })
const { data: profile } = await supabase
  .from('btx_profiles').select('role').eq('id', user.id).single()
if (profile?.role !== 'admin') {
  return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
}
```

- [ ] **Passo 3: implementar análise**

`POST /api/vhsys/analyze` executa esta sequência:

1. criar `btx_vhsys_sincronizacoes` com status `analisando`;
2. instanciar `VhsysClient(getVhsysConfig())`;
3. executar importadores de forma independente;
4. consultar candidatos locais por domínio;
5. reconciliar e inserir `btx_vhsys_sincronizacao_itens`;
6. marcar possíveis duplicidades sem decisão;
7. escolher automaticamente `importar` para novos e `vincular` para
   `ja_vinculado`/`correspondencia_exata`;
8. deixar bancos sem decisão quando houver mais de uma conta Santander;
9. atualizar resumo e status para `pronto`;
10. sanitizar falhas como códigos (`VHSYS_HTTP_401`, `VHSYS_HTTP_403`,
    `VHSYS_TIMEOUT`) sem payload ou cabeçalhos.

- [ ] **Passo 4: implementar consulta**

`GET /api/vhsys/sync/[id]` retorna execução e itens, sempre filtrando por
`unidade = 'NEW BLUETEX MG'`. O formato será:

```ts
{
  sync: VhsysSincronizacao,
  items: VhsysSincronizacaoItem[],
}
```

- [ ] **Passo 5: implementar confirmação transacional por domínio**

Adicionar a `supabase_schema.sql` a função
`btx_confirmar_vhsys_dominio(p_sincronizacao UUID, p_dominio TEXT)`, com esta
sequência obrigatória:

1. bloquear a execução com `SELECT ... FOR UPDATE`;
2. rejeitar status diferente de `pronto` ou `confirmando`;
3. rejeitar itens `possivel_duplicidade` ou `divergente` sem decisão;
4. processar somente itens do domínio indicado;
5. para `vincular`, atualizar `origem_sistema`, `vhsys_id` e
   `vhsys_synced_at` do `local_id`;
6. para `importar`, inserir ou atualizar pela chave externa única;
7. para `ignorar`, não alterar tabela final;
8. marcar `aplicado_em`;
9. para bancos, inserir fotografia em `btx_vhsys_saldos_bancarios`;
10. não montar SQL dinâmico com nomes recebidos do cliente; usar blocos
    explícitos para cada um dos seis valores permitidos de `p_dominio`;
11. ser `SECURITY INVOKER`, preservando RLS.

As inserções de venda/compra também devem substituir seus itens dentro da mesma
transação e resolver clientes, fornecedores e produtos por ID externo antes de
gravar as FKs.

- [ ] **Passo 6: implementar rota de confirmação**

`POST /api/vhsys/sync/[id]/confirm` recebe:

```ts
{
  decisions: Array<{
    itemId: string
    decision: 'vincular' | 'importar' | 'ignorar'
    localId?: string
  }>
}
```

Validar que cada item pertence à execução, persistir as decisões, alterar status
para `confirmando`, chamar a RPC em ordem:

```ts
['vendas', 'compras', 'receber', 'pagar', 'estoque', 'bancos']
```

Registrar resultado individual no `resumo`. Ao final, marcar `concluido`; se um
domínio falhar, manter os anteriores e registrar `falhou` somente para o domínio
no resumo, permitindo repetição idempotente.

- [ ] **Passo 7: verificar e versionar**

Executar:

```powershell
npm test -- tests/vhsys/routes.test.ts
npm test
npx tsc --noEmit
```

Esperado: todos os testes aprovados.

```powershell
git add lib/vhsys/analyze.ts lib/vhsys/confirm.ts app/api/vhsys tests/vhsys/routes.test.ts supabase_schema.sql
git commit -m "feat: add VHSYS analysis and confirmation API"
```

---

### Tarefa 8: Tela de sincronização e resolução de conflitos

**Arquivos:**

- Criar: `app/integracoes/vhsys/layout.tsx`
- Criar: `app/integracoes/vhsys/page.tsx`
- Criar: `app/integracoes/vhsys/VhsysSyncClient.tsx`
- Criar: `tests/vhsys/sync-ui.test.tsx`
- Modificar: `components/Sidebar.tsx`
- Modificar: `app/globals.css`

**Interfaces:**

- Consome as três rotas da tarefa 7.
- Produz fluxo Analisar → Resolver → Confirmar → Resultado.

- [ ] **Passo 1: escrever o teste do fluxo crítico**

Em `tests/vhsys/sync-ui.test.tsx`, renderizar `VhsysSyncClient`, simular
`fetch` e comprovar:

- botão inicial com texto `Sincronizar agora`;
- resumo com contagens por classificação;
- botão Confirmar desabilitado enquanto houver conflito sem decisão;
- seleção `Vincular`, `Importar separado` ou `Ignorar`;
- confirmação exige segundo clique explícito;
- mensagem final apresenta quantidades aplicadas e erros.

- [ ] **Passo 2: criar página restrita à MG**

`page.tsx` deve carregar usuário/perfil no servidor. Se não for admin, usar
`redirect('/dashboard')`. Renderizar texto fixo:

```tsx
<h1>Integração VHSYS</h1>
<p>Unidade NEW BLUETEX MG · Marco zero 01/07/2026</p>
<VhsysSyncClient />
```

- [ ] **Passo 3: implementar estados da interface**

`VhsysSyncClient.tsx` deve usar a máquina de estados:

```ts
type UiState = 'idle' | 'analyzing' | 'review' | 'confirming' | 'done' | 'error'
```

Durante `analyzing` e `confirming`, desabilitar botões. Agrupar itens por domínio
e classificação. Mostrar dados de comparação sem payload bruto. Exibir
explicitamente:

- novos;
- já vinculados;
- correspondências exatas;
- possíveis duplicidades;
- divergentes;
- ignorados;
- erros.

Para bancos, se houver mais de uma conta Santander, exigir seleção de uma e
marcar as demais como ignoradas.

- [ ] **Passo 4: adicionar navegação e estilo**

Em `components/Sidebar.tsx`, adicionar na seção Financeiro:

```ts
{ href: '/integracoes/vhsys', label: 'Integração VHSYS' },
```

Em `app/globals.css`, adicionar somente classes específicas para grade de
resumo, selo de origem, tabela de conflitos e estados de erro/sucesso, respeitando
as variáveis e padrões já existentes.

- [ ] **Passo 5: verificar e versionar**

Executar:

```powershell
npm test -- tests/vhsys/sync-ui.test.tsx
npm run build
```

Esperado: teste aprovado e build concluído.

```powershell
git add app/integracoes/vhsys components/Sidebar.tsx app/globals.css tests/vhsys/sync-ui.test.tsx
git commit -m "feat: add VHSYS synchronization interface"
```

---

### Tarefa 9: Bloqueio de edição e projeção financeira

**Arquivos:**

- Modificar: `app/clientes/page.tsx`
- Modificar: `app/fornecedores/page.tsx`
- Modificar: `app/produtos/page.tsx`
- Modificar: `app/vendas/page.tsx`
- Modificar: `app/compras/page.tsx`
- Modificar: `app/parcelas-pagar/page.tsx`
- Modificar: `app/parcelas-receber/page.tsx`
- Modificar: `app/caixa/page.tsx`
- Criar: `lib/finance/projection.ts`
- Criar: `tests/vhsys/read-only.test.tsx`
- Criar: `tests/finance/projection.test.ts`

**Interfaces:**

- Produz: `projectedBalance(current, receivable, payable): number`
- Consome: `origem_sistema === 'vhsys'`

- [ ] **Passo 1: testar a projeção sem dupla contagem**

Criar `tests/finance/projection.test.ts`:

```ts
import { expect, it } from 'vitest'
import { projectedBalance } from '@/lib/finance/projection'

it('calcula saldo + receber - pagar', () => {
  expect(projectedBalance(1000, 500, 250)).toBe(1250)
})
```

Criar `lib/finance/projection.ts`:

```ts
export function projectedBalance(
  currentBalance: number,
  openReceivable: number,
  openPayable: number,
): number {
  return Math.round((currentBalance + openReceivable - openPayable) * 100) / 100
}
```

- [ ] **Passo 2: testar bloqueio visual**

Criar teste com um registro `origem_sistema: 'vhsys'` e comprovar que os botões
Editar/Excluir não são renderizados ou ficam desabilitados com o título
`Gerenciado pelo VHSYS`.

- [ ] **Passo 3: aplicar bloqueio em todas as páginas**

Incluir campos de origem nos `select('*')`. Para registros VHSYS:

- mostrar selo `VHSYS`;
- impedir abertura do modal de edição;
- impedir exclusão;
- manter visualização;
- adicionar guarda na própria função de salvar/excluir, não apenas no botão.

Exemplo de guarda:

```ts
if (registro.origem_sistema === 'vhsys') {
  setErro('Este registro é gerenciado pelo VHSYS e não pode ser alterado aqui.')
  return
}
```

- [ ] **Passo 4: atualizar Caixa Mensal**

Em `app/caixa/page.tsx`, consultar a fotografia mais recente do Santander,
somar parcelas abertas a receber, subtrair parcelas abertas a pagar e exibir:

- saldo atual Santander;
- total a receber;
- total a pagar;
- saldo projetado;
- data/hora da fotografia.

Não somar compras nem vendas separadamente.

- [ ] **Passo 5: verificar e versionar**

Executar:

```powershell
npm test -- tests/vhsys/read-only.test.tsx tests/finance/projection.test.ts
npm run build
```

Esperado: testes aprovados e build concluído.

```powershell
git add app/clientes app/fornecedores app/produtos app/vendas app/compras app/parcelas-pagar app/parcelas-receber app/caixa lib/finance tests
git commit -m "feat: enforce VHSYS read-only records"
```

---

### Tarefa 10: Validação real em modo análise e documentação operacional

**Arquivos:**

- Criar: `docs/vhsys-operacao.md`
- Modificar: `.gitignore`

**Interfaces:**

- Produz procedimento seguro para configurar, analisar, comparar e confirmar.

- [ ] **Passo 1: proteger arquivos de ambiente**

Confirmar em `.gitignore`:

```gitignore
.env
.env.local
.env.*.local
!.env.example
```

Executar:

```powershell
git grep -n -E "VHSYS_(ACCESS_TOKEN|SECRET_ACCESS_TOKEN)=.+" -- . ':!docs/superpowers'
```

Esperado: nenhuma ocorrência.

- [ ] **Passo 2: documentar operação**

Criar `docs/vhsys-operacao.md` com:

- onde cadastrar os quatro nomes de variável;
- como abrir Integração VHSYS;
- significado de cada classificação;
- como decidir conflitos;
- como identificar uma ou várias contas Santander;
- como comparar contagens e totais com o VHSYS;
- como repetir uma execução com falha;
- afirmação de que nenhum endpoint de escrita é usado;
- procedimento de rotação imediata se um segredo for exposto.

- [ ] **Passo 3: executar suíte completa**

Executar:

```powershell
npm test
npm run build
git diff --check
```

Esperado: todos os testes aprovados, build concluído e nenhuma falha de
whitespace.

- [ ] **Passo 4: executar a primeira análise real**

Configurar os segredos no ambiente de implantação, acessar como administrador,
selecionar MG e clicar **Sincronizar agora**. Não confirmar.

Comparar no VHSYS:

- quantidade e total de contas a receber abertas;
- quantidade e total de contas a pagar abertas;
- quantidade e total de vendas faturadas desde 01/07/2026;
- quantidade e total de entradas desde 01/07/2026;
- posição dos produtos;
- `saldo_atual` da conta Santander escolhida.

Esperado: totais iguais ou diferenças explicadas na lista de conflitos.

- [ ] **Passo 5: confirmar em backup e validar idempotência**

Antes da confirmação, criar backup do banco Supabase. Confirmar a carga e repetir
imediatamente uma nova análise.

Esperado na segunda análise:

- zero novos registros para dados inalterados;
- itens anteriores classificados como `ja_vinculado`;
- nenhuma duplicidade criada;
- mesma posição de estoque e saldo bancário mais recente.

- [ ] **Passo 6: versionar documentação**

```powershell
git add .gitignore docs/vhsys-operacao.md
git commit -m "docs: add VHSYS synchronization runbook"
```

## Verificação final

Executar:

```powershell
npm test
npm run build
git status --short
```

Esperado: testes e build aprovados. O status deve conter apenas alterações
preexistentes e conscientemente preservadas. Confirmar manualmente que:

- nenhum token aparece em fonte do navegador, rede cliente, logs ou banco;
- nenhuma requisição `POST`, `PUT`, `PATCH` ou `DELETE` é enviada ao VHSYS;
- dados manuais continuam presentes;
- registros VHSYS estão bloqueados;
- contas antigas abertas aparecem;
- contas antigas liquidadas não aparecem;
- posição projetada usa exatamente saldo + receber − pagar.
