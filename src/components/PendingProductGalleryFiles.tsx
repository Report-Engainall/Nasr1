import { useEffect, useState } from 'react';

type Preview = { file: File; url: string };

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'حجم غير معروف';
  if (bytes < 1024) return bytes + ' بايت';
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return kilobytes.toFixed(kilobytes >= 10 ? 0 : 1) + ' كيلوبايت';
  const megabytes = kilobytes / 1024;
  return megabytes.toFixed(megabytes >= 10 ? 0 : 1) + ' ميغابايت';
}

export function PendingProductGalleryFiles({
  files,
  disabled = false,
  onRemove,
}: {
  files: readonly File[];
  disabled?: boolean;
  onRemove: (index: number) => void;
}) {
  const [previews, setPreviews] = useState<Preview[]>([]);

  useEffect(() => {
    const next: Preview[] = [];
    if (typeof URL.createObjectURL === 'function') {
      for (const file of files) {
        next.push({ file, url: URL.createObjectURL(file) });
      }
    }
    setPreviews(next);
    return () => {
      for (const preview of next) URL.revokeObjectURL(preview.url);
    };
  }, [files]);

  if (files.length === 0) return null;
  const previewByFile = new Map(previews.map((preview) => [preview.file, preview.url]));

  return (
    <div
      role="list"
      aria-label="معاينات الصور المختارة للمعرض"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}
    >
      {files.map((file, index) => {
        const previewUrl = previewByFile.get(file);
        return (
          <article
            role="listitem"
            key={file.name + '-' + file.size + '-' + file.lastModified + '-' + index}
            style={{ display: 'grid', gap: 6, minWidth: 0, border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, padding: 8 }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={'معاينة ' + file.name}
                loading="lazy"
                decoding="async"
                width={128}
                height={96}
                style={{ width: '100%', height: 96, objectFit: 'contain', borderRadius: 6 }}
              />
            ) : (
              <div
                role="img"
                aria-label={'معاينة غير متاحة ' + file.name}
                style={{ minHeight: 96, display: 'grid', placeItems: 'center', background: 'var(--muted, #f1f5f9)', borderRadius: 6 }}
              >
                معاينة غير متاحة
              </div>
            )}
            <strong dir="auto" style={{ overflowWrap: 'anywhere', fontSize: 12 }}>{file.name}</strong>
            <small>{formatFileSize(file.size)}</small>
            <button
              type="button"
              className="btn ghost"
              aria-label={'إزالة الصورة المختارة ' + file.name}
              disabled={disabled}
              onClick={() => onRemove(index)}
            >
              إزالة الاختيار
            </button>
          </article>
        );
      })}
    </div>
  );
}
