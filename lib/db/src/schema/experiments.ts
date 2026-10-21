import {
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const experimentsTable = pgTable(
  "lab_experiments",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("planned"),
    experimentDate: date("experiment_date", { mode: "string" }).notNull(),
    hypothesis: text("hypothesis").notNull().default(""),
    materials: text("materials").notNull().default(""),
    protocol: text("protocol").notNull().default(""),
    observations: text("observations").notNull().default(""),
    results: text("results").notNull().default(""),
    conclusion: text("conclusion").notNull().default(""),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("lab_experiments_project_updated_idx").on(table.projectId, table.updatedAt),
    index("lab_experiments_date_idx").on(table.experimentDate),
  ],
);
