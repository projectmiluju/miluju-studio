/** 지원하는 에이전트 타입 */
export type AgentTarget = "claude-code" | "cursor" | "gemini";

export const AGENT_TARGETS: AgentTarget[] = [
  "claude-code",
  "cursor",
  "gemini",
];

/** 스킬 파이프라인의 역할 목록 */
const ROLES = [
  "planner",
  "designer",
  "fullstack",
  "tester",
  "releaser",
  "devops",
  "scribe",
] as const;

/**
 * 에이전트별 역할 참조 변환 규칙
 *
 * 원본 스킬에서는 **planner**, **designer** 등 볼드 역할명을 사용합니다.
 * 각 에이전트의 호출 방식에 맞게 변환합니다.
 */
function getRoleReplacer(
  target: AgentTarget
): (role: string) => string {
  switch (target) {
    case "claude-code":
      return (role) => `\`/${role}\``;
    case "cursor":
      return (role) => `\`@${role}\``;
    case "gemini":
      return (role) => `**${role}** (프롬프트 파일: \`skills/${role}.md\`)`;
  }
}

/**
 * 에이전트별 헤더 코멘트
 */
function getHeader(target: AgentTarget, skillName: string): string {
  const timestamp = new Date().toISOString().split("T")[0];
  const agentLabel = {
    "claude-code": "Claude Code",
    cursor: "Cursor",
    gemini: "Gemini CLI",
  }[target];

  return [
    `<!-- 이 파일은 miluju-studio의 gen-skill-docs에 의해 자동 생성되었습니다. -->`,
    `<!-- 대상 에이전트: ${agentLabel} | 생성일: ${timestamp} -->`,
    `<!-- 원본을 수정하려면 skills/${skillName}.md 또는 skills/_base.md를 편집하세요. -->`,
    "",
  ].join("\n");
}

/**
 * 에이전트별 파이프라인 참조 블록을 삽입합니다.
 * _base.md의 에이전트별 호출 방식 테이블 대신, 해당 에이전트에 맞는 안내만 추가.
 */
function getPipelineNote(target: AgentTarget): string {
  switch (target) {
    case "claude-code":
      return [
        "> **스킬 호출:** 슬래시 명령어를 사용하세요.",
        "> `/planner` → `/designer` → `/fullstack` → `/tester` → `/releaser` → `/devops` → `/scribe`",
        "",
      ].join("\n");
    case "cursor":
      return [
        "> **스킬 호출:** @ 멘션을 사용하세요.",
        "> `@planner` → `@designer` → `@fullstack` → `@tester` → `@releaser` → `@devops` → `@scribe`",
        "",
      ].join("\n");
    case "gemini":
      return [
        "> **스킬 호출:** 프롬프트 파일을 참조하세요.",
        "> `skills/planner.md` → `skills/designer.md` → ... → `skills/scribe.md`",
        "",
      ].join("\n");
  }
}

/**
 * 마크다운 본문에서 볼드 역할 참조(**planner** 등)를 에이전트별 구문으로 변환합니다.
 */
function transformRoleReferences(
  content: string,
  target: AgentTarget
): string {
  const replacer = getRoleReplacer(target);
  let result = content;

  for (const role of ROLES) {
    // **role** 패턴 (단어 경계에서) → 에이전트별 구문
    // 단, 코드 블록 내부는 제외하기 위해 줄 단위로 처리
    const pattern = new RegExp(`\\*\\*${role}\\*\\*`, "g");
    result = result.replace(pattern, replacer(role));
  }

  return result;
}

/**
 * _base.md의 에이전트별 호출 테이블을 해당 에이전트 전용 안내로 교체합니다.
 */
function transformBaseContent(
  baseContent: string,
  target: AgentTarget
): string {
  // 에이전트별 호출 방식 테이블 영역을 파이프라인 노트로 교체
  const tablePattern =
    /각 역할은 에이전트의 호출 방식에 따라 참조합니다:[\s\S]*?문서 내에서 역할을 참조할 때는.*볼드체 역할명.*을 사용합니다\./;

  let result = baseContent.replace(tablePattern, getPipelineNote(target));
  result = transformRoleReferences(result, target);

  return result;
}

/**
 * 스킬 본문 + _base.md를 에이전트 대상에 맞게 변환합니다.
 */
export function transformForAgent(
  mergedContent: string,
  target: AgentTarget,
  skillName: string
): string {
  const header = getHeader(target, skillName);

  // 부록의 _base.md 부분도 에이전트별로 변환
  const parts = mergedContent.split(
    "# 부록: miluju-studio 공통 원칙"
  );

  let transformed: string;

  if (parts.length === 2) {
    const skillPart = transformRoleReferences(parts[0], target);
    const basePart = transformBaseContent(parts[1], target);
    transformed = `${skillPart}# 부록: miluju-studio 공통 원칙${basePart}`;
  } else {
    transformed = transformRoleReferences(mergedContent, target);
  }

  return header + transformed;
}
