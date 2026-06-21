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

export const rentalOrder = pgTable("rental_order", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNo: varchar("order_no", { length: 50 }).unique().notNull(),
  customerId: uuid("customer_id").notNull(),
  projectSiteId: uuid("project_site_id"),
  salesUserId: uuid("sales_user_id").notNull(),
  orderType: varchar("order_type", { length: 50 }).notNull().default("NORMAL"),
  orderStatus: varchar("order_status", { length: 50 }).notNull().default("DRAFT"),
  pricingMode: varchar("pricing_mode", { length: 50 })
    .notNull()
    .default("MONTHLY"),
  plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
  plannedEndAt: timestamp("planned_end_at", { withTimezone: true }),
  actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
  actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
  totalRentAmount: decimal("total_rent_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  totalDepositAmount: decimal("total_deposit_amount", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  transportFee: decimal("transport_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  materialFee: decimal("material_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  otherFee: decimal("other_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  receivableAmount: decimal("receivable_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  unpaidAmount: decimal("unpaid_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  depositAmount: decimal("deposit_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  monthlySettlement: boolean("monthly_settlement").notNull().default(false),
  temporaryOrder: boolean("temporary_order").notNull().default(false),
  riskWarningTriggered: boolean("risk_warning_triggered")
    .notNull()
    .default(false),
  riskWarnings: jsonb("risk_warnings").default([]),
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

export const rentalOrderItem = pgTable("rental_order_item", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull(),
  equipmentId: uuid("equipment_id").notNull(),
  equipmentModelId: uuid("equipment_model_id"),
  quantity: decimal("quantity", { precision: 10, scale: 2 })
    .notNull()
    .default("1"),
  equipmentConditionLevel: varchar("equipment_condition_level", { length: 10 })
    .notNull()
    .default("A"),
  pricingMode: varchar("pricing_mode", { length: 50 }).notNull(),
  standardUnitPrice: decimal("standard_unit_price", {
    precision: 15,
    scale: 2,
  }).notNull(),
  actualUnitPrice: decimal("actual_unit_price", { precision: 15, scale: 2 })
    .notNull(),
  depositAmount: decimal("deposit_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  rentAmount: decimal("rent_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  expectedReturnAt: timestamp("expected_return_at", { withTimezone: true }),
  itemStatus: varchar("item_status", { length: 50 }).notNull().default("PENDING"),
  priceAdjusted: boolean("price_adjusted").notNull().default(false),
  priceAdjustmentReason: text("price_adjustment_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RentalOrder = typeof rentalOrder.$inferSelect;
export type NewRentalOrder = typeof rentalOrder.$inferInsert;
export type RentalOrderItem = typeof rentalOrderItem.$inferSelect;
