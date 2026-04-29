import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** YAML frontmatter에서 추출한 메타데이터 */
export interface SkillMeta {
  description: string;
  version: string;
}

/** 파싱된 스킬 문서 */
export interface ParsedSkill {
  /** 파일명 (확장자 제외) — "spec", "ui" 등 */
  name: string;
  /** frontmatter에서 추출한 메타데이터 */
  meta: SkillMeta;
  /** frontmatter를 제거한 본문 마크다운 */
  body: string;
  /** 원본 전체 내용 */
  raw: string;
}

/**
 * 간이 YAML frontmatter 파서.
 * `---` 로 감싸진 블록에서 description 필드를 추출합니다.
 */
function parseFrontmatter(content: string): { meta: SkillMeta; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { meta: { description: "", version: "0.0.0" }, body: content };
  }

  const [, yaml, body] = match;
  const descMatch = yaml.match(/description:\s*\|?\s*\n?([\s\S]*?)(?=\n\w|\n---$|$)/);
  const description = descMatch
    ? descMatch[1]
        .split("\n")
        .map((line) => line.replace(/^\s{2}/, "").trim())
        .filter(Boolean)
        .join(" ")
    : "";

  const versionMatch = yaml.match(/^version:\s*"?([^"\n]+)"?/m);
  const version = versionMatch ? versionMatch[1].trim() : "0.0.0";

  return { meta: { description, version }, body: body.trimStart() };
}

/**
 * skills/ 디렉토리에서 _base.md를 읽어 반환합니다.
 */
export async function loadBase(skillsDir: string): Promise<string> {
  const content = await readFile(join(skillsDir, "_base.md"), "utf-8");
  const { body } = parseFrontmatter(content);
  return body;
}

/**
 * 본문에 frontmatter 잔재(`version: "..."` + `---`)가 누출되었는지 검사합니다.
 * 발견 시 stderr에 경고를 출력하고, 누출 개수를 반환합니다.
 */
export function detectFrontmatterLeak(body: string, fileName: string): number {
  const matches = body.match(/\nversion:\s*"[^"]+"\n---\n/g);
  if (!matches) return 0;

  console.warn(
    `⚠️  ${fileName}: 본문에 frontmatter 잔재 ${matches.length}개 발견. ` +
      `\`version: "..."\` 라인이 frontmatter 외부에 있습니다. ` +
      `섹션 구분자로는 \`---\`만 사용하세요.`
  );
  return matches.length;
}

/**
 * skills/ 디렉토리에서 _base.md를 제외한 모든 .md 파일을 파싱합니다.
 * 본문에 frontmatter 잔재가 있으면 경고하고 총 누출 개수를 stderr에 보고합니다.
 */
export async function loadSkills(skillsDir: string): Promise<ParsedSkill[]> {
  const files = await readdir(skillsDir);
  const mdFiles = files
    .filter((f) => f.endsWith(".md") && f !== "_base.md")
    .sort();

  const skills: ParsedSkill[] = [];
  let totalLeaks = 0;

  for (const file of mdFiles) {
    const raw = await readFile(join(skillsDir, file), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const name = file.replace(/\.md$/, "");
    totalLeaks += detectFrontmatterLeak(body, file);
    skills.push({ name, meta, body, raw });
  }

  if (totalLeaks > 0) {
    console.warn(
      `\n⚠️  총 ${totalLeaks}개 frontmatter 잔재 발견. ` +
        `gen 산출물도 오염될 수 있으므로 정리 후 다시 실행하세요.`
    );
  }

  return skills;
}

/**
 * _base.md 본문과 스킬 본문을 병합하여 독립 실행 가능한 문서를 생성합니다.
 * - _base.md 참조 라인(`> 이 스킬은 _base.md...`)을 제거
 * - _base.md 내용을 스킬 본문 뒤에 부록으로 추가
 */
export function mergeBaseIntoSkill(
  baseBody: string,
  skill: ParsedSkill
): string {
  // _base.md 참조 라인 제거
  const bodyWithoutRef = skill.body.replace(
    /^>.*_base\.md.*공통 원칙.*\n\n?/m,
    ""
  );

  const merged = [
    bodyWithoutRef.trimEnd(),
    "",
    "---",
    "",
    "# 부록: miluju-studio 공통 원칙",
    "",
    "> 아래 내용은 `_base.md`에서 자동으로 인라인된 공통 원칙입니다.",
    "",
    baseBody.trimEnd(),
    "",
  ].join("\n");

  return merged;
}
