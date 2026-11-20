BEGIN;

-- Preserve every supported journal origin after supplier migrations replace the
-- source-type check. Customer return credit memos remain a valid, independently
-- audited source alongside supplier invoices, credit notes and payments.
ALTER TABLE public.accounting_journal_entries
  DROP CONSTRAINT IF EXISTS accounting_journal_entries_source_type_check;

ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_entries_source_type_check
  CHECK (source_type IN (
    'manual',
    'adjustment',
    'invoice',
    'payment',
    'cash_expense',
    'purchase_receipt',
    'purchase_supplier_credit_note',
    'purchase_supplier_payment',
    'purchase_supplier_invoice',
    'customer_return_credit_memo',
    'onyx_import'
  ));

COMMENT ON CONSTRAINT accounting_journal_entries_source_type_check
  ON public.accounting_journal_entries IS
  'Allows canonical manual, customer, supplier, cash-expense, purchase-receipt and Onyx journal source types.';

COMMIT;
