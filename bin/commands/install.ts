/**
 * miluju install — 현재 프로젝트에 스킬 설치
 *
 * 에이전트별 올바른 경로에 스킬 파일을 설치합니다.
 * 사용자의 프로젝트 디렉토리에서 실행됩니다.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import type { AgentTarget } from "../../src/lib/transformer.js";
import {
  fetchLatestRelease,
  fetchSkillContent,
  fetchIssueTemplate,
  extractVersionFromContent,
} from "../lib/registry.js";

/** .milurc.json 스킬 설치 레코드 */
interface SkillInstallRecord {
  /** 설치된 스킬 버전 (스킬명 → 버전) */
  skillVersions: Record<string, string>;
  /** 설치된 에이전트 목록 */
  agents: AgentTarget[];
  /** 마지막 설치 시각 (ISO 8601) */
  installedAt: string;
  /** miluju-studio 버전 */
  miluVersion: string;
}

const MILURC_PATH = ".milurc.json";

/** 대상 프로젝트의 .milurc.json을 읽습니다 */
async function loadMilurc(targetDir: string): Promise<Record<string, unknown>> {
  const path = join(targetDir, MILURC_PATH);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return {};
  }
}

/** 설치 레코드를 .milurc.json에 저장합니다 */
async function saveInstallRecord(
  targetDir: string,
  agents: AgentTarget[],
  skillVersions: Record<string, string>
): Promise<void> {
  const miluRoot = resolve(import.meta.dirname, "..", "..");
  let miluVersion = "unknown";
  try {
    const pkg = JSON.parse(
      await readFile(join(miluRoot, "package.json"), "utf-8")
    );
    miluVersion = pkg.version;
  } catch { /* ignore */ }

  const milurc = await loadMilurc(targetDir);
  const record: SkillInstallRecord = {
    skillVersions,
    agents,
    installedAt: new Date().toISOString(),
    miluVersion,
  };
  milurc.skills = record;

  const path = join(targetDir, MILURC_PATH);
  await writeFile(path, JSON.stringify(milurc, null, 2) + "\n", "utf-8");
}

/** 에이전트별 설치 설정 */
interface AgentInstallConfig {
  /** 프로젝트 내 설치 디렉토리 */
  dir: string;
  /** 파일 저장 방식 */
  format: "flat" | "directory" | "instructions";
  /** 파일 확장자 (기본 .md) */
  extension?: string;
  /** 설치 후 안내 메시지 */
  guide: string;
}

const AGENT_INSTALL_MAP: Record<AgentTarget, AgentInstallConfig> = {
  "claude-code": {
    dir: ".claude/commands",
    format: "flat",
    guide: "Claude Code에서 /spec, /ui, /build 등으로 호출하세요.",
  },
  cursor: {
    dir: ".cursor/rules",
    format: "flat",
    guide: "Cursor에서 @spec, @ui, @build 등으로 멘션하세요.",
  },
  gemini: {
    dir: "skills",
    format: "flat",
    guide: "Gemini CLI에서 skills/spec.md 등으로 참조하세요.",
  },
  codex: {
    dir: ".agents/skills",
    format: "directory",
    guide: "Codex에서 $spec, $ui, $build 등으로 호출하세요.",
  },
  copilot: {
    dir: ".github/instructions",
    format: "instructions",
    extension: ".instructions.md",
    guide: "Copilot이 자동으로 스킬을 주입합니다.",
  },
  antigravity: {
    dir: ".agent/skills",
    format: "directory",
    guide: "Antigravity가 의도에 맞는 스킬을 자동 매칭합니다.",
  },
  kiro: {
    dir: ".kiro/steering",
    format: "flat",
    guide: "Kiro에서 #spec, #ui, #build 등으로 참조하세요.",
  },
  windsurf: {
    dir: ".windsurf/rules",
    format: "flat",
    guide: "Windsurf에서 @spec, @ui, @build 등으로 멘션하세요.",
  },
};

const SKILL_NAMES = ["spec", "ui", "build", "qa", "ship", "ops", "docs"];

