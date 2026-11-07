CREATE TABLE "group_message_reactions" (
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_message_reactions_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "reply_to_id" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_id" integer;--> statement-breakpoint
ALTER TABLE "group_message_reactions" ADD CONSTRAINT "group_message_reactions_message_id_group_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_reactions" ADD CONSTRAINT "group_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_reply_to_id_group_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."group_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_messages_reply_to_id" ON "group_messages" USING btree ("reply_to_id") WHERE "group_messages"."reply_to_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_reply_to_id" ON "messages" USING btree ("reply_to_id") WHERE "messages"."reply_to_id" IS NOT NULL;