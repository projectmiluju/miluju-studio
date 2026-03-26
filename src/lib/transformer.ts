/** 지원하는 에이전트 타입 */
export type AgentTarget =
  | "claude-code"
  | "cursor"
  | "gemini"
  | "codex"
  | "copilot"
  | "antigravity"
  | "kiro"
  | "windsurf";

export const AGENT_TARGETS: AgentTarget[] = [
  "claude-code",
  "cursor",
  "gemini",
  "codex",
  "copilot",
  "antigravity",
  "kiro",
  "windsurf",
];

/** 에이전트 표시 이름 */
const AGENT_LABELS: Record<AgentTarget, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  codex: "OpenAI Codex",
  copilot: "GitHub Copilot",
  antigravity: "Antigravity",
  kiro: "AWS Kiro",
  windsurf: "Windsurf",
};

/** 스킬 파이프라인의 역할 목록 */
const ROLES = [
  "spec",
  "ui",
  "build",
  "qa",
  "ship",
  "ops",
  "docs",
] as const;

/**
 * 에이전트별 역할 참조 변환 규칙
 *
 * 원본 스킬에서는 **spec**, **ui** 등 볼드 역할명을 사용합니다.
 * 각 에이전트의 호출 방식에 맞게 변환합니다.
 */
function getRoleReplacer(
  target: AgentTarget
): (role: string) => string {
  switch (target) {
    case "claude-code":
      // 슬래시 명령어: /spec, /ui
      return (role) => `\`/${role}\``;
    case "codex":
      // $ 스킬 호출: $spec, $ui
      return (role) => `\`$${role}\``;
    case "cursor":
    case "windsurf":
      // @ 멘션: @spec, @ui
      return (role) => `\`@${role}\``;
    case "gemini":
      // 파일 참조: skills/spec.md
      return (role) => `**${role}** (프롬프트 파일: \`skills/${role}.md\`)`;
    case "copilot":
      // 자동 주입 — 볼드 참조 유지
      return (role) => `**${role}**`;
    case "antigravity":
      // 시맨틱 매칭 — 볼드 참조 + 스킬 디렉토리 안내
      return (role) => `**${role}** (스킬: \`.agent/skills/${role}/\`)`;
    case "kiro":
      // # 참조: #spec, #ui
      return (role) => `\`#${role}\``;
  }
}

/** 스킬별 설명 (Codex frontmatter용) */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  spec: "프로젝트 명세(PRD) 작성",
  ui: "화면 설계 및 디자인 시스템",
  build: "코드 구현",
  qa: "테스트 및 품질 검증",
  ship: "커밋, 배포, 릴리스",
  ops: "인프라 및 운영",
  docs: "문서화 및 기록",
};

/**
 * 에이전트별 헤더 코멘트
 */
function getHeader(target: AgentTarget, skillName: string): string {
  const timestamp = new Date().toISOString().split("T")[0];

  // Codex는 YAML frontmatter 필수
  if (target === "codex") {
    const desc = SKILL_DESCRIPTIONS[skillName] ?? skillName;
    return [
      "---",
      `name: ${skillName}`,
      `description: ${desc}`,
      `generated: ${timestamp}`,
      `generator: miluju-studio`,
      "---",
      "",
    ].join("\n");
  }

  return [
    `<!-- 이 파일은 miluju-studio의 gen-skill-docs에 의해 자동 생성되었습니다. -->`,
    `<!-- 대상 에이전트: ${AGENT_LABELS[target]} | 생성일: ${timestamp} -->`,
    `<!-- 원본을 수정하려면 skills/${skillName}.md 또는 skills/_base.md를 편집하세요. -->`,
    "",
  ].join("\n");
}

/** 역할 목록을 에이전트별 호출 구문으로 변환 */
function formatPipeline(target: AgentTarget): string {
  const replacer = getRoleReplacer(target);
  return ROLES.map((r) => replacer(r)).join(" → ");
}

/** 에이전트별 호출 안내 */
function getInvocationGuide(target: AgentTarget): string {
  const guides: Record<AgentTarget, string> = {
    "claude-code": "슬래시 명령어를 사용하세요.",
    cursor: "@ 멘션을 사용하세요.",
    gemini: "프롬프트 파일을 참조하세요.",
    codex: "$ 접두사로 스킬을 호출하세요.",
    copilot: "자동으로 주입됩니다. 스킬 이름으로 참조하세요.",
    antigravity: "자동으로 매칭됩니다. 의도를 설명하면 스킬이 활성화됩니다.",
    kiro: "# 참조를 사용하세요.",
    windsurf: "@ 멘션을 사용하세요.",
  };

  return [
    `> **스킬 호출:** ${guides[target]}`,
    `> ${formatPipeline(target)}`,
    "",
  ].join("\n");
}

/**
 * 마크다운 본문에서 볼드 역할 참조(**spec** 등)를 에이전트별 구문으로 변환합니다.
 */
function transformRoleReferences(
  content: string,
  target: AgentTarget
): string {
  const replacer = getRoleReplacer(target);
  let result = content;

  for (const role of ROLES) {
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
  const tablePattern =
    /각 역할은 에이전트의 호출 방식에 따라 참조합니다:[\s\S]*?문서 내에서 역할을 참조할 때는.*볼드체 역할명.*을 사용합니다\./;

  let result = baseContent.replace(tablePattern, getInvocationGuide(target));
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
