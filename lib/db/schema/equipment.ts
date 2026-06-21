import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  decimal,
  jsonb,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";

export const equipmentCategory = pgTable("equipment_category", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  parentId: uuid("parent_id"),
  description: text("description"),
  requiresOperatorCertificate: boolean(
    "requires_operator_certificate"
  ).default(false),
  sortOrder: varchar("sort_order", { length: 10 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const equipmentModel = pgTable("equipment_model", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull(),
  modelName: varchar("model_name", { length: 200 }).notNull(),
  brand: varchar("brand", { length: 100 }),
  specification: varchar("specification", { length: 500 }),
  tonnage: decimal("tonnage", { precision: 10, scale: 2 }),
  standardDailyRent: decimal("standard_daily_rent", {
    precision: 15,
    scale: 2,
  }),
  standardMonthlyRent: decimal("standard_monthly_rent", {
    precision: 15,
    scale: 2,
  }),
  standardHourlyRent: decimal("standard_hourly_rent", {
    precision: 15,
    scale: 2,
  }),
  standardDeposit: decimal("standard_deposit", { precision: 15, scale: 2 }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const equipment = pgTable("equipment", {
  id: uuid("id").defaultRandom().primaryKey(),
  equipmentNo: varchar("equipment_no", { length: 50 }).unique().notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  categoryId: uuid("category_id").notNull(),
  modelId: uuid("model_id"),
  factoryNo: varchar("factory_no", { length: 100 }),
  brand: varchar("brand", { length: 100 }),
  manufacturerId: uuid("manufacturer_id"),
  specification: varchar("specification", { length: 500 }),
  tonnage: decimal("tonnage", { precision: 10, scale: 2 }),
  conditionLevel: varchar("condition_level", { length: 10 })
    .notNull()
    .default("A"),
  newnessLevel: varchar("newness_level", { length: 20 })
    .notNull()
    .default("GOOD"),
  purchaseDate: date("purchase_date"),
  purchasePrice: decimal("purchase_price", { precision: 15, scale: 2 }),
  serviceYears: integer("service_years"),
  depreciationYears: integer("depreciation_years").notNull().default(8),
  residualRate: decimal("residual_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("5.00"),
  currentResidualValue: decimal("current_residual_value", {
    precision: 15,
    scale: 2,
  }),
  warehouseId: uuid("warehouse_id"),
  stationId: uuid("station_id"),
  currentLocationType: varchar("current_location_type", { length: 50 })
    .notNull()
    .default("WAREHOUSE"),
  currentLocationId: uuid("current_location_id"),
  currentLocationText: text("current_location_text"),
  currentCustomerId: uuid("current_customer_id"),
  currentProjectSiteId: uuid("current_project_site_id"),
  currentOrderId: uuid("current_order_id"),
  currentContractId: uuid("current_contract_id"),
  currentResponsibleUserId: uuid("current_responsible_user_id"),
  currentOperatorId: uuid("current_operator_id"),
  status: varchar("status", { length: 50 }).notNull().default("IN_STOCK"),
  standardRent: decimal("standard_rent", { precision: 15, scale: 2 }),
  standardDeposit: decimal("standard_deposit", { precision: 15, scale: 2 }),
  gpsEnabled: boolean("gps_enabled").notNull().default(false),
  requiresOperatorCertificate: boolean(
    "requires_operator_certificate"
  ).default(false),
  withDriverRental: boolean("with_driver_rental").default(false),
  scrapped: boolean("scrapped").notNull().default(false),
  photoPaths: jsonb("photo_paths").default([]),
  nameplatePhotoPaths: jsonb("nameplate_photo_paths").default([]),
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

export const equipmentDocument = pgTable("equipment_document", {
  id: uuid("id").defaultRandom().primaryKey(),
  equipmentId: uuid("equipment_id").notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  storagePath: varchar("storage_path", { length: 1000 }).notNull(),
  fileSize: varchar("file_size", { length: 20 }),
  mimeType: varchar("mime_type", { length: 100 }),
  uploadedBy: uuid("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const equipmentStatusLog = pgTable("equipment_status_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  equipmentId: uuid("equipment_id").notNull(),
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  changeReason: text("change_reason"),
  businessType: varchar("business_type", { length: 50 }).notNull(),
  businessId: uuid("business_id").notNull(),
  changedBy: uuid("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const equipmentLocationLog = pgTable("equipment_location_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  equipmentId: uuid("equipment_id").notNull(),
  fromLocationType: varchar("from_location_type", { length: 50 }),
  fromLocationId: uuid("from_location_id"),
  fromLocationText: text("from_location_text"),
  toLocationType: varchar("to_location_type", { length: 50 }).notNull(),
  toLocationId: uuid("to_location_id"),
  toLocationText: text("to_location_text"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  locatedAt: timestamp("located_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  businessType: varchar("business_type", { length: 50 }).notNull(),
  businessId: uuid("business_id").notNull(),
  operatorId: uuid("operator_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
export type EquipmentCategory = typeof equipmentCategory.$inferSelect;
export type EquipmentModel = typeof equipmentModel.$inferSelect;