/** miluju-studio 루트 경로 (install.ts 기준 ../../) */
function getMiluRoot(): string {
  return resolve(import.meta.dirname, "..", "..");
}

/** bun 절대경로를 찾습니다 (에이전트 PATH에 없을 수 있으므로) */
function findBunPath(): string {
  try {
    return execSync("which bun", { encoding: "utf-8" }).trim();
  } catch {
    return "bun"; // fallback
  }
}

function findNodePath(): string {
  try {
    return execSync("which node", { encoding: "utf-8" }).trim();
  } catch {
    return "node";
  }
}

function ensureBrowseNodeBundle(miluRoot: string, bunPath: string): string {
  execSync(`${bunPath} run build:browse-node`, {
    cwd: miluRoot,
    stdio: "ignore",
  });
  return join(miluRoot, "dist", "browse", "server.js");
}

/** MCP 설정 정보 */
interface McpConfigInfo {
  /** 프로젝트 내 설정 파일 경로 */
  path: string;
  /** 설정 포맷 */
  format: "json-mcpServers" | "json-servers" | "toml";
}

/** 에이전트별 MCP 설정 파일 경로 및 형식 */
const MCP_CONFIG_MAP: Record<AgentTarget, McpConfigInfo> = {
  "claude-code": { path: ".claude/mcp.json", format: "json-mcpServers" },
  cursor: { path: ".cursor/mcp.json", format: "json-mcpServers" },
  windsurf: { path: ".windsurf/mcp.json", format: "json-mcpServers" },
  gemini: { path: ".gemini/settings.json", format: "json-mcpServers" },
  kiro: { path: ".kiro/settings/mcp.json", format: "json-mcpServers" },
  copilot: { path: ".vscode/mcp.json", format: "json-servers" },
  codex: { path: ".codex/config.toml", format: "toml" },
  antigravity: { path: ".agent/mcp.json", format: "json-mcpServers" },
};

/**
 * JSON 형식 MCP 설정 설치 (mcpServers 또는 servers 키)
 */
