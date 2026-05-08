import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export type FileMap = Record<string, string>;

export interface SessionProjectState {
  files: FileMap;
  entryFile: string;
  title: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

const PROJECT_STORAGE_DIR = path.join(
  process.cwd(),
  ".video-projects"
);

if (!fs.existsSync(PROJECT_STORAGE_DIR)) {
  fs.mkdirSync(PROJECT_STORAGE_DIR, {
    recursive: true,
  });
}

function cloneFileMap(files: FileMap): FileMap {
  return Object.fromEntries(
    Object.entries(files).map(([key, value]) => [
      key,
      value,
    ])
  );
}

function getProjectPath(projectId: string): string {
  return path.join(
    PROJECT_STORAGE_DIR,
    `${projectId}.json`
  );
}

export function createProjectId(): string {
  return crypto.randomUUID();
}

export function saveProject(
  projectId: string,
  project: SessionProjectState
): void {
  fs.writeFileSync(
    getProjectPath(projectId),
    JSON.stringify(project, null, 2),
    "utf8"
  );
}

export function loadProject(
  projectId: string
): SessionProjectState | null {
  const filePath = getProjectPath(projectId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as SessionProjectState;
}

export function deleteProject(
  projectId: string
): void {
  const filePath = getProjectPath(projectId);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function listProjects(): string[] {
  return fs
    .readdirSync(PROJECT_STORAGE_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(".json", ""));
}

export function cleanupOldProjects(
  maxAgeHours = 24
): void {
  const now = Date.now();

  for (const file of fs.readdirSync(
    PROJECT_STORAGE_DIR
  )) {
    const fullPath = path.join(
      PROJECT_STORAGE_DIR,
      file
    );

    const stat = fs.statSync(fullPath);

    const ageHours =
      (now - stat.mtimeMs) / (1000 * 60 * 60);

    if (ageHours > maxAgeHours) {
      fs.unlinkSync(fullPath);
    }
  }
}

export function buildProjectState(params: {
  previous?: SessionProjectState | null;
  files?: FileMap;
  entryFile?: string;
  title?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}): SessionProjectState {
  const previous = params.previous;

  return {
    files: cloneFileMap({
      ...(previous?.files ?? {}),
      ...(params.files ?? {}),
    }),

    entryFile:
      params.entryFile ??
      previous?.entryFile ??
      "/src/Video.tsx",

    title:
      params.title ??
      previous?.title ??
      "Remotion Video",

    durationInFrames:
      params.durationInFrames ??
      previous?.durationInFrames ??
      150,

    fps:
      params.fps ??
      previous?.fps ??
      30,

    width:
      params.width ??
      previous?.width ??
      1920,

    height:
      params.height ??
      previous?.height ??
      1080,
  };
}

export function createStoredProject(params: {
  previous?: SessionProjectState | null;
  files?: FileMap;
  entryFile?: string;
  title?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
}) {
  const state = buildProjectState(params);

  const projectId = createProjectId();

  saveProject(projectId, state);

  return {
    projectId,
    state,
  };
}

export function updateStoredProject(
  projectId: string,
  params: {
    files?: FileMap;
    entryFile?: string;
    title?: string;
    durationInFrames?: number;
    fps?: number;
    width?: number;
    height?: number;
  }
) {
  const previous = loadProject(projectId);

  if (!previous) {
    throw new Error(
      `Project not found: ${projectId}`
    );
  }

  const updated = buildProjectState({
    previous,
    ...params,
  });

  saveProject(projectId, updated);

  return updated;
}
