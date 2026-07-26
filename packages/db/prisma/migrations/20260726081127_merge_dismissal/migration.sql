-- CreateTable
CREATE TABLE "MergeDismissal" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sourceMemberId" TEXT NOT NULL,
    "targetMemberId" TEXT NOT NULL,
    "dismissedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MergeDismissal_groupId_idx" ON "MergeDismissal"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "MergeDismissal_sourceMemberId_targetMemberId_key" ON "MergeDismissal"("sourceMemberId", "targetMemberId");

-- AddForeignKey
ALTER TABLE "MergeDismissal" ADD CONSTRAINT "MergeDismissal_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeDismissal" ADD CONSTRAINT "MergeDismissal_sourceMemberId_fkey" FOREIGN KEY ("sourceMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeDismissal" ADD CONSTRAINT "MergeDismissal_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeDismissal" ADD CONSTRAINT "MergeDismissal_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
