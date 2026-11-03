import { describe, expect, it } from 'vitest';
import {
  ALL_DOCUMENT_MIME_TYPES,
  EXTENSION_TO_MIME,
  resolveUploadContentType,
  resolveUploadExtension,
  validateUploadFileType,
  KNOWLEDGE_BANK_EXTENSIONS,
  KNOWLEDGE_BANK_MIME_TYPES,
  LABOUR_REGISTER_EXTENSIONS,
  LABOUR_REGISTER_FILE_ERROR,
  LABOUR_REGISTER_MIME_TYPES,
  labourRegisterContentType,
  MILESTONE_DOCUMENT_EXTENSIONS,
  SIGNED_BOARD_RESOLUTION_EXTENSIONS,
} from '@/lib/upload-limits';
import { validateKnowledgeBankUploadFile } from '@/lib/knowledge-bank/knowledge-bank-storage';
import { validateMilestoneUploadFile } from '@/lib/documents/milestone-document-storage';
import { validateSignedBoardResolutionFile } from '@/lib/board-resolution/board-resolution-storage';

function mockFile(name: string, type: string, size = 1024): File {
  return { name, type, size } as File;
}

describe('upload MIME allowlists', () => {
  it('lists nine document MIME types', () => {
    expect(ALL_DOCUMENT_MIME_TYPES).toHaveLength(9);
  });

  it('accepts .docx by extension when browser sends application/octet-stream', () => {
    const file = mockFile('signed-resolution.docx', 'application/octet-stream');
    expect(resolveUploadExtension(file, SIGNED_BOARD_RESOLUTION_EXTENSIONS)).toBe('docx');
    expect(resolveUploadContentType(file, SIGNED_BOARD_RESOLUTION_EXTENSIONS)).toBe(
      EXTENSION_TO_MIME.docx,
    );
    expect(validateSignedBoardResolutionFile(file)).toBeNull();
  });

  it('accepts correct docx MIME type', () => {
    const file = mockFile('board-resolution.docx', EXTENSION_TO_MIME.docx);
    expect(validateSignedBoardResolutionFile(file)).toBeNull();
    expect(validateMilestoneUploadFile(file)).toBeNull();
    expect(validateKnowledgeBankUploadFile(file)).toBeNull();
  });

  it('accepts legacy .doc by extension with octet-stream', () => {
    const file = mockFile('legacy.doc', 'application/octet-stream');
    expect(resolveUploadExtension(file, MILESTONE_DOCUMENT_EXTENSIONS)).toBe('doc');
    expect(resolveUploadContentType(file, MILESTONE_DOCUMENT_EXTENSIONS)).toBe(
      EXTENSION_TO_MIME.doc,
    );
    expect(validateMilestoneUploadFile(file)).toBeNull();
    expect(validateKnowledgeBankUploadFile(file)).toBeNull();
  });

  it('accepts xlsx and pptx in knowledge bank', () => {
    const xlsx = mockFile('template.xlsx', EXTENSION_TO_MIME.xlsx);
    const pptx = mockFile('deck.pptx', 'application/octet-stream');
    expect(validateKnowledgeBankUploadFile(xlsx)).toBeNull();
    expect(validateKnowledgeBankUploadFile(pptx)).toBeNull();
    expect(validateMilestoneUploadFile(xlsx)).not.toBeNull();
  });

  it('rejects unsupported MIME when extension does not match', () => {
    const file = mockFile('notes.txt', 'application/zip');
    expect(
      validateUploadFileType(
        file,
        KNOWLEDGE_BANK_EXTENSIONS,
        KNOWLEDGE_BANK_MIME_TYPES,
        'unsupported',
      ),
    ).toBe('unsupported');
  });

  it('rejects unknown extensions', () => {
    const file = mockFile('archive.zip', 'application/zip');
    expect(validateSignedBoardResolutionFile(file)).not.toBeNull();
    expect(validateMilestoneUploadFile(file)).not.toBeNull();
    expect(validateKnowledgeBankUploadFile(file)).not.toBeNull();
  });
});

describe('labour-register inputs', () => {
  const check = (f: File) =>
    validateUploadFileType(f, LABOUR_REGISTER_EXTENSIONS, LABOUR_REGISTER_MIME_TYPES, LABOUR_REGISTER_FILE_ERROR);

  it('takes the three formats the reader can actually read', () => {
    expect(check(mockFile('paysheet.xlsx', EXTENSION_TO_MIME.xlsx))).toBeNull();
    expect(check(mockFile('paysheet.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12'))).toBeNull();
    expect(check(mockFile('paysheet.csv', 'text/csv'))).toBeNull();
  });

  it('takes a CSV that Windows reports as an Excel file', () => {
    /* Windows hands .csv to Excel and reports its MIME, which would otherwise look like a
       legacy .xls and be refused. The extension is what governs. */
    expect(check(mockFile('paysheet.csv', 'application/vnd.ms-excel'))).toBeNull();
  });

  it('refuses a legacy .xls, because exceljs cannot read one at all', () => {
    /* Accepting it would fail after the upload instead of at it. */
    expect(check(mockFile('paysheet.xls', 'application/vnd.ms-excel'))).toBe(LABOUR_REGISTER_FILE_ERROR);
  });

  it('refuses a document, which is not an input to anything', () => {
    expect(check(mockFile('scan.pdf', EXTENSION_TO_MIME.pdf))).toBe(LABOUR_REGISTER_FILE_ERROR);
    expect(check(mockFile('photo.png', EXTENSION_TO_MIME.png))).toBe(LABOUR_REGISTER_FILE_ERROR);
  });

  it('stores each format under its own content type', () => {
    expect(labourRegisterContentType(mockFile('a.csv', 'application/vnd.ms-excel'))).toBe('text/csv');
    expect(labourRegisterContentType(mockFile('a.xlsm', ''))).toBe('application/vnd.ms-excel.sheet.macroEnabled.12');
    expect(labourRegisterContentType(mockFile('a.xlsx', ''))).toBe(EXTENSION_TO_MIME.xlsx);
  });

  it('does not widen what the knowledge bank accepts', () => {
    /* KNOWLEDGE_BANK_EXTENSIONS is derived from EXTENSION_TO_MIME's keys, so a register format
       added there would quietly become a knowledge-bank format too. It nearly was. */
    expect(KNOWLEDGE_BANK_EXTENSIONS.has('csv')).toBe(false);
    expect(KNOWLEDGE_BANK_EXTENSIONS.has('xlsm')).toBe(false);
  });
});
