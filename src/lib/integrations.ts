// Catalog of services the browser companion can recognize from a hostname.
// The extension sends only these allowlisted slugs (never full domains, URLs, or
// page text). The slugs mirror the hostname fragments in the extension's
// `categories` map so the two stay in sync.

export type ServiceCategory = "Learning" | "Productivity";

export interface KnownService {
  name: string;
  category: ServiceCategory;
}

export const KNOWN_SERVICES: Record<string, KnownService> = {
  canvas: { name: "Canvas", category: "Learning" },
  instructure: { name: "Canvas", category: "Learning" },
  classroom: { name: "Google Classroom", category: "Learning" },
  blackboard: { name: "Blackboard", category: "Learning" },
  schoology: { name: "Schoology", category: "Learning" },
  moodle: { name: "Moodle", category: "Learning" },
  collegeboard: { name: "College Board", category: "Learning" },
  khanacademy: { name: "Khan Academy", category: "Learning" },
  quizlet: { name: "Quizlet", category: "Learning" },
  desmos: { name: "Desmos", category: "Learning" },
  edpuzzle: { name: "Edpuzzle", category: "Learning" },
  "docs.google": { name: "Google Docs", category: "Productivity" },
  "drive.google": { name: "Google Drive", category: "Productivity" },
  "calendar.google": { name: "Google Calendar", category: "Productivity" },
  notion: { name: "Notion", category: "Productivity" },
  slack: { name: "Slack", category: "Productivity" },
  github: { name: "GitHub", category: "Productivity" },
  figma: { name: "Figma", category: "Productivity" },
  office: { name: "Microsoft 365", category: "Productivity" },
  microsoft: { name: "Microsoft 365", category: "Productivity" },
  dropbox: { name: "Dropbox", category: "Productivity" },
};

export const KNOWN_SERVICE_SLUGS = Object.keys(KNOWN_SERVICES) as [string, ...string[]];

export function isKnownService(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(KNOWN_SERVICES, slug);
}
