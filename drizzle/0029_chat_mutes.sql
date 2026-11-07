CREATE TABLE "dm_mutes" (
	"user_id" integer NOT NULL,
	"peer_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_mutes_user_id_peer_id_pk" PRIMARY KEY("user_id","peer_id"),
	CONSTRAINT "dm_mutes_not_self" CHECK ("dm_mutes"."user_id" != "dm_mutes"."peer_id")
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "muted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_mutes" ADD CONSTRAINT "dm_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_mutes" ADD CONSTRAINT "dm_mutes_peer_id_users_id_fk" FOREIGN KEY ("peer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;