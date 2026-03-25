import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** YAML frontmatter에서 추출한 메타데이터 */
export interface SkillMeta {
  description: string;
}

/** 파싱된 스킬 문서 */
export interface ParsedSkill {
  /** 파일명 (확장자 제외) — "planner", "designer" 등 */
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
    return { meta: { description: "" }, body: content };
  }

  const [, yaml, body] = match;
  const descMatch = yaml.match(/description:\s*\|?\s*\n?([\s\S]*)/);
  const description = descMatch
    ? descMatch[1]
        .split("\n")
        .map((line) => line.replace(/^\s{2}/, "").trim())
        .filter(Boolean)
        .join(" ")
    : "";

  return { meta: { description }, body: body.trimStart() };
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
 * skills/ 디렉토리에서 _base.md를 제외한 모든 .md 파일을 파싱합니다.
 */
export async function loadSkills(skillsDir: string): Promise<ParsedSkill[]> {
  const files = await readdir(skillsDir);
  const mdFiles = files
    .filter((f) => f.endsWith(".md") && f !== "_base.md")
    .sort();

  const skills: ParsedSkill[] = [];

  for (const file of mdFiles) {
    const raw = await readFile(join(skillsDir, file), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const name = file.replace(/\.md$/, "");
    skills.push({ name, meta, body, raw });
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
