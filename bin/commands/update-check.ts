/**
 * miluju update-check — 버전 검사 명령어
 *
 * 현재 설치된 miluju-studio, 주요 의존성, 그리고 스킬 파일의 버전을 확인합니다.
 * 스킬 버전은 대상 프로젝트의 .milurc.json에 기록된 버전과
 * miluju-studio 소스의 최신 버전을 비교합니다.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  fetchLatestRelease,
  fetchSkillContent,
  extractVersionFromContent,
  compareVersions as registryCompareVersions,
  GITHUB_REPO,
} from "../lib/registry.js";

interface VersionInfo {
  name: string;
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

/**
 * npm registry에서 패키지의 최신 버전을 조회합니다.
 */
async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { version: string };
    return data.version;
  } catch {
    return null;
  }
}

/**
 * 설치된 패키지 버전을 node_modules에서 읽습니다.
 */
async function getInstalledVersion(
  targetDir: string,
  packageName: string
): Promise<string | null> {
  try {
    const pkgPath = join(
      targetDir,
      "node_modules",
      ...packageName.split("/"),
      "package.json"
    );
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    return null;
  }
}


const SKILL_NAMES = ["spec", "ui", "build", "qa", "ship", "ops", "docs"];

/**
 * 최신 스킬 버전 맵과 참조 태그를 반환합니다.
 * 로컬 dist가 있으면 로컬 우선, 없으면 GitHub Releases 최신 태그 기준으로 fetch합니다.
 */
async function getLatestSkillVersions(): Promise<{
  versions: Record<string, string>;
  tag: string;
  isRemote: boolean;
  releaseVersion: string;
} | null> {
  const miluRoot = resolve(import.meta.dirname, "..", "..");
  const localDistDir = join(miluRoot, "dist", "skills", "claude-code");
  const versions: Record<string, string> = {};

  if (existsSync(localDistDir)) {
    for (const name of SKILL_NAMES) {
      const path = join(localDistDir, `${name}.md`);
      if (!existsSync(path)) continue;
      const content = await readFile(path, "utf-8");
      versions[name] = extractVersionFromContent(content);
    }
    return { versions, tag: "local", isRemote: false, releaseVersion: "local" };
  }

  // 로컬 없으면 GitHub Releases에서 최신 버전 태그 조회
  const release = await fetchLatestRelease();
  if (!release) return null;

  // claude-code 기준으로 버전 조회 (에이전트별 버전 동일)
  await Promise.all(
    SKILL_NAMES.map(async (name) => {
      const content = await fetchSkillContent(release.tag, "claude-code", name);
      if (content) versions[name] = extractVersionFromContent(content);
    })
  );

  return { versions, tag: release.tag, isRemote: true, releaseVersion: release.version };
}

/** 대상 프로젝트의 .milurc.json에서 설치 레코드를 읽습니다 */
async function getInstalledSkillVersions(
  targetDir: string
): Promise<{ versions: Record<string, string>; agents: string[]; installedAt: string } | null> {
  const path = join(targetDir, ".milurc.json");
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(await readFile(path, "utf-8"));
    const skills = data.skills;
    if (!skills?.skillVersions) return null;
    return {
      versions: skills.skillVersions,
      agents: skills.agents ?? [],
      installedAt: skills.installedAt ?? "",
    };
  } catch {
    return null;
  }
}

export interface SkillUpdateInfo {
  skill: string;
  installed: string;
  latest: string;
  needsUpdate: boolean;
}

export interface SkillInstallRecord {
  versions: Record<string, string>;
  agents: string[];
  installedAt: string;
}

export interface SkillCheckResult {
  installed: SkillInstallRecord;
  updates: SkillUpdateInfo[];
  latestTag: string;
  isRemote: boolean;
  releaseVersion: string;
}

