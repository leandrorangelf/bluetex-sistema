-- Só o admin pode excluir/cancelar lançamentos (parcelas, vendas, compras,
-- ajustes de estoque). Usuário "unidade" continua podendo editar (vencimento,
-- valor, observação, dar baixa) — só fica bloqueado de apagar (ativo=false)
-- ou cancelar (status='cancelado' em parcelas) e de fazer DELETE de verdade.
CREATE OR REPLACE FUNCTION btx_bloquear_exclusao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF btx_get_my_role() = 'admin' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Apenas o administrador pode excluir registros.';
  END IF;

  IF NEW.ativo = FALSE AND OLD.ativo = TRUE THEN
    RAISE EXCEPTION 'Apenas o administrador pode excluir registros.';
  END IF;

  IF TG_TABLE_NAME = 'btx_parcelas' AND NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    RAISE EXCEPTION 'Apenas o administrador pode cancelar contas.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER btx_bloquear_exclusao_parcelas BEFORE UPDATE OR DELETE ON btx_parcelas
  FOR EACH ROW EXECUTE FUNCTION btx_bloquear_exclusao();
CREATE TRIGGER btx_bloquear_exclusao_vendas BEFORE UPDATE OR DELETE ON btx_vendas
  FOR EACH ROW EXECUTE FUNCTION btx_bloquear_exclusao();
CREATE TRIGGER btx_bloquear_exclusao_compras BEFORE UPDATE OR DELETE ON btx_compras
  FOR EACH ROW EXECUTE FUNCTION btx_bloquear_exclusao();
CREATE TRIGGER btx_bloquear_exclusao_ajustes_estoque BEFORE UPDATE OR DELETE ON btx_ajustes_estoque
  FOR EACH ROW EXECUTE FUNCTION btx_bloquear_exclusao();

-- Log de edições: btx_parcelas passa a ser auditada na mesma tabela que já
-- audita estoque/compras/vendas (btx_auditoria_estoque — nome antigo, mas já
-- serve como log geral de alterações do sistema).
CREATE TRIGGER btx_auditoria_parcelas AFTER INSERT OR UPDATE OR DELETE ON btx_parcelas
  FOR EACH ROW EXECUTE FUNCTION btx_auditar_estoque();
