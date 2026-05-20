export function serializeDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toJSON() : null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    return Number.isNaN(Date.parse(trimmedValue)) ? null : trimmedValue;
  }

  if (typeof value === "number") {
    const date = new Date(value);

    return Number.isFinite(date.getTime()) ? date.toJSON() : null;
  }

  return null;
}

export function serializeWorkspace(workspace: {
  createdAt?: unknown;
  id: string;
  name: string;
  slug?: string;
  updatedAt?: unknown;
}) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug
  };
}

export function serializeProject(project: {
  createdAt?: unknown;
  description?: string | null;
  id: string;
  name: string;
  updatedAt?: unknown;
  workspaceId?: string;
}) {
  return {
    description: project.description ?? null,
    id: project.id,
    name: project.name,
    workspaceId: project.workspaceId
  };
}

export function serializeFile(file: {
  content: string;
  createdAt?: unknown;
  id: string;
  name?: string;
  path: string;
  updatedAt?: unknown;
}) {
  return {
    content: file.content,
    id: file.id,
    name: file.name,
    path: file.path
  };
}

export function serializeChatMessage(message: {
  content: string;
  createdAt?: unknown;
  id: string;
  mode: "ASK" | "SUGGEST" | "EXECUTE";
  role: "user" | "assistant";
}) {
  return {
    content: message.content,
    id: message.id,
    mode: message.mode,
    role: message.role
  };
}
