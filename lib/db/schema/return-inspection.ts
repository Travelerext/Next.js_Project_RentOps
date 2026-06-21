import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  decimal,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const returnInspection = pgTable("return_inspection", {
  id: uuid("id").defaultRandom().primaryKey(),
  inspectionNo: varchar("inspection_no", { length: 50 }).unique().notNull(),
  orderId: uuid("order_id").notNull(),
  contractId: uuid("contract_id").notNull(),
  equipmentId: uuid("equipment_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  inspectorId: uuid("inspector_id").notNull(),
  inspectedAt: timestamp("inspected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  isOverdue: boolean("is_overdue").notNull().default(false),
  overdueDays: integer("overdue_days").notNull().default(0),
  isDamaged: boolean("is_damaged").notNull().default(false),
  damageDescription: text("damage_description"),
  isMissingParts: boolean("is_missing_parts").notNull().default(false),
  missingPartsDesc: text("missing_parts_desc"),
  isDirty: boolean("is_dirty").notNull().default(false),
  cleanlinessNote: text("cleanliness_note"),
  needsRepair: boolean("needs_repair").notNull().default(false),
  repairEstimate: decimal("repair_estimate", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  photoPaths: jsonb("photo_paths").default([]),
  customerConfirmed: boolean("customer_confirmed").notNull().default(false),
  customerConfirmedBy: varchar("customer_confirmed_by", { length: 200 }),
  customerConfirmedAt: timestamp("customer_confirmed_at", {
    withTimezone: true,
  }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  version: integer("version").notNull().default(1),
});

export const returnSettlement = pgTable("return_settlement", {
  id: uuid("id").defaultRandom().primaryKey(),
  settlementNo: varchar("settlement_no", { length: 50 }).unique().notNull(),
  inspectionId: uuid("inspection_id").notNull(),
  contractId: uuid("contract_id").notNull(),
  orderId: uuid("order_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  unpaidRent: decimal("unpaid_rent", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  overdueRent: decimal("overdue_rent", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  lateFee: decimal("late_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  penalty: decimal("penalty", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  damageCompensation: decimal("damage_compensation", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  missingPartsComp: decimal("missing_parts_comp", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  cleaningFee: decimal("cleaning_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  repairFee: decimal("repair_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  totalDeduction: decimal("total_deduction", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  depositBalance: decimal("deposit_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  refundAmount: decimal("refund_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  additionalCharge: decimal("additional_charge", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  settlementStatus: varchar("settlement_status", { length: 50 })
    .notNull()
    .default("DRAFT"),
  refundId: uuid("refund_id"),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  version: integer("version").notNull().default(1),
});

export type ReturnInspection = typeof returnInspection.$inferSelect;
export type ReturnSettlement = typeof returnSettlement.$inferSelect;
