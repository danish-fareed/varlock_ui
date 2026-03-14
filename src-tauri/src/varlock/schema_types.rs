use serde::{Deserialize, Serialize};

/// A single decorator parsed from a .env.schema comment block.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDecorator {
    pub name: String,
    pub value: Option<String>,
}

/// Parsed entry from a .env.schema file.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSchemaEntry {
    pub key: String,
    /// The base/default value from the schema line (right side of `=`).
    pub base_value: String,
    /// Resolved type from decorators or inference.
    #[serde(rename = "type")]
    pub var_type: String,
    pub required: bool,
    pub sensitive: bool,
    pub description: String,
    /// Allowed values if type is enum.
    pub enum_values: Vec<String>,
    /// All raw decorators from the comment block.
    pub decorators: Vec<SchemaDecorator>,
    /// 1-indexed line start (includes leading comment block).
    pub line_start: u32,
    /// 1-indexed line end (the KEY=VALUE line).
    pub line_end: u32,
}

/// Result from parsing a .env.schema file.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SchemaParseResult {
    /// Successfully parsed entries.
    pub entries: Vec<ParsedSchemaEntry>,
    /// Non-fatal warnings encountered during parsing.
    pub warnings: Vec<String>,
}

/// A variable with merged metadata from both CLI output and schema parsing.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergedVariable {
    pub key: String,
    /// Resolved runtime value from varlock load (None if missing).
    pub value: Option<String>,
    /// Source file that provided the resolved value.
    pub source: Option<String>,
    /// Variable type (from schema if available, otherwise inferred).
    #[serde(rename = "type")]
    pub var_type: String,
    /// Where the type came from.
    pub type_source: String,
    pub required: bool,
    pub required_source: String,
    pub sensitive: bool,
    pub sensitive_source: String,
    pub description: String,
    /// Enum values if type is enum.
    pub enum_values: Vec<String>,
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    /// Whether a schema entry exists for this variable.
    pub has_schema: bool,
    /// The base value from the schema (if present).
    pub schema_base_value: Option<String>,
    /// Line range in schema file (if present).
    pub schema_line_start: Option<u32>,
    pub schema_line_end: Option<u32>,
}

/// The full merged result returned to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergedLoadResult {
    pub env: String,
    pub valid: bool,
    pub error_count: u32,
    pub warning_count: u32,
    pub variables: Vec<MergedVariable>,
    /// Warnings from schema parsing (if any).
    pub schema_warnings: Vec<String>,
    /// Whether a .env.schema file was found and parsed.
    pub schema_parsed: bool,
}
