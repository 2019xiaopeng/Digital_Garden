import { isTauriAvailable } from "./dataService";

export const VIDEO_LINK_REGEX = /(https?:\/\/(?:www\.)?bilibili\.com\/video\/BV[0-9A-Za-z]+[^\s]*)/i;
export const TIMESTAMP_REGEX = /\[(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\]/g;

export function extractBilibiliVideoUrl(input: string): string | null {
  const match = input.match(VIDEO_LINK_REGEX);
  return match ? match[1] : null;
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fm) return { frontmatter: {}, body: content };

  const raw = fm[1].split("\n");
  const frontmatter: Record<string, string> = {};
  for (const line of raw) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value;
  }

  const body = content.slice(fm[0].length);
  return { frontmatter, body };
}

export function upsertVideoFrontmatter(content: string, videoUrl: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  frontmatter.video = videoUrl;

  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

export function getVideoUrlFromMarkdown(content: string): string | null {
  const { frontmatter } = parseFrontmatter(content);
  return frontmatter.video || null;
}

export function timestampToSeconds(timestamp: string): number | null {
  const match = timestamp.match(/^\[(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\]$/);
  if (!match) return null;
  if (match[3] !== undefined) {
    const hours = Number(match[1]);
    const mins = Number(match[2]);
    const secs = Number(match[3]);
    return hours * 3600 + mins * 60 + secs;
  }
  const mins = Number(match[1]);
  const secs = Number(match[2]);
  return mins * 60 + secs;
}

export function buildVideoUrlWithTimestamp(videoUrl: string, seconds: number): string {
  const normalized = new URL(videoUrl);
  normalized.searchParams.set("t", String(seconds));
  return normalized.toString();
}

export function replaceTimestampTagsWithLinks(html: string, videoUrl?: string | null): string {
  if (!videoUrl) return html;
  return html.replace(TIMESTAMP_REGEX, (full) => {
    const secs = timestampToSeconds(full);
    if (secs === null) return full;
    return `<a href="#" data-video-seconds="${secs}" class="video-timestamp-tag">${full}</a>`;
  });
}

export async function openExternalUrl(url: string) {
  if (isTauriAvailable()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch (error) {
      console.error("[Video] Failed to open url via Tauri opener:", error);
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
