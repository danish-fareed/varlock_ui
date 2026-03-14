import type {
  EditableVariable,
  FileValue,
  MergedVariable,
  SchemaEntry,
  SchemaVarType,
  EditableProjectFile,
} from "./types";
import { getEnvValue } from "./envFile";

/**
 * Build an EditableVariable from a MergedVariable (backend-merged CLI + schema data)
 * plus per-file values read from disk.
 *
 * The MergedVariable already carries pre-merged metadata (type, required, sensitive)
 * with their sources, so this function mainly adds per-file values and reconstructs
 * the SchemaEntry for the drawer's schema editing tab.
 */
export function buildEditableVariable(
  variable: MergedVariable,
  editableFiles: EditableProjectFile[],
  fileContents: Record<string, string>,
): EditableVariable {
  // Build per-file values
  const envFiles = editableFiles.filter((f) => f.relativePath !== ".env.schema");
  const fileValues: FileValue[] = envFiles.map((file) => {
    const content = fileContents[file.relativePath] ?? "";
    const value = file.exists ? getEnvValue(content, variable.key) : null;
    return {
      relativePath: file.relativePath,
      value,
      exists: file.exists,
    };
  });

  // Reconstruct a SchemaEntry if the backend found one
  const schema: SchemaEntry | null = variable.hasSchema
    ? {
        key: variable.key,
        baseValue: variable.schemaBaseValue ?? "",
        type: variable.type as SchemaVarType,
        required: variable.required,
        sensitive: variable.sensitive,
        description: variable.description,
        enumValues: variable.enumValues,
        decorators: [],
        lineStart: variable.schemaLineStart ?? 0,
        lineEnd: variable.schemaLineEnd ?? 0,
      }
    : null;

  return {
    key: variable.key,
    resolvedValue: variable.value,
    resolvedSource: variable.source,
    schema,
    fileValues,
    type: (variable.type as SchemaVarType) || "string",
    typeSource: variable.typeSource,
    required: variable.required,
    requiredSource: variable.requiredSource,
    sensitive: variable.sensitive,
    sensitiveSource: variable.sensitiveSource,
    description: variable.description,
    valid: variable.valid,
    errors: [...variable.errors],
    warnings: [...variable.warnings],
  };
}
