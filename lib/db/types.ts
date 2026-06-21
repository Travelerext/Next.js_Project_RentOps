/**
 * Supabase join result types.
 * Supabase's `.select("*, related:foreign_key(col)")` nests related rows
 * as objects/arrays. These helpers eliminate the repeated `as unknown as {…}`
 * casts scattered across server components and actions.
 */

// ─── Customer (joined on customer_id) ────────────────────────────────
export interface CustomerSnapshot {
  name: string;
  customer_no?: string;
  contact_name?: string | null;
  contact_phone?: string | null;
}

// ─── Equipment (joined on equipment_id) ──────────────────────────────
export interface EquipmentSnapshot {
  equipment_no: string;
  name: string;
  brand?: string | null;
}
export interface EquipmentAvailabilitySnapshot extends EquipmentSnapshot {
  status: string;
  standard_rent: string | null;
  standard_deposit: string | null;
}

// ─── Order with customer join ────────────────────────────────────────
export interface RentalOrderWithCustomer {
  id: string;
  order_no: string;
  order_status: string;
  pricing_mode: string;
  total_rent_amount: string;
  total_deposit_amount: string;
  paid_amount: string;
  unpaid_amount: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  created_at: string;
  updated_at: string;
  customer: CustomerSnapshot | null;
}

// ─── Order item with equipment join ──────────────────────────────────
export interface RentalOrderItemWithEquipment {
  id: string;
  order_id: string;
  equipment_id: string;
  quantity: string;
  actual_unit_price: string;
  deposit_amount: string;
  rent_amount: string;
  item_status: string;
  pricing_mode: string;
  equipment: EquipmentSnapshot | null;
}

// ─── Contract with customer join ─────────────────────────────────────
export interface RentalContractWithCustomer {
  id: string;
  contract_no: string;
  contract_status: string;
  start_at: string;
  end_at: string;
  total_rent_amount: string;
  deposit_amount: string;
  created_at: string;
  customer: CustomerSnapshot | null;
}

// ─── Receivable with customer join ──────────────────────────────────
export interface ReceivableWithCustomer {
  id: string;
  receivable_no: string;
  customer_id: string;
  order_id: string | null;
  contract_id: string | null;
  receivable_type: string;
  amount: string;
  paid_amount: string;
  unpaid_amount: string;
  due_date: string;
  status: string;
  overdue_days: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
  customer: CustomerSnapshot | null;
}
