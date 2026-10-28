import { z } from "zod";

/** A repository to fetch: shared by the connector tools and the dashboard. */
export const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("github"), repo: z.string().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/).describe("owner/name"), branch: z.string().max(200).optional() }),
  z.object({ type: z.literal("git"), url: z.string().url().max(500).describe("https URL from Azure DevOps, GitLab or Bitbucket"), branch: z.string().max(200).optional(), credentialId: z.string().max(40).optional() }),
  z.object({ type: z.literal("upload"), uploadId: z.string().max(40), name: z.string().max(120).optional() }),
]);