async function installMcpJson(
  fullPath: string,
  serverScript: string,
  serverCwd: string,
  bunPath: string,
  serversKey: "mcpServers" | "servers",
  useType: boolean
): Promise<void> {
  let config: Record<string, unknown> = {};
  if (existsSync(fullPath)) {
    const raw = await readFile(fullPath, "utf-8");
    config = JSON.parse(raw);
  }

  const servers = (config[serversKey] ?? {}) as Record<string, unknown>;
  const entry: Record<string, unknown> = {
    command: bunPath,
    args: [serverScript],
    cwd: serverCwd,
  };
  if (useType) entry.type = "stdio";
  servers["miluju-browse"] = entry;
  config[serversKey] = servers;

  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * TOML 형식 MCP 설정 설치 (Codex)
 */
async function installMcpToml(
  fullPath: string,
  serverScript: string,
  serverCwd: string,
  bunPath: string
): Promise<void> {
  let content = "";
  if (existsSync(fullPath)) {
    content = await readFile(fullPath, "utf-8");
  }

  // 이미 miluju-browse 설정이 있으면 스킵
  if (content.includes("[mcp_servers.miluju-browse]")) return;

  const tomlBlock = [
    "",
    "[mcp_servers.miluju-browse]",
    `command = "${bunPath}"`,
    `args = ["${serverScript}"]`,
    `cwd = "${serverCwd}"`,
    `startup_timeout_sec = 60`,
    "",
  ].join("\n");

  content += tomlBlock;

  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

/**
 * MCP 설정 파일을 대상 프로젝트에 설치합니다.
 * 기존 설정이 있으면 miluju-browse 서버만 추가합니다.
 */
async function installMcpConfig(
  agent: AgentTarget,
  targetDir: string
): Promise<boolean> {
  const mcpInfo = MCP_CONFIG_MAP[agent];
  const fullPath = join(targetDir, mcpInfo.path);
  const miluRoot = getMiluRoot();
  const bunPath = findBunPath();
  const nodePath = findNodePath();
  const serverScript = ensureBrowseNodeBundle(miluRoot, bunPath);
  const serverCwd = miluRoot;

  switch (mcpInfo.format) {
    case "json-mcpServers":
      await installMcpJson(fullPath, serverScript, serverCwd, nodePath, "mcpServers", false);
      break;
    case "json-servers":
      await installMcpJson(fullPath, serverScript, serverCwd, nodePath, "servers", true);
      break;
    case "toml":
      await installMcpToml(fullPath, serverScript, serverCwd, nodePath);
      break;
  }

  return true;
}

/**
 * 로컬 dist 디렉토리가 있으면 경로를 반환하고, 없으면 null을 반환합니다.
 * (npx 실행 환경에서는 dist가 없음)
 */
function findLocalDistDir(agent: AgentTarget): string | null {
  const miluRoot = resolve(import.meta.dirname, "..", "..");
  const distDir = join(miluRoot, "dist", "skills", agent);
  return existsSync(distDir) ? distDir : null;
}

/**
 * 스킬 콘텐츠를 가져옵니다.
 * 로컬 dist 우선, 없으면 GitHub Raw에서 fetch합니다.
 */
async function resolveSkillContent(
  agent: AgentTarget,
  skill: string,
  tag: string
): Promise<string | null> {
  const localDistDir = findLocalDistDir(agent);
  if (localDistDir) {
    const src = join(localDistDir, `${skill}.md`);
    if (existsSync(src)) return await readFile(src, "utf-8");
  }
  return await fetchSkillContent(tag, agent, skill);
}

/**
 * flat 형식으로 스킬을 설치합니다.
 */
async function installFlat(
  agent: AgentTarget,
  tag: string,
  targetDir: string,
  extension?: string
): Promise<{ count: number; versions: Record<string, string> }> {
  await mkdir(targetDir, { recursive: true });
  let count = 0;
  const versions: Record<string, string> = {};

  for (const skill of SKILL_NAMES) {
    const content = await resolveSkillContent(agent, skill, tag);
    if (!content) continue;

    const filename = extension ? `${skill}${extension}` : `${skill}.md`;
    await writeFile(join(targetDir, filename), content, "utf-8");
    versions[skill] = extractVersionFromContent(content);
    count++;
  }

  return { count, versions };
}

/**
 * directory 형식으로 스킬을 설치합니다.
 */
async function installDirectory(
  agent: AgentTarget,
  tag: string,
  targetDir: string
): Promise<{ count: number; versions: Record<string, string> }> {
  let count = 0;
  const versions: Record<string, string> = {};

  for (const skill of SKILL_NAMES) {
    const content = await resolveSkillContent(agent, skill, tag);
    if (!content) continue;

    const skillDir = join(targetDir, skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
    versions[skill] = extractVersionFromContent(content);
    count++;
  }

  return { count, versions };
}

/** Issue 템플릿 파일 목록 */
const ISSUE_TEMPLATES = [
  "bug_report.md",
  "feature_request.md",
  "task.md",
  "question.md",
  "config.yml",
] as const;

/**
 * Issue/PR 템플릿 콘텐츠를 가져옵니다.
 * 로컬 소스 우선, 없으면 GitHub Raw에서 fetch합니다.
 */
async function resolveTemplateContent(
  filename: string,
  tag: string
): Promise<string | null> {
  const localSrcDir = resolve(import.meta.dirname, "..", "..", "src", "issue-templates");
  if (existsSync(localSrcDir)) {
    const src = join(localSrcDir, filename);
    if (existsSync(src)) return await readFile(src, "utf-8");
  }
  return await fetchIssueTemplate(tag, filename);
}

/**
 * GitHub Issue/PR 템플릿을 대상 프로젝트에 설치합니다.
 * 이미 존재하는 파일은 건너뜁니다.
 */
async function installIssueTemplates(targetDir: string, tag: string): Promise<number> {
  const issueTemplateDir = join(targetDir, ".github", "ISSUE_TEMPLATE");
  await mkdir(issueTemplateDir, { recursive: true });

  let count = 0;

  for (const name of ISSUE_TEMPLATES) {
    const dest = join(issueTemplateDir, name);
    if (existsSync(dest)) continue;
    const content = await resolveTemplateContent(name, tag);
    if (!content) continue;
    await writeFile(dest, content, "utf-8");
    count++;
  }

  const prDest = join(targetDir, ".github", "pull_request_template.md");
  if (!existsSync(prDest)) {
    const content = await resolveTemplateContent("pull_request_template.md", tag);
    if (content) {
      await writeFile(prDest, content, "utf-8");
      count++;
    }
  }

  return count;
}

export interface InstallOptions {
  targetDir: string;
  agents: AgentTarget[];
  /** Issue 템플릿 설치 여부 (기본: true) */
  issueTemplates?: boolean;
}

export async function runInstall(options: InstallOptions): Promise<void> {
  const { targetDir, agents, issueTemplates = true } = options;

  console.log("📦 miluju-studio 스킬 설치를 시작합니다.");
  console.log(`   대상 프로젝트: ${targetDir}`);
  console.log(`   에이전트: ${agents.join(", ")}`);

  // 릴리즈 태그 결정: 로컬 dist가 있으면 로컬 우선, 없으면 GitHub 최신 릴리즈
  const hasLocalDist = !!findLocalDistDir(agents[0]);
  let tag = "main";
  let releaseVersion = "local";

  if (!hasLocalDist) {
    process.stdout.write("   버전 확인 중...");
    const release = await fetchLatestRelease();
    if (!release) {
      console.error("\n❌ GitHub에서 최신 릴리즈를 가져올 수 없습니다.");
      console.error("   네트워크를 확인하거나, miluju-studio를 직접 clone해서 실행해주세요.");
      process.exit(1);
    }
    tag = release.tag;
    releaseVersion = release.version;
    console.log(` v${releaseVersion}`);
  } else {
    console.log("   (로컬 빌드 사용)");
  }
  console.log("");

  const allSkillVersions: Record<string, string> = {};

  for (const agent of agents) {
    const config = AGENT_INSTALL_MAP[agent];
    const installDir = join(targetDir, config.dir);

    let count: number;
    let versions: Record<string, string>;

    switch (config.format) {
      case "flat":
      case "instructions": {
        const result = await installFlat(agent, tag, installDir, config.extension);
        count = result.count;
        versions = result.versions;
        break;
      }
      case "directory": {
        const result = await installDirectory(agent, tag, installDir);
        count = result.count;
        versions = result.versions;
        break;
      }
    }

    // 첫 에이전트 버전을 기준으로 레코드 저장 (에이전트별 버전은 동일)
    if (Object.keys(allSkillVersions).length === 0) {
      Object.assign(allSkillVersions, versions!);
    }

    const mcpInstalled = await installMcpConfig(agent, targetDir);

    console.log(`  ✅ ${agent}: ${count!}개 스킬 → ${config.dir}/`);
    if (mcpInstalled) {
      console.log(`     🔌 MCP 브라우저 검수 서버 설정 추가 → ${MCP_CONFIG_MAP[agent].path}`);
    }
    console.log(`     ${config.guide}`);
    console.log("");
  }

  // Issue / PR 템플릿 설치
  if (issueTemplates) {
    const templateCount = await installIssueTemplates(targetDir, tag);
    if (templateCount > 0) {
      console.log(`  📋 GitHub Issue / PR 템플릿 ${templateCount}개`);
      console.log(`     Issue → .github/ISSUE_TEMPLATE/`);
      console.log(`     PR   → .github/pull_request_template.md  (Closes # 이슈 자동 닫기 포함)`);
      console.log("");
    }
  }

  // 설치 레코드 저장
  await saveInstallRecord(targetDir, agents, allSkillVersions);
  console.log(`  💾 설치 레코드 저장 → .milurc.json`);
  console.log("");

  console.log("📦 설치 완료!");
  console.log("");
  console.log("다음 단계:");
  console.log("  1. AI 에이전트를 열고 스킬을 호출해보세요.");
  console.log("  2. /spec (또는 해당 에이전트의 호출 방식)으로 시작합니다.");
}

/** 지원하는 에이전트 이름 목록 (CLI 도움말용) */
export function getSupportedAgents(): string {
  return Object.keys(AGENT_INSTALL_MAP).join(", ");
}
