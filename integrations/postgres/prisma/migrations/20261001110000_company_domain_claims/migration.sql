-- Company-wide custom domains awaiting DNS ownership verification.
CREATE TABLE "CompanyDomainClaim" (
    "organizationId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDomainClaim_pkey" PRIMARY KEY ("organizationId","hostname")
);

ALTER TABLE "CompanyDomainClaim" ADD CONSTRAINT "CompanyDomainClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
