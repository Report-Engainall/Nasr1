// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PendingProductGalleryFiles } from './PendingProductGalleryFiles';

const createObjectURL = vi.fn((_file: Blob | MediaSource) => 'blob:preview');
const revokeObjectURL = vi.fn((_url: string) => undefined);
let originalCreate: PropertyDescriptor | undefined;
let originalRevoke: PropertyDescriptor | undefined;

beforeEach(() => {
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
});

afterEach(() => {
  cleanup();
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('PendingProductGalleryFiles', () => {
  it('renders one thumbnail per selected file, supports removal and revokes previews on unmount', async () => {
    createObjectURL
      .mockReturnValueOnce('blob:first-gallery-image')
      .mockReturnValueOnce('blob:second-gallery-image');
    const files = [
      new File(['first image'], '00125.webp', { type: 'image/webp' }),
      new File(['second image'], '00125__2.webp', { type: 'image/webp' }),
    ];
    const onRemove = vi.fn();
    const { unmount } = render(<PendingProductGalleryFiles files={files} onRemove={onRemove} />);

    const list = screen.getByRole('list', { name: 'معاينات الصور المختارة للمعرض' });
    await waitFor(() => expect(list.querySelectorAll('img')).toHaveLength(2));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'معاينة 00125.webp' })).toHaveAttribute('src', 'blob:first-gallery-image');
    expect(screen.getByRole('img', { name: 'معاينة 00125__2.webp' })).toHaveAttribute('src', 'blob:second-gallery-image');
    expect(screen.getByRole('button', { name: 'إزالة الصورة المختارة 00125.webp' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'إزالة الصورة المختارة 00125__2.webp' }));
    expect(onRemove).toHaveBeenCalledWith(1);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first-gallery-image');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second-gallery-image');
  });

  it('disables file removal while the product is being saved', () => {
    const file = new File(['image'], 'sample.png', { type: 'image/png' });
    render(<PendingProductGalleryFiles files={[file]} disabled onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'إزالة الصورة المختارة sample.png' })).toBeDisabled();
  });
});
