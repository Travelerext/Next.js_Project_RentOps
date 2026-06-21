import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const approvalRequest = pgTable("approval_request", {
  id: uuid("id").defaultRandom().primaryKey(),
  approvalNo: varchar("approval_no", { length: 50 }).unique().notNull(),
  approvalType: varchar("approval_type", { length: 100 }).notNull(),
  businessType: varchar("business_type", { length: 50 }).notNull(),
  businessId: uuid("business_id").notNull(),
  applicantId: uuid("applicant_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  approvalConfig: jsonb("approval_config").notNull().default({}),
  currentStep: integer("current_step").notNull().default(1),
  status: varchar("status", { length: 50 }).notNull().default("SUBMITTED"),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  remark: text("remark"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  version: integer("version").notNull().default(1),
});

export const approvalStepRecord = pgTable("approval_step_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  approvalId: uuid("approval_id").notNull(),
  step: integer("step").notNull(),
  approverId: uuid("approver_id"),
  action: varchar("action", { length: 50 }),
  comment: text("comment"),
  actedAt: timestamp("acted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ApprovalRequest = typeof approvalRequest.$inferSelect;
export type ApprovalStepRecord = typeof approvalStepRecord.$inferSelect;
