/**
 * miluju update-check — 버전 검사 명령어
 *
 * 현재 설치된 miluju-studio 및 주요 의존성의 최신 버전을 확인합니다.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

/** 시맨틱 버전 비교 (a > b → 양수) */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
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
        compareVersions(latest, current) > 0;

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
}
