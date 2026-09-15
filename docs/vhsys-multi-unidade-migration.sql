-- ============================================================
-- Migração: VHSYS multi-unidade (6 unidades) + corte de escopo
-- Rodar no SQL Editor do Supabase, com backup antes.
-- Tudo idempotente (IF NOT EXISTS / OR REPLACE) — seguro reexecutar.
--
-- O que muda:
--  1) As 6 unidades (NEW BLUETEX MG/SC/AM + GB SP/CE/MA) passam a valer em
--     todas as tabelas que hoje só aceitam as 3 unidades NEW BLUETEX.
--  2) VHSYS passa a sincronizar só vendas, compras, estoque e boletos a
--     receber (gerados pela venda) — por unidade, cada uma com sua própria
--     conta/API key.
--  3) Contas a pagar e saldo bancário deixam de vir do VHSYS: os dados que já
--     tinham entrado por lá são apagados; a partir de agora são lançamento
--     manual de cada unidade.
--  4) O mapa de produtos VHSYS -> produto local passa a ser por unidade
--     (cada unidade tem seu próprio catálogo/IDs no VHSYS).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Amplia as 6 unidades em todas as tabelas operacionais
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'btx_profiles','btx_fornecedores','btx_clientes','btx_categorias_despesas',
    'btx_estoque_inicial','btx_compras','btx_vendas','btx_despesas',
    'btx_parcelas','btx_caixa_mensal','btx_ajustes_estoque'
  ])
  LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      t, t || '_unidade_check'
    );
    EXECUTE format(
      $f$ALTER TABLE %I ADD CONSTRAINT %I CHECK (unidade IN (
        'NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM','GB SP','GB CE','GB MA'
      ))$f$,
      t, t || '_unidade_check'
    );
  END LOOP;
END $$;

-- btx_vhsys_sincronizacoes e btx_vhsys_estoque_atual: idem, deixam de ser
-- só 'NEW BLUETEX MG'.
ALTER TABLE btx_vhsys_sincronizacoes DROP CONSTRAINT IF EXISTS btx_vhsys_sincronizacoes_unidade_check;
ALTER TABLE btx_vhsys_sincronizacoes ADD CONSTRAINT btx_vhsys_sincronizacoes_unidade_check
  CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM','GB SP','GB CE','GB MA'));

ALTER TABLE btx_vhsys_estoque_atual DROP CONSTRAINT IF EXISTS btx_vhsys_estoque_atual_unidade_check;
ALTER TABLE btx_vhsys_estoque_atual ADD CONSTRAINT btx_vhsys_estoque_atual_unidade_check
  CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM','GB SP','GB CE','GB MA'));

-- ------------------------------------------------------------
-- 2) Corte de escopo: contas a pagar e saldo bancário somem do VHSYS.
--    Apaga o que já tinha vindo de lá (pagamentos ligados caem em cascata).
-- ------------------------------------------------------------
DELETE FROM btx_parcelas WHERE tipo = 'pagar' AND origem_sistema = 'vhsys';
DELETE FROM btx_vhsys_saldos_bancarios;

-- ------------------------------------------------------------
-- 3) Mapa de produtos VHSYS -> produto local passa a ser por unidade
-- ------------------------------------------------------------
ALTER TABLE btx_vhsys_produto_map ADD COLUMN IF NOT EXISTS unidade TEXT;
UPDATE btx_vhsys_produto_map SET unidade = 'NEW BLUETEX MG' WHERE unidade IS NULL;
ALTER TABLE btx_vhsys_produto_map ALTER COLUMN unidade SET NOT NULL;
ALTER TABLE btx_vhsys_produto_map DROP CONSTRAINT IF EXISTS btx_vhsys_produto_map_unidade_check;
ALTER TABLE btx_vhsys_produto_map ADD CONSTRAINT btx_vhsys_produto_map_unidade_check
  CHECK (unidade IN ('NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM','GB SP','GB CE','GB MA'));

