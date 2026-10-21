import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { experimentsTable } from "./experiments";

export const experimentCommentsTable = pgTable(
  "lab_experiment_comments",
  {
    id: serial("id").primaryKey(),
    experimentId: integer("experiment_id").notNull().references(() => experimentsTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull(),
    authorRole: text("author_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lab_experiment_comments_experiment_idx").on(table.experimentId, table.createdAt)],
);
