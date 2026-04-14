import { kv } from "@vercel/kv";

import {
  ProjectCreateResponse,
  ProjectRecord,
  ProjectSourceMetadata,
} from "@/lib/project-types";
import { assertKvEnv } from "@/lib/server-env";

function projectKey(id: string) {
  return `project:${id}`;
}

function hydrateProject(value: unknown): ProjectRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<ProjectRecord>;

  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    typeof record.proseNamespaceId !== "string" ||
    typeof record.sonicNamespaceId !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    proseNamespaceId: record.proseNamespaceId,
    sonicNamespaceId: record.sonicNamespaceId,
    sourceCount:
      typeof record.sourceCount === "number"
        ? record.sourceCount
        : Array.isArray(record.sources)
          ? record.sources.length
          : 0,
    proseChunkCount:
      typeof record.proseChunkCount === "number" ? record.proseChunkCount : 0,
    sources: Array.isArray(record.sources)
      ? (record.sources as ProjectSourceMetadata[])
      : [],
  };
}

export function buildProjectRecord(name: string): ProjectRecord {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  return {
    id,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    proseNamespaceId: `proj_${id}_prose`,
    sonicNamespaceId: `proj_${id}_sonic`,
    sourceCount: 0,
    proseChunkCount: 0,
    sources: [],
  };
}

export async function createProject(name: string) {
  assertKvEnv();

  const project = buildProjectRecord(name);
  await kv.set(projectKey(project.id), project);

  return project;
}

export async function getProject(projectId: string) {
  assertKvEnv();

  const value = await kv.get(projectKey(projectId));
  return hydrateProject(value);
}

export async function saveProject(project: ProjectRecord) {
  assertKvEnv();
  await kv.set(projectKey(project.id), project);
}

export function toProjectCreateResponse(
  project: ProjectRecord
): ProjectCreateResponse {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    proseNamespaceId: project.proseNamespaceId,
    sonicNamespaceId: project.sonicNamespaceId,
  };
}
