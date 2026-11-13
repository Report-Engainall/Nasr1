import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { ChevronLeft, ChevronRight, Package, X } from "lucide-react";

type ProductMediaGalleryProps = {
  productName: string;
  imageUrls: readonly string[];
};

const SWIPE_THRESHOLD = 40;

function normalizeImageUrls(imageUrls: readonly string[]): string[] {
  return Array.from(new Set(
    imageUrls.filter((url): url is string =>
      typeof url === "string" && url.trim() === url && /^https:\/\//i.test(url),
    ),
  ));
}

/**
 * Product image gallery with one synchronized selection across the stage,
 * thumbnail rail and accessible lightbox. Displays existing public image URLs;
 * it does not upload or persist media.
 */
export function ProductMediaGallery({ productName, imageUrls }: ProductMediaGalleryProps) {
  const images = normalizeImageUrls(imageUrls);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const currentIndex = images.length > 0 ? Math.min(selectedIndex, images.length - 1) : 0;
  const selectedImageUrl = images[currentIndex];

  function showPreviousImage() {
    if (images.length < 2) return;
    setSelectedIndex((current) => (current - 1 + images.length) % images.length);
  }

  function showNextImage() {
    if (images.length < 2) return;
    setSelectedIndex((current) => (current + 1) % images.length);
  }

  function openLightbox(event: ReactMouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = event.currentTarget;
    setIsLightboxOpen(true);
  }

  function closeLightbox() {
    setIsLightboxOpen(false);
  }

  useEffect(() => {
    if (!isLightboxOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [isLightboxOpen]);

  function handleLightboxKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft" && images.length > 1) {
      event.preventDefault();
      showNextImage();
      return;
    }
    if (event.key === "ArrowRight" && images.length > 1) {
      event.preventDefault();
      showPreviousImage();
      return;
    }
    if (event.key === "Home" && images.length > 0) {
      event.preventDefault();
      setSelectedIndex(0);
      return;
    }
    if (event.key === "End" && images.length > 0) {
      event.preventDefault();
      setSelectedIndex(images.length - 1);
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLImageElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLImageElement>) {
    const startX = touchStartXRef.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartXRef.current = null;
    if (startX === null || endX === undefined || images.length < 2) return;
    const distance = endX - startX;
    if (Math.abs(distance) < SWIPE_THRESHOLD) return;
    event.preventDefault();
    if (distance < 0) showNextImage();
    else showPreviousImage();
  }

  if (images.length === 0) {
    return (
      <div className="sf-product-media-empty" aria-label="لا توجد صور متاحة للمنتج">
        <Package size={72} aria-hidden="true" />
        <span>لا توجد صور متاحة</span>
      </div>
    );
  }

  return (
    <div className="sf-product-media-gallery" dir="rtl">
      <div className="sf-product-media-stage">
        <button
          ref={triggerRef}
          type="button"
          className="sf-product-media-stage-trigger"
          aria-label={"تكبير صور " + productName}
          onClick={openLightbox}
        >
          <img src={selectedImageUrl} alt={productName} loading="eager" decoding="async" />
          <span className="sf-detail-image-hint">اضغط لتكبير الصورة</span>
        </button>
        {images.length > 1 ? (
          <>
            <button
              type="button"
              className="sf-product-media-nav sf-product-media-nav--previous"
              aria-label="الصورة السابقة"
              onClick={showPreviousImage}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sf-product-media-nav sf-product-media-nav--next"
              aria-label="الصورة التالية"
              onClick={showNextImage}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      <div className="sf-product-media-footer">
        {images.length > 1 ? (
          <div className="sf-product-media-thumbnails" role="group" aria-label="صور المنتج">
            {images.map((url, index) => (
              <button
                key={url}
                type="button"
                aria-label={"عرض صورة المنتج " + (index + 1)}
                aria-pressed={currentIndex === index}
                onClick={() => setSelectedIndex(index)}
              >
                <img src={url} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        ) : null}
        <span className="sf-product-media-count" aria-live="polite" aria-atomic="true">
          الصورة {currentIndex + 1} من {images.length}
        </span>
      </div>

      {isLightboxOpen ? (
        <div
          className="sf-image-lightbox"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeLightbox();
          }}
        >
          <div
            ref={dialogRef}
            className="sf-image-lightbox-panel"
            role="dialog"
            aria-modal="true"
            aria-label={"معرض صور " + productName}
            onKeyDown={handleLightboxKeyDown}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="sf-image-lightbox-close"
              aria-label="إغلاق معرض الصور"
              onClick={closeLightbox}
            >
              <X size={16} aria-hidden="true" />
              إغلاق الصورة
            </button>
            <div className="sf-image-lightbox-navigation">
              {images.length > 1 ? (
                <button type="button" className="sf-image-lightbox-nav" aria-label="الصورة السابقة" onClick={showPreviousImage}>
                  <ChevronRight size={24} aria-hidden="true" />
                </button>
              ) : <span aria-hidden="true" />}
              <div className="sf-image-lightbox-image">
                <img
                  src={selectedImageUrl}
                  alt={productName}
                  decoding="async"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                />
              </div>
              {images.length > 1 ? (
                <button type="button" className="sf-image-lightbox-nav" aria-label="الصورة التالية" onClick={showNextImage}>
                  <ChevronLeft size={24} aria-hidden="true" />
                </button>
              ) : <span aria-hidden="true" />}
            </div>
            <span className="sf-image-lightbox-count" aria-live="polite" aria-atomic="true">
              الصورة {currentIndex + 1} من {images.length}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
