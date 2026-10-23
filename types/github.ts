export interface Repo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerType: string;
  description: string | null;
  visibility: "public" | "private";
  defaultBranch: string;
  url: string;
  installationId: number;
  archived: boolean;
}
export interface Installation { id: number; account: string; accountType: string }
export interface Branch { name: string; protected: boolean }
