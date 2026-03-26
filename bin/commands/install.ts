/**
 * miluju install — 현재 프로젝트에 스킬 설치
 *
 * 에이전트별 올바른 경로에 스킬 파일을 설치합니다.
 * 사용자의 프로젝트 디렉토리에서 실행됩니다.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentTarget } from "../../src/lib/transformer.js";

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
    dir: ".codex/skills",
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
    command: "bun",
    args: ["run", serverScript],
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
  serverScript: string
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
    `command = "bun"`,
    `args = ["run", "${serverScript}"]`,
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
  const serverScript = join(getMiluRoot(), "browse", "server.ts");

  switch (mcpInfo.format) {
    case "json-mcpServers":
      await installMcpJson(fullPath, serverScript, "mcpServers", false);
      break;
    case "json-servers":
      await installMcpJson(fullPath, serverScript, "servers", true);
      break;
    case "toml":
      await installMcpToml(fullPath, serverScript);
      break;
  }

  return true;
}

/**
 * miluju-studio의 dist/skills/{agent}/ 경로를 찾습니다.
 * npx로 실행될 때와 로컬 실행될 때 모두 대응합니다.
 */
function findDistDir(agent: AgentTarget): string {
  // bin/commands/install.ts → 프로젝트 루트는 ../../
  const miluRoot = resolve(import.meta.dirname, "..", "..");
  const distDir = join(miluRoot, "dist", "skills", agent);

  if (!existsSync(distDir)) {
    throw new Error(
      `dist/skills/${agent}/ 가 없습니다. 먼저 'bun run gen'을 실행하세요.`
    );
  }

  return distDir;
}

/**
 * flat 형식: 파일을 직접 복사
 * dist/skills/claude-code/spec.md → .claude/commands/spec.md
 */
async function installFlat(
  distDir: string,
  targetDir: string,
  extension?: string
): Promise<number> {
  await mkdir(targetDir, { recursive: true });
  let count = 0;

  for (const skill of SKILL_NAMES) {
    const src = join(distDir, `${skill}.md`);
    if (!existsSync(src)) continue;

    const content = await readFile(src, "utf-8");
    const filename = extension ? `${skill}${extension}` : `${skill}.md`;
    const dest = join(targetDir, filename);

    await writeFile(dest, content, "utf-8");
    count++;
  }

  return count;
}

/**
 * directory 형식: 각 스킬을 디렉토리로 설치
 * dist/skills/codex/spec.md → .codex/skills/spec/SKILL.md
 * dist/skills/antigravity/spec.md → .agent/skills/spec/SKILL.md
 */
async function installDirectory(
  distDir: string,
  targetDir: string
): Promise<number> {
  let count = 0;

  for (const skill of SKILL_NAMES) {
    const src = join(distDir, `${skill}.md`);
    if (!existsSync(src)) continue;

    const skillDir = join(targetDir, skill);
    await mkdir(skillDir, { recursive: true });

    const content = await readFile(src, "utf-8");
    const dest = join(skillDir, "SKILL.md");

    await writeFile(dest, content, "utf-8");
    count++;
  }

  return count;
}

export interface InstallOptions {
  targetDir: string;
  agents: AgentTarget[];
}

export async function runInstall(options: InstallOptions): Promise<void> {
  const { targetDir, agents } = options;

  console.log("📦 miluju-studio 스킬 설치를 시작합니다.");
  console.log(`   대상 프로젝트: ${targetDir}`);
  console.log(`   에이전트: ${agents.join(", ")}`);
  console.log("");

  for (const agent of agents) {
    const config = AGENT_INSTALL_MAP[agent];
    const distDir = findDistDir(agent);
    const installDir = join(targetDir, config.dir);

    let count: number;

    switch (config.format) {
      case "flat":
      case "instructions":
        count = await installFlat(distDir, installDir, config.extension);
        break;
      case "directory":
        count = await installDirectory(distDir, installDir);
        break;
    }

    const mcpInstalled = await installMcpConfig(agent, targetDir);

    console.log(`  ✅ ${agent}: ${count}개 스킬 → ${config.dir}/`);
    if (mcpInstalled) {
      console.log(`     🔌 MCP 브라우저 검수 서버 설정 추가 → ${MCP_CONFIG_MAP[agent].path}`);
    }
    console.log(`     ${config.guide}`);
    console.log("");
  }

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
