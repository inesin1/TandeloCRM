CREATE TYPE "public"."stage_outcome" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "workspace_settings_singleton" CHECK ("workspace_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "outcome" "stage_outcome" DEFAULT 'open' NOT NULL;--> statement-breakpoint
WITH new_pipeline AS (
  INSERT INTO "pipelines" ("name")
  SELECT 'Sales' WHERE NOT EXISTS (SELECT 1 FROM "pipelines")
  RETURNING "id"
)
INSERT INTO "statuses" ("pipelineId", "name", "color", "sortOrder", "outcome")
SELECT new_pipeline."id", stages.name, stages.color, stages.position, stages.outcome::"stage_outcome"
FROM new_pipeline
CROSS JOIN (VALUES
  ('New', '#2563eb', 10, 'open'),
  ('Qualified', '#0d9488', 20, 'open'),
  ('Proposal', '#7c3aed', 30, 'open'),
  ('Won', '#15803d', 40, 'won'),
  ('Lost', '#64748b', 50, 'lost')
) AS stages(name, color, position, outcome);
