CREATE TABLE "identity_members" (
	"identity_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_members_identity_id_account_id_pk" PRIMARY KEY("identity_id","account_id"),
	CONSTRAINT "identity_members_not_self" CHECK ("identity_members"."identity_id" != "identity_members"."account_id")
);
--> statement-breakpoint
ALTER TABLE "identity_members" ADD CONSTRAINT "identity_members_identity_id_users_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_members" ADD CONSTRAINT "identity_members_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_members_account_id" ON "identity_members" USING btree ("account_id");