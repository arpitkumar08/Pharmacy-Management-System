-- Hand-written SQL constraints, partial indexes and triggers
-- Required by Pharmacy Management System Project Plan (§8.4, §8.5)

-- 1. Ensure stock can never go negative even in concurrent races
ALTER TABLE batches 
  DROP CONSTRAINT IF EXISTS batches_qty_non_negative;
ALTER TABLE batches 
  ADD CONSTRAINT batches_qty_non_negative CHECK (qty_on_hand >= 0);

ALTER TABLE batches 
  DROP CONSTRAINT IF EXISTS batches_sale_price_non_negative;
ALTER TABLE batches 
  ADD CONSTRAINT batches_sale_price_non_negative CHECK (sale_price >= 0);

-- 2. Quantity checks
ALTER TABLE sale_items 
  DROP CONSTRAINT IF EXISTS sale_items_qty_positive;
ALTER TABLE sale_items 
  ADD CONSTRAINT sale_items_qty_positive CHECK (qty > 0);

ALTER TABLE sale_return_items 
  DROP CONSTRAINT IF EXISTS sale_return_items_qty_positive;
ALTER TABLE sale_return_items 
  ADD CONSTRAINT sale_return_items_qty_positive CHECK (qty > 0);

ALTER TABLE purchase_order_items 
  DROP CONSTRAINT IF EXISTS po_items_received_le_ordered;
ALTER TABLE purchase_order_items 
  ADD CONSTRAINT po_items_received_le_ordered CHECK (qty_received <= qty_ordered);

-- 3. Reasons are mandatory (at least 5 characters) and non-empty
ALTER TABLE stock_adjustments 
  DROP CONSTRAINT IF EXISTS adj_reason_required;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT adj_reason_required CHECK (length(trim(reason_note)) >= 5);

ALTER TABLE stock_adjustments 
  DROP CONSTRAINT IF EXISTS adj_delta_nonzero;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT adj_delta_nonzero CHECK (qty_delta <> 0);

ALTER TABLE sale_returns 
  DROP CONSTRAINT IF EXISTS return_reason_required;
ALTER TABLE sale_returns 
  ADD CONSTRAINT return_reason_required CHECK (length(trim(reason_note)) >= 5);

-- 4. Partial index for FEFO allocation query performance (Plan §8.5)
CREATE INDEX IF NOT EXISTS idx_batches_fefo 
  ON batches (branch_id, medicine_id, expiry_date, id) 
  WHERE qty_on_hand > 0 AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_batches_near_expiry
  ON batches (branch_id, expiry_date)
  WHERE qty_on_hand > 0;

-- 5. Append-only ledger and audit log: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN 
  RAISE EXCEPTION '% is an append-only ledger and cannot be updated or deleted', TG_TABLE_NAME; 
END; 
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movements_immutable ON stock_movements;
CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

