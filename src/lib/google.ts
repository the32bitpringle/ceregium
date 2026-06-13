import { decrypt, encrypt } from "@/lib/encryption";
import type { ConnectorConnection, TokenSet, WorkloadItem } from "@/lib/types";

export const googleScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export async function exchangeGoogleCode(code: string): Promise<TokenSet> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${await response.text()}`);
  const result = await response.json();
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    scopes: String(result.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function refreshGoogleToken(tokens: TokenSet): Promise<TokenSet> {
  if (!tokens.refreshToken) throw new Error("Google refresh token is missing");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed: ${await response.text()}`);
  const result = await response.json();
  return {
    accessToken: result.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    scopes: tokens.scopes,
  };
}

export function encryptTokenSet(tokens: TokenSet) {
  return encrypt(JSON.stringify(tokens));
}

export function decryptTokenSet(value: string): TokenSet {
  return JSON.parse(decrypt(value)) as TokenSet;
}

export async function validGoogleTokens(connection: ConnectorConnection): Promise<TokenSet> {
  const tokens = decryptTokenSet(connection.encryptedTokens);
  if (!tokens.expiresAt || new Date(tokens.expiresAt).getTime() > Date.now() + 60_000) return tokens;
  return refreshGoogleToken(tokens);
}

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google API failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

interface GoogleCourse {
  id: string;
  name: string;
}

interface GoogleCourseWork {
  id: string;
  title: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
  state?: string;
  maxPoints?: number;
}

interface CalendarEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export async function fetchGoogleWorkload(accessToken: string): Promise<WorkloadItem[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const items: WorkloadItem[] = [];

  const calendar = await googleJson<{ items?: CalendarEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: horizon.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    })}`,
    accessToken,
  );
  for (const event of calendar.items ?? []) {
    const dueAt = event.start.dateTime ?? event.start.date;
    if (!dueAt) continue;
    items.push({
      id: `calendar-${event.id}`,
      title: event.summary || "Calendar event",
      source: "Google Calendar",
      dueAt,
      status: "upcoming",
    });
  }

  const courses = await googleJson<{ courses?: GoogleCourse[] }>(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=50",
    accessToken,
  );
  await Promise.all(
    (courses.courses ?? []).map(async (course) => {
      const coursework = await googleJson<{ courseWork?: GoogleCourseWork[] }>(
        `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?pageSize=100&courseWorkStates=PUBLISHED`,
        accessToken,
      );
      for (const work of coursework.courseWork ?? []) {
        if (!work.dueDate) continue;
        const dueAt = new Date(
          Date.UTC(
            work.dueDate.year,
            work.dueDate.month - 1,
            work.dueDate.day,
            work.dueTime?.hours ?? 23,
            work.dueTime?.minutes ?? 59,
          ),
        ).toISOString();
        items.push({
          id: `classroom-${course.id}-${work.id}`,
          title: work.title,
          source: "Google Classroom",
          course: course.name,
          dueAt,
          status: new Date(dueAt) < now ? "overdue" : "upcoming",
          pointsPossible: work.maxPoints,
          gradeImpact: "unknown",
        });
      }
    }),
  );

  return items.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}
