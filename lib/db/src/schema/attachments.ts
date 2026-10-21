import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { experimentsTable } from "./experiments";

export const experimentAttachmentsTable = pgTable(
  "lab_experiment_attachments",
  {
    id: serial("id").primaryKey(),
    experimentId: integer("experiment_id").notNull().references(() => experimentsTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    objectPath: text("object_path").notNull().unique(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lab_experiment_attachments_experiment_idx").on(table.experimentId, table.createdAt)],
);
