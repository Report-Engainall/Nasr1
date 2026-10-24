import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const importer = readFileSync(join(process.cwd(), 'src/components/UnifiedImportEngine.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'src/lib/api.ts'), 'utf8');
const sourceHelpers = readFileSync(join(process.cwd(), 'src/lib/unified-import.ts'), 'utf8');
const finalizeGuard = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261024170000_import_finalization_verified_manifest.sql'),
  'utf8',
);
const dbAcceptance = readFileSync(join(process.cwd(), 'scripts/test-database-migrations.mjs'), 'utf8');

describe('unified import end-to-end acceptance contracts', () => {
  it('persists the actual selected source system in request identity, job metadata, and processing fingerprint', () => {
    expect(importer).toContain('sourceSystem: selectedSource');
    expect(importer).toContain('sourceSystem,');
    expect(importer).toContain('sourceSystem: "manual"');
    expect(importer).toContain('source_system: selectedSource');
    expect(importer).toContain('sourceSystem: selectedSource,');
    expect(importer).toContain('sourceSystem: string;');
  });

  it('rejects missing required headers and invalid UTF-8 before attempting finalization', () => {
    expect(importer).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(importer).toContain('missingRequiredHeaders');
    expect(importer).toContain('validateCsvRow(values, headers, dataRows + 1, matchingKey)');
    expect(sourceHelpers).toContain('مفتاح المطابقة الإلزامي');
  });

  it('shows persisted row rejection reasons instead of leaving errors hidden in JSON only', () => {
    expect(importer).toContain('fetchImportRowErrors(job.id, 100)');
    expect(importer).toContain('أسباب رفض الصفوف');
    expect(api).toContain(".eq('status', 'rejected')");
    expect(api).toContain(".limit(limit)");
    expect(importer).toContain('لم يسجل الخادم سببًا نصيًا لهذا الصف');
  });

  it('lets the same verified original XLSX be selected for safe resume', () => {
    expect(importer).toContain('accept=".csv,.xlsx"');
    expect(importer).toContain('ستعاد قراءة الورقة كاملة من الملف المطابق');
    expect(importer).not.toContain('لا يمكن استئناف XLSX الجزئي بأمان');
  });

  it('does not checkpoint a CSV chunk after cancellation interrupts its row parser', () => {
    expect(importer).toContain('A cancellation during row parsing must not certify a partially processed chunk.');
    expect(importer).toMatch(/await parser\.push[\s\S]{0,240}await flushBatch\(\);[\s\S]{0,240}if \(cancelRef\.current\) break;[\s\S]{0,350}recordImportUploadChunk/);
  });

  it('server-gates snapshot finalization on tenant, job state, matching file identity and a complete chunk manifest', () => {
    expect(finalizeGuard).toContain("v_job.status NOT IN ('staging','failed','uploading')");
    expect(finalizeGuard).toContain("v_session.status <> 'uploaded'");
    expect(finalizeGuard).toContain('v_session.file_hash IS DISTINCT FROM v_job.file_hash');
    expect(finalizeGuard).toContain('v_session.verified_chunks <> v_session.total_chunks');
    expect(finalizeGuard).toContain('v_total_bytes <> v_session.file_size');
    expect(finalizeGuard).toContain('processing_config_fingerprint');
    expect(finalizeGuard).toContain('finalize_import_job_without_manifest_guard');
    expect(dbAcceptance).toContain('reject snapshot finalization while an upload manifest is missing its final chunk');
    expect(dbAcceptance).toContain('reject finalization of a cancelled import with a complete upload manifest');
  });

  it('keeps cancelled or failed staging separate from live snapshots and never purges history as rollback', () => {
    expect(importer).toContain('ألغى المستخدم الدفعة؛ لم يتم إنشاء Snapshot.');
    expect(importer).toContain('resumable: true');
    expect(finalizeGuard).not.toMatch(/DELETE\s+FROM\s+public\.onyx_snapshot_rows/i);
    expect(finalizeGuard).not.toMatch(/DELETE\s+FROM\s+public\.import_job_rows/i);
  });
});
