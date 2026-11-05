CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "messages_not_self" CHECK ("messages"."sender_id" != "messages"."recipient_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_sender_recipient" ON "messages" USING btree ("sender_id","recipient_id","id");--> statement-breakpoint
CREATE INDEX "messages_recipient_sender" ON "messages" USING btree ("recipient_id","sender_id","id");--> statement-breakpoint
CREATE INDEX "messages_unread" ON "messages" USING btree ("recipient_id","sender_id") WHERE "messages"."read_at" IS NULL;