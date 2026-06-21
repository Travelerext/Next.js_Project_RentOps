import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  supabaseUserId: uuid("supabase_user_id").unique().notNull(),
  employeeNo: varchar("employee_no", { length: 50 }).unique(),
  username: varchar("username", { length: 100 }).unique().notNull(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  realName: varchar("real_name", { length: 200 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  accountType: varchar("account_type", { length: 50 })
    .notNull()
    .default("INTERNAL_STAFF"),
  accountStatus: varchar("account_status", { length: 50 })
    .notNull()
    .default("PENDING"),
  loginEnabled: boolean("login_enabled").notNull().default(false),
  departmentId: uuid("department_id"),
  stationId: uuid("station_id"),
  warehouseId: uuid("warehouse_id"),
  primaryRole: varchar("primary_role", { length: 50 }),
  defaultDashboard: varchar("default_dashboard", { length: 50 })
    .notNull()
    .default("SALES_DASHBOARD"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: varchar("last_login_ip", { length: 50 }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const role = pgTable("role", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleCode: varchar("role_code", { length: 50 }).unique().notNull(),
  roleName: varchar("role_name", { length: 100 }).notNull(),
  roleType: varchar("role_type", { length: 50 }).notNull().default("CUSTOM"),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: varchar("sort_order", { length: 10 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permission = pgTable("permission", {
  id: uuid("id").defaultRandom().primaryKey(),
  permissionCode: varchar("permission_code", { length: 100 }).unique().notNull(),
  permissionName: varchar("permission_name", { length: 200 }).notNull(),
  moduleCode: varchar("module_code", { length: 50 }).notNull(),
  permissionType: varchar("permission_type", { length: 50 })
    .notNull()
    .default("MENU"),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  sensitive: boolean("sensitive").notNull().default(false),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const profileRole = pgTable("profile_role", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull(),
  roleId: uuid("role_id").notNull(),
});

export const rolePermission = pgTable("role_permission", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id").notNull(),
  permissionId: uuid("permission_id").notNull(),
});

export const dataScopeRule = pgTable("data_scope_rule", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  scopeType: varchar("scope_type", { length: 50 }).notNull().default("ALL"),
  scopeValue: jsonb("scope_value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Role = typeof role.$inferSelect;
export type Permission = typeof permission.$inferSelect;
