/** Vault record shape + how papers are filed into folders. Types and pure helpers only. */
import type { DocId } from './documents';
import type { DocCheck } from './cases';
import type { VaultStatus } from './analysis';

export interface VaultDoc {
  id: string;
  name: string;
  ext: string;
  size: number;
  addedAt: number;
  docType: DocId | null;
  status: VaultStatus;
  checks: DocCheck[];
  /** Masked values worth showing (never a full Aadhaar number). */
  fields: Record<string, string>;
  /** How the words were read: local OCR, the PDF's text layer, or not at all. */
  read: 'ocr' | 'pdf-text' | 'none';
}

export const VAULT_FOLDERS = ['identity', 'income', 'land', 'bank', 'education', 'work', 'other'] as const;
export type VaultFolder = (typeof VAULT_FOLDERS)[number];

const FOLDER_OF: Partial<Record<DocId, VaultFolder>> = {
  aadhaar: 'identity', pan: 'identity', photo: 'identity', age_proof: 'identity', residence: 'identity',
  income_cert: 'income', caste_cert: 'income', bpl_card: 'income', ration_card: 'income',
  land_record: 'land', electricity_bill: 'land',
  bank_passbook: 'bank',
  student_proof: 'education',
  job_card: 'work', business_proof: 'work', mcp_card: 'work',
};

export const folderOf = (docType: DocId | null): VaultFolder => (docType ? FOLDER_OF[docType] ?? 'other' : 'other');
