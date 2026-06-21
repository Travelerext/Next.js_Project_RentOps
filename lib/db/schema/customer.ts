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

export const customers = pgTable("customer", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerNo: varchar("customer_no", { length: 50 }).unique().notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  shortName: varchar("short_name", { length: 100 }),
  contactName: varchar("contact_name", { length: 200 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  taxNo: varchar("tax_no", { length: 50 }),
  invoiceTitle: varchar("invoice_title", { length: 300 }),
  invoiceAddressPhone: text("invoice_address_phone"),
  invoiceBankAccount: text("invoice_bank_account"),
  customerType: varchar("customer_type", { length: 50 })
    .notNull()
    .default("ENTERPRISE"),
  creditLevel: varchar("credit_level", { length: 10 }).notNull().default("B"),
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  riskLevel: varchar("risk_level", { length: 50 }).notNull().default("LOW"),
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  isMonthlySettlement: boolean("is_monthly_settlement")
    .notNull()
    .default(false),
  monthlySettlementCycle: integer("monthly_settlement_cycle"),
  lockOrdering: boolean("lock_ordering").notNull().default(false),
  lockReason: text("lock_reason"),
  status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
  ownerUserId: uuid("owner_user_id"),
  metadata: jsonb("metadata").default({}),
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

export const customerContact = pgTable("customer_contact", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  position: varchar("position", { length: 100 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const customerCreditRecord = pgTable("customer_credit_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull(),
  creditLevelBefore: varchar("credit_level_before", { length: 10 }),
  creditLevelAfter: varchar("credit_level_after", { length: 10 }),
  riskType: varchar("risk_type", { length: 50 }).notNull(),
  riskDescription: text("risk_description"),
  relatedOrderId: uuid("related_order_id"),
  relatedContractId: uuid("related_contract_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  handledBy: uuid("handled_by"),
  handlingResult: text("handling_result"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
