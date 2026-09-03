-- ============================================================
-- Migração: Integração VHSYS MG (somente leitura)
-- Rodar uma vez no SQL Editor do Supabase, com backup antes.
-- Tudo idempotente (IF NOT EXISTS / OR REPLACE) — seguro reexecutar.
-- ============================================================

-- Colunas de origem nas entidades finais (idempotentes)
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

-- Tabelas de análise, saldo bancário e posição de estoque
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

CREATE TABLE IF NOT EXISTS btx_vhsys_estoque_atual (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade TEXT NOT NULL CHECK (unidade = 'NEW BLUETEX MG'),
  produto_id UUID NOT NULL REFERENCES btx_produtos(id),
  vhsys_produto_id TEXT NOT NULL,
  quantidade_atual NUMERIC(14,4) NOT NULL,
  consultado_em TIMESTAMPTZ NOT NULL,
  sincronizacao_id UUID NOT NULL REFERENCES btx_vhsys_sincronizacoes(id),
  UNIQUE(sincronizacao_id, vhsys_produto_id)
);

ALTER TABLE btx_vhsys_sincronizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE btx_vhsys_sincronizacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE btx_vhsys_saldos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE btx_vhsys_estoque_atual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "btx_admin_vhsys_sync" ON btx_vhsys_sincronizacoes;
DROP POLICY IF EXISTS "btx_admin_vhsys_items" ON btx_vhsys_sincronizacao_itens;
DROP POLICY IF EXISTS "btx_admin_vhsys_saldos" ON btx_vhsys_saldos_bancarios;
DROP POLICY IF EXISTS "btx_admin_vhsys_estoque" ON btx_vhsys_estoque_atual;
CREATE POLICY "btx_admin_vhsys_sync" ON btx_vhsys_sincronizacoes
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
CREATE POLICY "btx_admin_vhsys_items" ON btx_vhsys_sincronizacao_itens
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
CREATE POLICY "btx_admin_vhsys_saldos" ON btx_vhsys_saldos_bancarios
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
CREATE POLICY "btx_admin_vhsys_estoque" ON btx_vhsys_estoque_atual
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');

