export type Provider =
  | "google-classroom"
  | "google-calendar"
  | "gmail"
  | "notion"
  | "discord"
  | "slack"
  | "canvas"
  | "todoist"
  | "x"
  | "instagram";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
}

export interface ConnectorConnection {
  id: string;
  userId: string;
  provider: Provider;
  encryptedTokens: string;
  scopes: string[];
}

export interface SyncPage {
  events: NormalizedEvent[];
  nextCursor?: string;
}

export interface NormalizedEvent {
  externalId: string;
  provider: Provider;
  category: "assignment" | "calendar" | "task" | "communication" | "social" | "activity";
  occurredAt: string;
  sensitivity: "metadata" | "content";
  consentScope: string;
  features: Record<string, number | string | boolean>;
  encryptedContent?: string;
}

export interface ConnectorAdapter {
  provider: Provider;
  getAuthorizationUrl(state: string): Promise<string>;
  exchangeAuthorizationCode(code: string): Promise<TokenSet>;
  refreshToken(connection: ConnectorConnection): Promise<TokenSet>;
  sync(connection: ConnectorConnection, cursor?: string): Promise<SyncPage>;
  revoke(connection: ConnectorConnection): Promise<void>;
  deleteImportedData(userId: string, connectionId: string): Promise<void>;
}
