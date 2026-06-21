import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const notification = pgTable("notification", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipientId: uuid("recipient_id").notNull(),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  businessType: varchar("business_type", { length: 50 }),
  businessId: uuid("business_id"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Notification = typeof notification.$inferSelect;