ALTER TABLE btx_vhsys_produto_map DROP CONSTRAINT IF EXISTS btx_vhsys_produto_map_pkey;
ALTER TABLE btx_vhsys_produto_map ADD PRIMARY KEY (unidade, vhsys_id_produto);

-- ------------------------------------------------------------
-- 4) btx_vhsys_upsert_produto agora recebe a unidade e resolve o mapa dela
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS btx_vhsys_upsert_produto(TEXT, TEXT);
CREATE OR REPLACE FUNCTION btx_vhsys_upsert_produto(p_nome TEXT, p_vhsys_id TEXT, p_unidade TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT produto_id INTO v_id
  FROM btx_vhsys_produto_map
  WHERE unidade = p_unidade AND vhsys_id_produto = p_vhsys_id AND ignorar = FALSE;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- 5) btx_confirmar_vhsys_dominio passa a operar pela unidade da própria
--    sincronização (em vez de fixo 'NEW BLUETEX MG'). Mantém os ramos de
--    'pagar'/'bancos' como código morto — não são mais gerados pela análise,
--    mas não há necessidade de removê-los para isso funcionar.
-- ------------------------------------------------------------
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
  v_unidade TEXT;
  v_item RECORD;
  v_child JSONB;
  v_local_id UUID;
  v_person_id UUID;
  v_product_id UUID;
  v_status TEXT;