-- Upsert de produto por id externo, preenchendo as unidades de medida exigidas.
CREATE OR REPLACE FUNCTION btx_vhsys_upsert_produto(p_nome TEXT, p_vhsys_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id UUID;
  v_base UUID;
  v_maior UUID;
BEGIN
  SELECT id INTO v_id FROM btx_produtos WHERE vhsys_id_mg = p_vhsys_id;
  IF v_id IS NOT NULL THEN
    UPDATE btx_produtos SET nome = COALESCE(NULLIF(p_nome,''), nome), ativo = TRUE,
      origem_sistema = 'vhsys', vhsys_synced_at = NOW() WHERE id = v_id;
    RETURN v_id;
  END IF;
  SELECT id INTO v_base FROM btx_unidades_medida WHERE nome = 'Carteira' LIMIT 1;
  SELECT id INTO v_maior FROM btx_unidades_medida WHERE nome = 'Caixa' LIMIT 1;
  INSERT INTO btx_produtos(nome, unidade_base_id, unidade_maior_id, fator_conversao,
    origem_sistema, vhsys_id_mg, vhsys_synced_at)
  VALUES (COALESCE(NULLIF(p_nome,''),'Produto VHSYS'), v_base, v_maior, 480,
    'vhsys', p_vhsys_id, NOW())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Cada chamada confirma um único domínio em uma transação PostgreSQL.
CREATE OR REPLACE FUNCTION btx_confirmar_vhsys_dominio(
  p_sincronizacao UUID,
  p_dominio TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_sync_status TEXT;
  v_item RECORD;
  v_child JSONB;
  v_local_id UUID;
  v_person_id UUID;
  v_product_id UUID;
BEGIN
  IF p_dominio NOT IN ('vendas','compras','receber','pagar','estoque','bancos') THEN
    RAISE EXCEPTION 'Domínio VHSYS inválido';
  END IF;

  SELECT status INTO v_sync_status
  FROM btx_vhsys_sincronizacoes
  WHERE id = p_sincronizacao AND unidade = 'NEW BLUETEX MG'
  FOR UPDATE;

  IF v_sync_status IS NULL OR v_sync_status NOT IN ('pronto','confirmando') THEN
    RAISE EXCEPTION 'Sincronização VHSYS não está pronta';
  END IF;

  IF EXISTS (
    SELECT 1 FROM btx_vhsys_sincronizacao_itens
    WHERE sincronizacao_id = p_sincronizacao
      AND dominio = p_dominio
      AND classificacao <> 'erro'
      AND decisao IS NULL
  ) THEN
    RAISE EXCEPTION 'Existem itens VHSYS sem decisão';
  END IF;

  FOR v_item IN
    SELECT * FROM btx_vhsys_sincronizacao_itens
    WHERE sincronizacao_id = p_sincronizacao
      AND dominio = p_dominio
      AND aplicado_em IS NULL
    ORDER BY id
  LOOP
    IF v_item.classificacao = 'erro' OR v_item.decisao = 'ignorar' THEN
      UPDATE btx_vhsys_sincronizacao_itens SET aplicado_em = NOW() WHERE id = v_item.id;
      CONTINUE;
    END IF;

    IF v_item.decisao = 'vincular' THEN
      IF v_item.local_id IS NULL THEN
        RAISE EXCEPTION 'Vínculo VHSYS sem registro local';
      END IF;
      IF p_dominio = 'vendas' THEN
        UPDATE btx_vendas SET origem_sistema='vhsys', vhsys_id=v_item.vhsys_id,
          vhsys_synced_at=NOW() WHERE id=v_item.local_id;
      ELSIF p_dominio = 'compras' THEN
        UPDATE btx_compras SET origem_sistema='vhsys', vhsys_id=v_item.vhsys_id,
          vhsys_synced_at=NOW() WHERE id=v_item.local_id;
      ELSIF p_dominio IN ('receber','pagar') THEN
        UPDATE btx_parcelas SET origem_sistema='vhsys', vhsys_id=v_item.vhsys_id,
          vhsys_synced_at=NOW() WHERE id=v_item.local_id;
      ELSIF p_dominio = 'estoque' THEN
        UPDATE btx_produtos SET origem_sistema='vhsys', vhsys_id_mg=v_item.vhsys_id,
          vhsys_synced_at=NOW() WHERE id=v_item.local_id;
      END IF;
      v_local_id := v_item.local_id;
    END IF;

    IF p_dominio = 'estoque' THEN
      IF v_item.decisao = 'importar' THEN
        v_local_id := btx_vhsys_upsert_produto(
          v_item.dados_normalizados->>'produto_nome', v_item.vhsys_id);
      END IF;
      INSERT INTO btx_vhsys_estoque_atual(
        unidade, produto_id, vhsys_produto_id, quantidade_atual,
        consultado_em, sincronizacao_id
      ) VALUES (
        'NEW BLUETEX MG', v_local_id, v_item.vhsys_id,
        COALESCE(NULLIF(v_item.dados_normalizados->>'quantidade_atual','')::NUMERIC,0),
        COALESCE(NULLIF(v_item.dados_normalizados->>'consultado_em','')::TIMESTAMPTZ,NOW()),
        p_sincronizacao
      )
      ON CONFLICT (sincronizacao_id, vhsys_produto_id)
      DO UPDATE SET quantidade_atual=EXCLUDED.quantidade_atual,
        consultado_em=EXCLUDED.consultado_em, produto_id=EXCLUDED.produto_id;

    ELSIF p_dominio = 'bancos' THEN
      INSERT INTO btx_vhsys_saldos_bancarios(
        unidade, vhsys_banco_id, numero_banco, nome_banco, saldo_atual,
        consultado_em, sincronizacao_id
      ) VALUES (
        'NEW BLUETEX MG', v_item.vhsys_id,
        COALESCE(v_item.dados_normalizados->>'numero_banco','033'),
        COALESCE(v_item.dados_normalizados->>'nome_banco','Santander'),
        COALESCE(NULLIF(v_item.dados_normalizados->>'saldo_atual','')::NUMERIC,0),
        COALESCE(NULLIF(v_item.dados_normalizados->>'consultado_em','')::TIMESTAMPTZ,NOW()),
        p_sincronizacao
      )
      ON CONFLICT (sincronizacao_id, vhsys_banco_id)
      DO UPDATE SET saldo_atual=EXCLUDED.saldo_atual, consultado_em=EXCLUDED.consultado_em;

    ELSIF p_dominio = 'vendas' AND v_item.decisao = 'importar' THEN
      v_person_id := NULL;
      IF COALESCE(v_item.dados_normalizados->>'cliente_vhsys_id','') <> '' THEN
        INSERT INTO btx_clientes(unidade, nome, origem_sistema, vhsys_id, vhsys_synced_at)
        VALUES (
          'NEW BLUETEX MG',
          COALESCE(NULLIF(v_item.dados_normalizados->>'pessoa_nome',''),'Cliente VHSYS'),
          'vhsys', v_item.dados_normalizados->>'cliente_vhsys_id', NOW()
        )
        ON CONFLICT (unidade, vhsys_id) WHERE vhsys_id IS NOT NULL
        DO UPDATE SET nome=EXCLUDED.nome, ativo=TRUE, origem_sistema='vhsys', vhsys_synced_at=NOW()
        RETURNING id INTO v_person_id;
      END IF;
      INSERT INTO btx_vendas(
        unidade, cliente_id, data_venda, numero_nf, valor_total, valor_st,
        observacoes, ativo, origem_sistema, vhsys_id, vhsys_synced_at
      ) VALUES (
        'NEW BLUETEX MG', v_person_id,
        (v_item.dados_normalizados->>'data')::DATE,
        v_item.dados_normalizados->>'numero_documento',
        COALESCE(NULLIF(v_item.dados_normalizados->>'valor_total','')::NUMERIC,0),
        COALESCE(NULLIF(v_item.dados_normalizados->>'valor_st','')::NUMERIC,0),
        'Importado do VHSYS', TRUE, 'vhsys', v_item.vhsys_id, NOW()
      )
      ON CONFLICT (unidade, vhsys_id) WHERE vhsys_id IS NOT NULL
      DO UPDATE SET cliente_id=EXCLUDED.cliente_id, data_venda=EXCLUDED.data_venda,
        numero_nf=EXCLUDED.numero_nf, valor_total=EXCLUDED.valor_total,
        valor_st=EXCLUDED.valor_st, ativo=TRUE, vhsys_synced_at=NOW()
      RETURNING id INTO v_local_id;
      DELETE FROM btx_vendas_itens WHERE venda_id=v_local_id;
      FOR v_child IN SELECT * FROM jsonb_array_elements(
        COALESCE(v_item.dados_normalizados->'itens','[]'::JSONB)
      ) LOOP
        v_product_id := btx_vhsys_upsert_produto(
          v_child->>'produto_nome', v_child->>'produto_vhsys_id');
        INSERT INTO btx_vendas_itens(venda_id,produto_id,qtd_carteiras,valor)
        VALUES (
          v_local_id, v_product_id,
          ROUND(COALESCE(NULLIF(v_child->>'quantidade','')::NUMERIC,0))::INTEGER,
          COALESCE(NULLIF(v_child->>'valor','')::NUMERIC,0)
        );
      END LOOP;

    ELSIF p_dominio = 'compras' AND v_item.decisao = 'importar' THEN
      v_person_id := NULL;
      IF COALESCE(v_item.dados_normalizados->>'fornecedor_vhsys_id','') <> '' THEN
        INSERT INTO btx_fornecedores(unidade, nome, origem_sistema, vhsys_id, vhsys_synced_at)
        VALUES (
          'NEW BLUETEX MG',
          COALESCE(NULLIF(v_item.dados_normalizados->>'pessoa_nome',''),'Fornecedor VHSYS'),
          'vhsys', v_item.dados_normalizados->>'fornecedor_vhsys_id', NOW()
        )
        ON CONFLICT (unidade, vhsys_id) WHERE vhsys_id IS NOT NULL
        DO UPDATE SET nome=EXCLUDED.nome, ativo=TRUE, origem_sistema='vhsys', vhsys_synced_at=NOW()
        RETURNING id INTO v_person_id;
      END IF;
      INSERT INTO btx_compras(
        unidade, fornecedor_id, data_compra, numero_nf, valor_total, valor_st,
        observacoes, ativo, origem_sistema, vhsys_id, vhsys_synced_at
      ) VALUES (
        'NEW BLUETEX MG', v_person_id,
        (v_item.dados_normalizados->>'data')::DATE,
        v_item.dados_normalizados->>'numero_documento',
        COALESCE(NULLIF(v_item.dados_normalizados->>'valor_total','')::NUMERIC,0),
        COALESCE(NULLIF(v_item.dados_normalizados->>'valor_st','')::NUMERIC,0),
        'Importado do VHSYS', TRUE, 'vhsys', v_item.vhsys_id, NOW()
      )
      ON CONFLICT (unidade, vhsys_id) WHERE vhsys_id IS NOT NULL
      DO UPDATE SET fornecedor_id=EXCLUDED.fornecedor_id, data_compra=EXCLUDED.data_compra,
        numero_nf=EXCLUDED.numero_nf, valor_total=EXCLUDED.valor_total,
        valor_st=EXCLUDED.valor_st, ativo=TRUE, vhsys_synced_at=NOW()
      RETURNING id INTO v_local_id;
      DELETE FROM btx_compras_itens WHERE compra_id=v_local_id;
      FOR v_child IN SELECT * FROM jsonb_array_elements(
        COALESCE(v_item.dados_normalizados->'itens','[]'::JSONB)
      ) LOOP
        v_product_id := btx_vhsys_upsert_produto(
          v_child->>'produto_nome', v_child->>'produto_vhsys_id');
        INSERT INTO btx_compras_itens(compra_id,produto_id,qtd_carteiras,valor)
        VALUES (
          v_local_id, v_product_id,
          ROUND(COALESCE(NULLIF(v_child->>'quantidade','')::NUMERIC,0))::INTEGER,
          COALESCE(NULLIF(v_child->>'valor','')::NUMERIC,0)
        );
      END LOOP;

    ELSIF p_dominio IN ('receber','pagar') AND v_item.decisao = 'importar' THEN
      INSERT INTO btx_parcelas(
        unidade, tipo, origem, numero_parcela, vencimento, valor, status,
        numero_boleto, observacoes, ativo, origem_sistema, vhsys_id, vhsys_synced_at
      ) VALUES (
        'NEW BLUETEX MG', CASE WHEN p_dominio='receber' THEN 'receber' ELSE 'pagar' END,
        'manual', 1, (v_item.dados_normalizados->>'vencimento')::DATE,
        COALESCE(NULLIF(v_item.dados_normalizados->>'valor_total','')::NUMERIC,0),
        COALESCE(NULLIF(v_item.dados_normalizados->>'status',''),'pendente'),
        v_item.dados_normalizados->>'numero_documento',
        v_item.dados_normalizados->>'observacoes',
        TRUE, 'vhsys', v_item.vhsys_id, NOW()
      )
      ON CONFLICT (unidade, tipo, vhsys_id) WHERE vhsys_id IS NOT NULL
      DO UPDATE SET vencimento=EXCLUDED.vencimento, valor=EXCLUDED.valor,
        status=EXCLUDED.status, numero_boleto=EXCLUDED.numero_boleto,
        observacoes=EXCLUDED.observacoes, ativo=TRUE, vhsys_synced_at=NOW()
      RETURNING id INTO v_local_id;
    END IF;

    UPDATE btx_vhsys_sincronizacao_itens
    SET local_id=COALESCE(local_id,v_local_id), aplicado_em=NOW()
    WHERE id=v_item.id;
    v_local_id := NULL;
    v_person_id := NULL;
    v_product_id := NULL;
  END LOOP;
END;
$$;

