import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const outboundRecord = pgTable("outbound_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  outboundNo: varchar("outbound_no", { length: 50 }).unique().notNull(),
  businessType: varchar("business_type", { length: 50 }).notNull(),
  orderId: uuid("order_id"),
  contractId: uuid("contract_id"),
  equipmentId: uuid("equipment_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  projectSiteId: uuid("project_site_id"),
  borrowerName: varchar("borrower_name", { length: 200 }),
  signerName: varchar("signer_name", { length: 200 }),
  attachmentChecklist: text("attachment_checklist"),
  photoPaths: jsonb("photo_paths").default([]),
  remark: text("remark"),
  operatorId: uuid("operator_id"),
  operatedAt: timestamp("operated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  version: integer("version").notNull().default(1),
});

export const inboundRecord = pgTable("inbound_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  inboundNo: varchar("inbound_no", { length: 50 }).unique().notNull(),
  businessType: varchar("business_type", { length: 50 }).notNull(),
  outboundRecordId: uuid("outbound_record_id"),
  orderId: uuid("order_id"),
  contractId: uuid("contract_id"),
  equipmentId: uuid("equipment_id").notNull(),
  warehouseId: uuid("warehouse_id").notNull(),
  inspectionResult: varchar("inspection_result", { length: 50 })
    .notNull()
    .default("PENDING"),
  inspectionNotes: text("inspection_notes"),
  photoPaths: jsonb("photo_paths").default([]),
  remark: text("remark"),
  operatorId: uuid("operator_id"),
  operatedAt: timestamp("operated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  version: integer("version").notNull().default(1),
});

export const equipmentTransfer = pgTable("equipment_transfer", {
  id: uuid("id").defaultRandom().primaryKey(),
  transferNo: varchar("transfer_no", { length: 50 }).unique().notNull(),
  equipmentId: uuid("equipment_id").notNull(),
  fromWarehouseId: uuid("from_warehouse_id"),
  toWarehouseId: uuid("to_warehouse_id"),
  fromStationId: uuid("from_station_id"),
  toStationId: uuid("to_station_id"),
  transferStatus: varchar("transfer_status", { length: 50 })
    .notNull()
    .default("PENDING"),
  outboundOperatorId: uuid("outbound_operator_id"),
  outboundAt: timestamp("outbound_at", { withTimezone: true }),
  arrivalOperatorId: uuid("arrival_operator_id"),
  arrivalAt: timestamp("arrival_at", { withTimezone: true }),
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

export type OutboundRecord = typeof outboundRecord.$inferSelect;
export type InboundRecord = typeof inboundRecord.$inferSelect;
export type EquipmentTransfer = typeof equipmentTransfer.$inferSelect;
