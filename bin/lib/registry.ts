/**
 * miluju-studio GitHub 레지스트리 클라이언트
 *
 * GitHub Releases API로 최신 버전을 조회하고,
 * GitHub Raw URL에서 스킬 파일을 직접 fetch합니다.
 *
 * 이 모듈 덕분에 miluju-studio를 clone하지 않아도
 * `npx miluju install`로 어느 프로젝트에서든 스킬을 설치할 수 있습니다.
 */

export const GITHUB_REPO = "projectmiluju/miluju-studio";
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}`;

const FETCH_TIMEOUT_MS = 10_000;

export interface ReleaseInfo {
  version: string;   // "1.0.0" (v 접두사 제거)
  tag: string;       // "v1.0.0"
  publishedAt: string;
  notes: string;
}

/**
 * GitHub Releases API에서 최신 릴리즈 정보를 조회합니다.
 * 네트워크 오류나 타임아웃 시 null을 반환합니다.
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      tag_name: string;
      published_at: string;
      body: string;
    };

    const tag = data.tag_name;
    const version = tag.startsWith("v") ? tag.slice(1) : tag;

    return {
      version,
      tag,
      publishedAt: data.published_at,
      notes: data.body ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * GitHub Raw URL에서 특정 버전의 스킬 파일을 fetch합니다.
 *
 * @param tag    - Git 태그 (예: "v1.0.0") 또는 "main"
 * @param agent  - 에이전트 이름 (예: "cursor")
 * @param skill  - 스킬 이름 (예: "spec")
 */
export async function fetchSkillContent(
  tag: string,
  agent: string,
  skill: string
): Promise<string | null> {
  const url = `${RAW_BASE}/${tag}/dist/skills/${agent}/${skill}.md`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * GitHub Raw URL에서 issue-template 파일을 fetch합니다.
 *
 * @param tag      - Git 태그 또는 "main"
 * @param filename - 파일명 (예: "bug_report.md")
 */
export async function fetchIssueTemplate(
  tag: string,
  filename: string
): Promise<string | null> {
  const url = `${RAW_BASE}/${tag}/src/issue-templates/${filename}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * 스킬 파일의 frontmatter에서 version을 추출합니다.
 */
export function extractVersionFromContent(content: string): string {
  const match = content.match(/^---\n[\s\S]*?^version:\s*"?([^"\n]+)"?/m);
  return match ? match[1].trim() : "0.0.0";
}

/**
 * 시맨틱 버전 비교 (a > b → 양수)
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
