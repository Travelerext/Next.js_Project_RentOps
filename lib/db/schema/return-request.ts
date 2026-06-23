import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const returnRequest = pgTable("return_request", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestNo: varchar("request_no", { length: 50 }).unique().notNull(),
  orderId: uuid("order_id"),
  contractId: uuid("contract_id"),
  customerId: uuid("customer_id").notNull(),
  equipmentId: uuid("equipment_id"),
  requestedBy: uuid("requested_by").notNull(),
  reason: text("reason"),
  requestStatus: varchar("request_status", { length: 50 }).notNull().default("PENDING"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  inboundId: uuid("inbound_id"),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type ReturnRequest = typeof returnRequest.$inferSelect;