BEGIN
  IF p_dominio NOT IN ('vendas','compras','receber','pagar','estoque','bancos') THEN
    RAISE EXCEPTION 'Domínio VHSYS inválido';
  END IF;

  SELECT status, unidade INTO v_sync_status, v_unidade
  FROM btx_vhsys_sincronizacoes
  WHERE id = p_sincronizacao
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

    IF v_item.decisao = 'vincular' AND p_dominio <> 'bancos' THEN
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
        -- Propaga baixa/valor feita no VHSYS para um título já vinculado aqui.
        v_status := COALESCE(NULLIF(v_item.dados_normalizados->>'status',''), 'pendente');
        UPDATE btx_parcelas SET origem_sistema='vhsys', vhsys_id=v_item.vhsys_id,
          vhsys_synced_at=NOW(), status=v_status,
          data_pagamento = CASE WHEN v_status='pago' THEN COALESCE(
            NULLIF(v_item.dados_normalizados->>'data_pagamento','')::DATE,
            data_pagamento, CURRENT_DATE
          ) ELSE data_pagamento END
        WHERE id=v_item.local_id;
        IF v_status = 'pago' AND NOT EXISTS (
          SELECT 1 FROM btx_pagamentos_parcela WHERE parcela_id = v_item.local_id
        ) THEN
          INSERT INTO btx_pagamentos_parcela(parcela_id, valor, data_pagamento, observacoes)
          SELECT id, valor,
            COALESCE(NULLIF(v_item.dados_normalizados->>'data_pagamento','')::DATE, CURRENT_DATE),
            'Baixa automática via VHSYS'
          FROM btx_parcelas WHERE id = v_item.local_id;
        END IF;
      ELSIF p_dominio = 'estoque' THEN
        UPDATE btx_produtos SET origem_sistema='vhsys', vhsys_synced_at=NOW()
          WHERE id=v_item.local_id;
      END IF;
      v_local_id := v_item.local_id;
    END IF;

    IF p_dominio = 'estoque' THEN
      IF v_item.decisao = 'importar' THEN
        v_local_id := btx_vhsys_upsert_produto(
          v_item.dados_normalizados->>'produto_nome', v_item.vhsys_id, v_unidade);
      END IF;
      IF v_local_id IS NULL THEN
        -- produto VHSYS não mapeado: ignora sem criar nada
        UPDATE btx_vhsys_sincronizacao_itens SET aplicado_em = NOW() WHERE id = v_item.id;
        CONTINUE;
      END IF;
      INSERT INTO btx_vhsys_estoque_atual(
        unidade, produto_id, vhsys_produto_id, quantidade_atual,
        consultado_em, sincronizacao_id
      ) VALUES (
        v_unidade, v_local_id, v_item.vhsys_id,
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
        v_unidade, v_item.vhsys_id,
        COALESCE(v_item.dados_normalizados->>'numero_banco','033'),
        COALESCE(v_item.dados_normalizados->>'nome_banco','Santander'),
        COALESCE(NULLIF(v_item.dados_normalizados->>'saldo_atual','')::NUMERIC,0),
        COALESCE(NULLIF(v_item.dados_normalizados->>'consultado_em','')::TIMESTAMPTZ,NOW()),
        p_sincronizacao
      )
      ON CONFLICT (vhsys_banco_id)
      DO UPDATE SET saldo_atual=EXCLUDED.saldo_atual, consultado_em=EXCLUDED.consultado_em,
        nome_banco=EXCLUDED.nome_banco, numero_banco=EXCLUDED.numero_banco,
        sincronizacao_id=EXCLUDED.sincronizacao_id;

    ELSIF p_dominio = 'vendas' AND v_item.decisao = 'importar' THEN
      v_person_id := NULL;
      IF COALESCE(v_item.dados_normalizados->>'cliente_vhsys_id','') <> '' THEN
        INSERT INTO btx_clientes(unidade, nome, origem_sistema, vhsys_id, vhsys_synced_at)
        VALUES (
          v_unidade,
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
        v_unidade, v_person_id,
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
          v_child->>'produto_nome', v_child->>'produto_vhsys_id', v_unidade);
        CONTINUE WHEN v_product_id IS NULL;
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
          v_unidade,
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
        v_unidade, v_person_id,
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
          v_child->>'produto_nome', v_child->>'produto_vhsys_id', v_unidade);
        CONTINUE WHEN v_product_id IS NULL;
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
        numero_boleto, observacoes, data_pagamento, categoria_vhsys,
        ativo, origem_sistema, vhsys_id, vhsys_synced_at
      ) VALUES (
        v_unidade, CASE WHEN p_dominio='receber' THEN 'receber' ELSE 'pagar' END,
        CASE WHEN p_dominio='pagar' AND (v_item.dados_normalizados->>'de_entrada')::boolean
          THEN 'compra' ELSE 'manual' END,
        1, (v_item.dados_normalizados->>'vencimento')::DATE,
        COALESCE(NULLIF(v_item.dados_normalizados->>'valor_total','')::NUMERIC,0),
        COALESCE(NULLIF(v_item.dados_normalizados->>'status',''),'pendente'),
        v_item.dados_normalizados->>'numero_documento',
        v_item.dados_normalizados->>'observacoes',
        NULLIF(v_item.dados_normalizados->>'data_pagamento','')::DATE,
        NULLIF(v_item.dados_normalizados->>'categoria',''),
        TRUE, 'vhsys', v_item.vhsys_id, NOW()
      )
      ON CONFLICT (unidade, tipo, vhsys_id) WHERE vhsys_id IS NOT NULL
      DO UPDATE SET vencimento=EXCLUDED.vencimento, valor=EXCLUDED.valor,
        status=EXCLUDED.status, numero_boleto=EXCLUDED.numero_boleto,
        observacoes=EXCLUDED.observacoes, origem=EXCLUDED.origem,
        data_pagamento=COALESCE(EXCLUDED.data_pagamento, btx_parcelas.data_pagamento),
        categoria_vhsys=EXCLUDED.categoria_vhsys,
        ativo=TRUE, vhsys_synced_at=NOW()
      RETURNING id INTO v_local_id;

      IF COALESCE(v_item.dados_normalizados->>'status','') = 'pago' AND NOT EXISTS (
        SELECT 1 FROM btx_pagamentos_parcela WHERE parcela_id = v_local_id
      ) THEN
        INSERT INTO btx_pagamentos_parcela(parcela_id, valor, data_pagamento, observacoes)
        SELECT id, valor,
          COALESCE(NULLIF(v_item.dados_normalizados->>'data_pagamento','')::DATE, CURRENT_DATE),
          'Baixa automática via VHSYS'
        FROM btx_parcelas WHERE id = v_local_id;
      END IF;
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

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
