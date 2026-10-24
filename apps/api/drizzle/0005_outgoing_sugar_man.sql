CREATE TABLE "copilot_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversationId" integer NOT NULL,
	"runId" uuid NOT NULL,
	"userId" integer NOT NULL,
	"callId" text NOT NULL,
	"toolName" text NOT NULL,
	"validatedPayload" jsonb NOT NULL,
	"beforeSnapshot" jsonb,
	"requiredPermissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"result" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"executedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "copilot_conversations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "copilot_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"title" text DEFAULT 'Новый чат' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "copilot_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"runId" uuid,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requiredPermissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"clientRequestId" uuid NOT NULL,
	"requestHash" text NOT NULL,
	"context" jsonb,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"deadlineAt" timestamp NOT NULL,
	"finishedAt" timestamp,
	"errorCode" text,
	"usage" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_conversationId_copilot_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_runId_copilot_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."copilot_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_conversations" ADD CONSTRAINT "copilot_conversations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_conversationId_copilot_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_runId_copilot_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."copilot_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_runs" ADD CONSTRAINT "copilot_runs_conversationId_copilot_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_runs" ADD CONSTRAINT "copilot_runs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "copilot_actions_runId_callId_index" ON "copilot_actions" USING btree ("runId","callId");--> statement-breakpoint
CREATE INDEX "copilot_conversations_userId_updatedAt_id_index" ON "copilot_conversations" USING btree ("userId","updatedAt","id");--> statement-breakpoint
CREATE INDEX "copilot_messages_conversationId_id_index" ON "copilot_messages" USING btree ("conversationId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "copilot_messages_runId_role_index" ON "copilot_messages" USING btree ("runId","role");--> statement-breakpoint
CREATE UNIQUE INDEX "copilot_runs_conversationId_clientRequestId_index" ON "copilot_runs" USING btree ("conversationId","clientRequestId");--> statement-breakpoint
CREATE UNIQUE INDEX "copilot_runs_conversationId_index" ON "copilot_runs" USING btree ("conversationId") WHERE "copilot_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "copilot_runs_userId_status_createdAt_index" ON "copilot_runs" USING btree ("userId","status","createdAt");