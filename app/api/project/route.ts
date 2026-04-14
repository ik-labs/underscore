import { NextResponse } from "next/server";

import { createProject, toProjectCreateResponse } from "@/lib/projects";
import { MissingServerEnvError } from "@/lib/server-env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const name =
    typeof (body as { name?: unknown })?.name === "string"
      ? (body as { name: string }).name.trim()
      : "";

  if (name.length === 0) {
    return NextResponse.json(
      { error: "invalid_name", message: "Project name is required." },
      { status: 400 }
    );
  }

  try {
    const project = await createProject(name);
    return NextResponse.json(toProjectCreateResponse(project), { status: 201 });
  } catch (error) {
    if (error instanceof MissingServerEnvError) {
      return NextResponse.json(
        { error: "missing_server_env", missing: error.missing },
        { status: 500 }
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: "project_create_failed", message: "Failed to create project." },
      { status: 500 }
    );
  }
}
