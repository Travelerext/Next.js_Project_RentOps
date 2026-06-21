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

export const maintenanceWorkOrder = pgTable("maintenance_work_order", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderNo: varchar("work_order_no", { length: 50 }).unique().notNull(),
  equipmentId: uuid("equipment_id").notNull(),
  customerId: uuid("customer_id"),
  contractId: uuid("contract_id"),
  projectSiteId: uuid("project_site_id"),
  reportedBy: uuid("reported_by").notNull(),
  reportedAt: timestamp("reported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  faultDescription: text("fault_description").notNull(),
  faultLevel: varchar("fault_level", { length: 50 }).notNull().default("NORMAL"),
  stopped: boolean("stopped").notNull().default(false),
  affectsConstruction: boolean("affects_construction").notNull().default(false),
  assignedTo: uuid("assigned_to"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  repairStartedAt: timestamp("repair_started_at", { withTimezone: true }),
  repairFinishedAt: timestamp("repair_finished_at", { withTimezone: true }),
  faultCause: text("fault_cause"),
  repairResult: text("repair_result"),
  laborHours: decimal("labor_hours", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  maintenanceFee: decimal("maintenance_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  partsFee: decimal("parts_fee", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  outsourced: boolean("outsourced").notNull().default(false),
  manufacturerWarranty: boolean("manufacturer_warranty")
    .notNull()
    .default(false),
  status: varchar("status", { length: 50 }).notNull().default("PENDING_DISPATCH"),
  photoPaths: jsonb("photo_paths").default([]),
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

export const maintenancePlan = pgTable("maintenance_plan", {
  id: uuid("id").defaultRandom().primaryKey(),
  equipmentId: uuid("equipment_id").notNull(),
  planName: varchar("plan_name", { length: 300 }).notNull(),
  cycleType: varchar("cycle_type", { length: 50 }).notNull(),
  cycleValue: integer("cycle_value").notNull(),
  nextMaintenanceAt: timestamp("next_maintenance_at", { withTimezone: true }),
  responsibleUserId: uuid("responsible_user_id"),
  status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
});

export const maintenanceRecord = pgTable("maintenance_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  equipmentId: uuid("equipment_id").notNull(),
  workOrderId: uuid("work_order_id"),
  maintenancePlanId: uuid("maintenance_plan_id"),
  maintenanceAt: timestamp("maintenance_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  maintainerId: uuid("maintainer_id"),
  content: text("content"),
  fee: decimal("fee", { precision: 15, scale: 2 }).notNull().default("0"),
  nextMaintenanceAt: timestamp("next_maintenance_at", { withTimezone: true }),
  photoPaths: jsonb("photo_paths").default([]),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
});

export const sparePart = pgTable("spare_part", {
  id: uuid("id").defaultRandom().primaryKey(),
  partNo: varchar("part_no", { length: 50 }).unique().notNull(),
  partName: varchar("part_name", { length: 300 }).notNull(),
  specification: varchar("specification", { length: 500 }),
  applicableModelId: uuid("applicable_model_id"),
  currentStock: decimal("current_stock", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  safetyStock: decimal("safety_stock", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  unit: varchar("unit", { length: 50 }).notNull().default("PIECE"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }),
  warehouseId: uuid("warehouse_id"),
  supplierId: uuid("supplier_id"),
  status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by"),
  version: integer("version").notNull().default(1),
});

export const sparePartStockMovement = pgTable("spare_part_stock_movement", {
  id: uuid("id").defaultRandom().primaryKey(),
  partId: uuid("part_id").notNull(),
  movementType: varchar("movement_type", { length: 50 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  businessType: varchar("business_type", { length: 50 }),
  businessId: uuid("business_id"),
  operatorId: uuid("operator_id"),
  operatedAt: timestamp("operated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MaintenanceWorkOrder = typeof maintenanceWorkOrder.$inferSelect;
export type MaintenancePlan = typeof maintenancePlan.$inferSelect;
export type MaintenanceRecord = typeof maintenanceRecord.$inferSelect;
export type SparePart = typeof sparePart.$inferSelect;
