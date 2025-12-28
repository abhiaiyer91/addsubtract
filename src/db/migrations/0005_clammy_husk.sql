ALTER TABLE "package_maintainers" DROP CONSTRAINT "package_maintainers_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "package_maintainers" DROP CONSTRAINT "package_maintainers_added_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "package_maintainers" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "package_maintainers" ALTER COLUMN "added_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "package_maintainers" ADD CONSTRAINT "package_maintainers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_maintainers" ADD CONSTRAINT "package_maintainers_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;