/** 스킬 버전 비교 결과를 반환합니다 (update 명령어에서도 재사용) */
export async function checkSkillVersions(
  targetDir: string
): Promise<SkillCheckResult | null> {
  const [installedRecord, latestResult] = await Promise.all([
    getInstalledSkillVersions(targetDir),
    getLatestSkillVersions(),
  ]);

  if (!installedRecord || !latestResult) return null;

  const { versions: latestVersions, tag, isRemote, releaseVersion } = latestResult;

  const updates: SkillUpdateInfo[] = Object.entries(latestVersions).map(
    ([skill, latest]) => {
      const installed = installedRecord.versions[skill] ?? "0.0.0";
      return {
        skill,
        installed,
        latest,
        needsUpdate: registryCompareVersions(latest, installed) > 0,
      };
    }
  );

  return { installed: installedRecord, updates, latestTag: tag, isRemote, releaseVersion };
}

export async function runUpdateCheck(targetDir: string): Promise<void> {
  console.log("🔍 miluju-studio 업데이트 확인 중...\n");

  // 확인할 패키지 목록
  const packages = [
    "@playwright/mcp",
    "@anthropic-ai/sdk",
    "@modelcontextprotocol/sdk",
    "typescript",
  ];

  // miluju-studio 자체 버전
  let miluVersion = "unknown";
  try {
    const pkg = JSON.parse(
      await readFile(join(targetDir, "package.json"), "utf-8")
    );
    miluVersion = pkg.version;
  } catch {
    // ignore
  }

  console.log(`  📦 miluju-studio: v${miluVersion}\n`);

  // 병렬로 버전 확인
  const results: VersionInfo[] = await Promise.all(
    packages.map(async (name) => {
      const current = await getInstalledVersion(targetDir, name);
      const latest = await fetchLatestVersion(name);

      const updateAvailable =
        current !== null &&
        latest !== null &&
        registryCompareVersions(latest, current) > 0;

      return { name, current: current ?? "미설치", latest, updateAvailable };
    })
  );

  // 결과 출력
  for (const r of results) {
    const icon = r.updateAvailable ? "🔄" : "✅";
    const latestStr = r.latest ?? "확인 불가";
    const suffix = r.updateAvailable ? ` → ${r.latest} 사용 가능` : "";

    console.log(`  ${icon} ${r.name}`);
    console.log(`     현재: ${r.current} | 최신: ${latestStr}${suffix}`);
  }

  const updatable = results.filter((r) => r.updateAvailable);
  console.log("");

  if (updatable.length === 0) {
    console.log("✅ 모든 패키지가 최신 상태입니다.");
  } else {
    console.log(`🔄 ${updatable.length}개 패키지 업데이트 가능:`);
    console.log(`   bun update ${updatable.map((r) => r.name).join(" ")}`);
  }

  // 스킬 버전 확인
  console.log("\n──────────────────────────────────────\n");
  console.log("📋 스킬 버전 확인\n");

  const skillResult = await checkSkillVersions(targetDir);

  if (!skillResult) {
    console.log("  ℹ️  스킬 설치 기록이 없습니다.");
    console.log("     miluju install 로 스킬을 설치하면 버전이 추적됩니다.");
    return;
  }

  const { installed: installedRecord, updates, isRemote, releaseVersion, latestTag } = skillResult;
  const installedDate = installedRecord.installedAt
    ? new Date(installedRecord.installedAt).toLocaleDateString("ko-KR")
    : "알 수 없음";

  const sourceLabel = isRemote
    ? `GitHub Releases (${releaseVersion} / ${latestTag})`
    : "로컬 빌드";

  console.log(`  설치된 에이전트: ${installedRecord.agents.join(", ")}`);
  console.log(`  마지막 설치:     ${installedDate}`);
  console.log(`  비교 기준:       ${sourceLabel}\n`);

  for (const u of updates) {
    const icon = u.needsUpdate ? "🔄" : "✅";
    const suffix = u.needsUpdate ? ` → v${u.latest} 사용 가능` : "";
    console.log(`  ${icon} ${u.skill.padEnd(8)} v${u.installed}${suffix}`);
  }

  const skillUpdatable = updates.filter((u) => u.needsUpdate);
  console.log("");

  if (skillUpdatable.length === 0) {
    console.log("✅ 모든 스킬이 최신 상태입니다.");
  } else {
    console.log(`🔄 ${skillUpdatable.length}개 스킬 업데이트 가능:`);
    console.log(`   miluju update --target ${targetDir}`);
    if (isRemote) {
      console.log(`\n   릴리즈 노트: https://github.com/${GITHUB_REPO}/releases/tag/${latestTag}`);
    }
  }
}
