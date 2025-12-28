-- Package Registry Migration
-- Adds npm-compatible package registry tables

-- Package visibility enum
CREATE TYPE "public"."package_visibility" AS ENUM('public', 'private');

-- Packages table - npm package metadata
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scope" text,
	"repo_id" uuid,
	"owner_id" uuid NOT NULL,
	"description" text,
	"visibility" "package_visibility" DEFAULT 'public' NOT NULL,
	"keywords" text,
	"license" text,
	"homepage" text,
	"repository_url" text,
	"readme" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"deprecated" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_scope_name_unique" UNIQUE("scope", "name")
);
--> statement-breakpoint

-- Package versions table - each published version
CREATE TABLE "package_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"version" text NOT NULL,
	"tag_name" text,
	"tarball_url" text NOT NULL,
	"tarball_sha512" text NOT NULL,
	"tarball_size" integer NOT NULL,
	"manifest" text NOT NULL,
	"dependencies" text,
	"dev_dependencies" text,
	"peer_dependencies" text,
	"optional_dependencies" text,
	"engines" text,
	"bin" text,
	"published_by" uuid NOT NULL,
	"deprecated" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_versions_package_id_version_unique" UNIQUE("package_id", "version")
);
--> statement-breakpoint

-- Package dist-tags - latest, beta, next, etc.
CREATE TABLE "package_dist_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"version_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_dist_tags_package_id_tag_unique" UNIQUE("package_id", "tag")
);
--> statement-breakpoint

-- Package maintainers - users who can publish
CREATE TABLE "package_maintainers" (
	"package_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid,
	CONSTRAINT "package_maintainers_package_id_user_id_pk" PRIMARY KEY("package_id", "user_id")
);
--> statement-breakpoint

-- Foreign key constraints
ALTER TABLE "packages" ADD CONSTRAINT "packages_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_dist_tags" ADD CONSTRAINT "package_dist_tags_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_dist_tags" ADD CONSTRAINT "package_dist_tags_version_id_package_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."package_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_maintainers" ADD CONSTRAINT "package_maintainers_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_maintainers" ADD CONSTRAINT "package_maintainers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_maintainers" ADD CONSTRAINT "package_maintainers_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Indexes for common queries
CREATE INDEX "packages_owner_id_idx" ON "packages" ("owner_id");
--> statement-breakpoint
CREATE INDEX "packages_scope_idx" ON "packages" ("scope");
--> statement-breakpoint
CREATE INDEX "packages_visibility_idx" ON "packages" ("visibility");
--> statement-breakpoint
CREATE INDEX "package_versions_package_id_idx" ON "package_versions" ("package_id");
--> statement-breakpoint
CREATE INDEX "package_dist_tags_package_id_idx" ON "package_dist_tags" ("package_id");
