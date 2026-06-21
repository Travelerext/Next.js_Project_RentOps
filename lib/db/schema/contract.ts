import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const rentalContract = pgTable("rental_contract", {
  id: uuid("id").defaultRandom().primaryKey(),
  contractNo: varchar("contract_no", { length: 50 }).unique().notNull(),
  orderId: uuid("order_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  salesUserId: uuid("sales_user_id").notNull(),
  contractType: varchar("contract_type", { length: 50 }).notNull().default("FORMAL"),
  contractStatus: varchar("contract_status", { length: 50 })
    .notNull()
    .default("DRAFT"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  terminatedAt: timestamp("terminated_at", { withTimezone: true }),
  rentCalculationRule: jsonb("rent_calculation_rule").notNull().default({}),
  totalRentAmount: decimal("total_rent_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  depositAmount: decimal("deposit_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  penaltyRule: jsonb("penalty_rule").default({}),
  lateFeeRule: jsonb("late_fee_rule").default({}),
  damageCompensationRule: jsonb("damage_compensation_rule").default({}),
  invoiceRule: jsonb("invoice_rule").default({}),
  monthlySettlementRule: jsonb("monthly_settlement_rule").default({}),
  contractFilePath: varchar("contract_file_path", { length: 1000 }),
  specialTerms: text("special_terms"),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
});

export const rentalContractItem = pgTable("rental_contract_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  contractId: uuid("contract_id").notNull(),
  orderItemId: uuid("order_item_id"),
  equipmentId: uuid("equipment_id").notNull(),
  equipmentModelId: uuid("equipment_model_id"),
  equipmentNoSnapshot: varchar("equipment_no_snapshot", { length: 50 }).notNull(),
  equipmentNameSnapshot: varchar("equipment_name_snapshot", {
    length: 300,
  }).notNull(),
  conditionSnapshot: varchar("condition_snapshot", { length: 10 }).notNull(),
  rentUnitPrice: decimal("rent_unit_price", { precision: 15, scale: 2 })
    .notNull(),
  depositAmount: decimal("deposit_amount", { precision: 15, scale: 2 })
    .notNull(),
  rentAmount: decimal("rent_amount", { precision: 15, scale: 2 }).notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contractChangeRecord = pgTable("contract_change_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  contractId: uuid("contract_id").notNull(),
  changeType: varchar("change_type", { length: 50 }).notNull(),
  beforeContent: jsonb("before_content"),
  afterContent: jsonb("after_content"),
  reason: text("reason"),
  changedBy: uuid("changed_by").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  approvalId: uuid("approval_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RentalContract = typeof rentalContract.$inferSelect;
export type NewRentalContract = typeof rentalContract.$inferInsert;
export type RentalContractItem = typeof rentalContractItem.$inferSelect;
