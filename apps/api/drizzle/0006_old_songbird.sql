CREATE TABLE "copilot_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"apiFormat" text NOT NULL,
	"baseUrl" text NOT NULL,
	"model" text NOT NULL,
	"apiKeyEncrypted" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "copilot_settings_singleton" CHECK ("copilot_settings"."id" = 1)
);
