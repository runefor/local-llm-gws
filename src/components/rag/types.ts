import type { ArtifactLintResult, ArtifactStatus } from "./ArtifactStatusPanel";

export interface CitationMapEntry {
  evidence_id: string;
  marker?: string;
  title?: string;
  source?: string;
  location_label?: string;
  url?: string;
}

export interface SourceLocation {
  original_url?: string;
  location_label?: string;
  provider_item_id?: string;
  chunk_index?: number;
  message_id?: string;
  thread_id?: string;
  rfc822msgid?: string;
  file_id?: string;
  resource_key?: string;
}

export interface EvidenceRecord {
  id: string;
  evidence_id: string;
  chunk_id: string;
  doc_id?: string;
  title: string;
  source: string;
  snippet: string;
  content_snapshot: string;
  location_label?: string;
  original_url?: string;
  open_url?: string;
  url?: string;
  date?: string;
  score?: number;
  scores?: EvidenceScores;
  source_location?: SourceLocation;
  citation_map?: CitationMapEntry[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EvidenceScores {
  vector_distance?: number;
  rrf_score?: number;
  rank?: number;
}

export interface EvidenceSet {
  id: string;
  title: string;
  original_query: string;
  evidence_items: EvidenceRecord[];
  notes?: string;
  tags: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Artifact {
  id: string;
  evidence_set_id?: string;
  artifact_type: string;
  title?: string;
  content: string;
  instruction?: string;
  status?: ArtifactStatus;
  frontmatter?: Record<string, string | number | boolean | string[] | null>;
  lint?: ArtifactLintResult;
  citation_map?: CitationMapEntry[];
  created_at?: string;
  updated_at?: string;
  approved_at?: string | null;
}

export interface IndexStatus {
  gmail_chunks: number;
  drive_chunks: number;
  total_chunks: number;
}

export type NotificationType = "success" | "error" | "info" | "warning";
export type RagSource = "gmail" | "drive";
export type DateFilterMode = "all" | "known" | "unknown";
export type RelevanceFeedbackValue = "relevant" | "irrelevant" | "important" | "excluded";
