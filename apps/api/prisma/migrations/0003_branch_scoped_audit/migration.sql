ALTER TABLE "audit_logs" ADD COLUMN "branch_id" TEXT;

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_logs_branch_id_created_at_idx"
ON "audit_logs"("branch_id", "created_at");
