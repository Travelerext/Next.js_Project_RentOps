import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";

export const receivable = pgTable("receivable", {
  id: uuid("id").defaultRandom().primaryKey(),
  receivableNo: varchar("receivable_no", { length: 50 }).unique().notNull(),
  customerId: uuid("customer_id").notNull(),
  orderId: uuid("order_id"),
  contractId: uuid("contract_id"),
  receivableType: varchar("receivable_type", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  unpaidAmount: decimal("unpaid_amount", { precision: 15, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("UNPAID"),
  overdueDays: integer("overdue_days").notNull().default(0),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
  version: integer("version").notNull().default(1),
});

export const paymentRecord = pgTable("payment_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentNo: varchar("payment_no", { length: 50 }).unique().notNull(),
  customerId: uuid("customer_id").notNull(),
  orderId: uuid("order_id"),
  contractId: uuid("contract_id"),
  receivableId: uuid("receivable_id"),
  paymentType: varchar("payment_type", { length: 50 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  payerName: varchar("payer_name", { length: 200 }),
  bankFlowNo: varchar("bank_flow_no", { length: 100 }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  version: integer("version").notNull().default(1),
});

export const depositRecord = pgTable("deposit_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  depositNo: varchar("deposit_no", { length: 50 }).unique().notNull(),
  customerId: uuid("customer_id").notNull(),
  orderId: uuid("order_id").notNull(),
  contractId: uuid("contract_id").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  deductedAmount: decimal("deducted_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  refundedAmount: decimal("refunded_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  availableAmount: decimal("available_amount", {
    precision: 15,
    scale: 2,
  }).notNull(),
  depositStatus: varchar("deposit_status", { length: 50 })
    .notNull()
    .default("PENDING_PAYMENT"),
  sourcePaymentId: uuid("source_payment_id"),
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

export const refundRecord = pgTable("refund_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  refundNo: varchar("refund_no", { length: 50 }).unique().notNull(),
  customerId: uuid("customer_id").notNull(),
  depositId: uuid("deposit_id").notNull(),
  orderId: uuid("order_id"),
  contractId: uuid("contract_id"),
  refundAmount: decimal("refund_amount", { precision: 15, scale: 2 }).notNull(),
  refundMethod: varchar("refund_method", { length: 50 }).notNull(),
  refundStatus: varchar("refund_status", { length: 50 })
    .notNull()
    .default("PENDING_APPROVAL"),
  reason: text("reason"),
  approvalId: uuid("approval_id"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
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

export const reconciliationStatement = pgTable("reconciliation_statement", {
  id: uuid("id").defaultRandom().primaryKey(),
  statementNo: varchar("statement_no", { length: 50 }).unique().notNull(),
  customerId: uuid("customer_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalReceivableAmount: decimal("total_receivable_amount", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  totalPaidAmount: decimal("total_paid_amount", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  totalUnpaidAmount: decimal("total_unpaid_amount", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  depositBalance: decimal("deposit_balance", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  status: varchar("status", { length: 50 }).notNull().default("DRAFT"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
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

export type Receivable = typeof receivable.$inferSelect;
export type PaymentRecord = typeof paymentRecord.$inferSelect;
export type DepositRecord = typeof depositRecord.$inferSelect;
export type RefundRecord = typeof refundRecord.$inferSelect;
