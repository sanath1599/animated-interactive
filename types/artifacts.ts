export type ArtifactKind = "html" | "screenshot" | "verification-report" | "evidence-report";

export interface ArtifactInfo {
  id: string;
  kind: ArtifactKind;
  name: string;
  size: number;
  contentType: string;
}
