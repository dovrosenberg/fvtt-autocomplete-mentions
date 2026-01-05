import { WindowPosition } from '@/types';

/**
 * Handles all positioning logic for the autocomplete box
 */
export class PositionCalculator {
  private static readonly PADDING_LEFT = 10;
  private static readonly PADDING_TOP = 0;
  private static readonly EXTRA_PADDING_ABOVE = 5;
  private static readonly MIN_TOP_MARGIN = 10;
  private static readonly ESTIMATED_BOX_WIDTH = 300;
  private static readonly ESTIMATED_BOX_HEIGHT = 300;

  private _isPositionedAbove = false;
  private _isPositionedLeft = false;
  private _cursorRect: DOMRect | null = null;

  /**
   * Calculate initial position for the autocomplete box
   */
  calculateInitialPosition(editor: HTMLElement): WindowPosition | null {
    const cursorRect = this._getCorrectedCursorRect(editor);
    if (!cursorRect) return null;

    this._cursorRect = cursorRect;
    this._isPositionedAbove = false;
    this._isPositionedLeft = false;

    const viewport = this._getViewportDimensions();
    let position = {
      left: cursorRect.left + PositionCalculator.PADDING_LEFT,
      top: cursorRect.top + PositionCalculator.PADDING_TOP
    };

    // Apply smart positioning based on available space
    position = this._adjustForHorizontalConstraints(position, cursorRect, viewport);
    position = this._adjustForVerticalConstraints(position, cursorRect, viewport);

    return position;
  }

  /**
   * Adjust position after the box is rendered and we know its actual dimensions
   */
  adjustPositionAfterRender(wrapper: HTMLElement): WindowPosition | null {
    if (!this._cursorRect) return null;

    const boxRect = wrapper.getBoundingClientRect();
    const viewport = this._getViewportDimensions();

    // Recalculate with actual dimensions
    const horizontalPosition = this._calculateHorizontalPosition(this._cursorRect, boxRect.width, viewport.width);
    const top = this._calculateVerticalPosition(this._cursorRect, boxRect.height, viewport.height);

    return {
      left: horizontalPosition.left,
      top: top
    };
  }

  /**
   * Get the corrected cursor rectangle, handling zero-width edge cases
   */
  private _getCorrectedCursorRect(editor: HTMLElement): DOMRect | null {
    // Textareas don't participate in document selection; compute caret rectangle manually.
    if (this._isTextArea(editor)) {
      return this._getTextAreaCaretRect(editor);
    }

    const sel = editor.ownerDocument.getSelection();
    if (!sel || !sel.rangeCount) return null;

    const range = sel.getRangeAt(0).cloneRange();
    if (!range.getClientRects()) return null;

    range.collapse(false);
    let rects = range.getClientRects();

    // Handle cases where cursor position is ambiguous
    if (!rects.length) {
      rects = this._fallbackCursorPosition(range);
    }

    if (rects.length <= 0) return null;

    let rect = rects[0];

    // Fix zero-width rectangles (cursor at left edge)
    if (rect.width === 0) {
      rect = this._fixZeroWidthRect(rect, range);
    }

    return rect;
  }

  private _isTextArea(editor: HTMLElement): editor is HTMLTextAreaElement {
    const win = editor.ownerDocument?.defaultView;
    return !!win && editor instanceof win.HTMLTextAreaElement;
  }

  /**
   * Compute a caret rectangle for a textarea using a hidden mirror element.
   * Based on the common "textarea caret position" mirror technique.
   */
  private _getTextAreaCaretRect(textarea: HTMLTextAreaElement): DOMRect | null {
    const doc = textarea.ownerDocument;
    const win = doc.defaultView;
    if (!win) return null;

    const rect = textarea.getBoundingClientRect();
    const start = textarea.selectionStart ?? 0;

    // If for some reason we can't measure, fall back to the textarea's top-left.
    const fallback = (): DOMRect => ({
      left: rect.left,
      top: rect.top,
      right: rect.left,
      bottom: rect.top + 16,
      width: 0,
      height: 16,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({})
    } as DOMRect);

    let mirror: HTMLDivElement | null = null;
    try {
      const cs = win.getComputedStyle(textarea);

      mirror = doc.createElement('div');
      mirror.setAttribute('aria-hidden', 'true');

      // Position the mirror over the textarea so measurements are in the same coordinate space.
      mirror.style.position = 'fixed';
      mirror.style.left = `${rect.left}px`;
      mirror.style.top = `${rect.top}px`;
      mirror.style.width = cs.width;
      mirror.style.height = cs.height;
      mirror.style.overflow = 'auto';
      mirror.style.visibility = 'hidden';
      mirror.style.pointerEvents = 'none';
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.wordWrap = 'break-word';

      // Copy text rendering and box styles that affect layout.
      const propsToCopy = [
        'boxSizing',
        'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth',
        'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
        'letterSpacing', 'textTransform', 'textIndent',
        'lineHeight',
        'tabSize',
      ] as const;
      for (const prop of propsToCopy) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mirror.style as any)[prop] = (cs as any)[prop];
      }

      // Ensure the text content wraps like the textarea.
      mirror.style.borderStyle = 'solid';
      mirror.style.borderColor = 'transparent';

      // Populate content up to caret.
      const before = textarea.value.substring(0, start);
      mirror.textContent = before;

      const marker = doc.createElement('span');
      marker.textContent = '\u200b'; // zero-width marker
      mirror.appendChild(marker);

      doc.body.appendChild(mirror);

      // Match scrolling so the caret rect corresponds to the visible caret.
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;

      const markerRect = marker.getBoundingClientRect();
      return markerRect;
    } catch {
      return fallback();
    } finally {
      mirror?.remove();
    }
  }

  /**
   * Handle fallback cursor positioning when getClientRects returns empty
   */
  private _fallbackCursorPosition(range: Range): DOMRectList {
    if (range.startContainer && range.collapsed) {
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const tempRange = range.cloneRange();
        if (range.startOffset > 0) {
          tempRange.setStart(range.startContainer, range.startOffset - 1);
          tempRange.setEnd(range.startContainer, range.startOffset);
          const tempRects = tempRange.getClientRects();
          if (tempRects.length > 0) return tempRects;
        } else {
          tempRange.selectNodeContents(range.startContainer);
          return tempRange.getClientRects();
        }
      } else {
        range.selectNodeContents(range.startContainer);
        return range.getClientRects();
      }
    }
    return [] as any;
  }

  /**
   * Fix zero-width rectangles by using parent element positioning
   */
  private _fixZeroWidthRect(rect: DOMRect, range: Range): DOMRect {
    let parentElement = range.startContainer;
    if (parentElement.nodeType === Node.TEXT_NODE) {
      parentElement = parentElement.parentElement as HTMLElement;
    }

    if (parentElement && (parentElement as HTMLElement).getBoundingClientRect) {
      const parentRect = (parentElement as HTMLElement).getBoundingClientRect();
      return {
        left: parentRect.left,
        top: rect.top,
        right: parentRect.left,
        bottom: rect.top + 16,
        width: 0,
        height: 16,
        x: parentRect.left,
        y: rect.top
      } as DOMRect;
    }

    return rect;
  }

  private _getViewportDimensions() {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  private _adjustForHorizontalConstraints(
    position: WindowPosition, 
    cursorRect: DOMRect, 
    viewport: { width: number; height: number }
  ): WindowPosition {
    if (position.left + PositionCalculator.ESTIMATED_BOX_WIDTH > viewport.width) {
      position.left = Math.max(0, cursorRect.left - PositionCalculator.ESTIMATED_BOX_WIDTH - PositionCalculator.PADDING_LEFT);
      this._isPositionedLeft = true;
    }
    return position;
  }

  private _adjustForVerticalConstraints(
    position: WindowPosition, 
    cursorRect: DOMRect, 
    viewport: { width: number; height: number }
  ): WindowPosition {
    if (position.top + PositionCalculator.ESTIMATED_BOX_HEIGHT > viewport.height) {
      const idealTop = cursorRect.top - PositionCalculator.ESTIMATED_BOX_HEIGHT - PositionCalculator.PADDING_TOP - PositionCalculator.EXTRA_PADDING_ABOVE;
      
      if (idealTop >= PositionCalculator.MIN_TOP_MARGIN) {
        position.top = idealTop;
        this._isPositionedAbove = true;
      } else {
        const totalNeededHeight = PositionCalculator.ESTIMATED_BOX_HEIGHT + PositionCalculator.EXTRA_PADDING_ABOVE + PositionCalculator.PADDING_TOP + 20;
        if (viewport.height < totalNeededHeight) {
          position.top = Math.min(position.top, viewport.height - PositionCalculator.ESTIMATED_BOX_HEIGHT);
        } else {
          position.top = Math.max(PositionCalculator.MIN_TOP_MARGIN, idealTop);
          this._isPositionedAbove = true;
        }
      }
    }
    return position;
  }

  private _calculateHorizontalPosition(cursorRect: DOMRect, boxWidth: number, viewportWidth: number): { left: number } {
    if (this._isPositionedLeft) {
      const newLeft = cursorRect.left - boxWidth - PositionCalculator.PADDING_LEFT;
      return { left: Math.max(0, newLeft) };
    } else {
      const normalLeft = cursorRect.left + PositionCalculator.PADDING_LEFT;
      if (normalLeft + boxWidth > viewportWidth) {
        this._isPositionedLeft = true;
        return { left: Math.max(0, cursorRect.left - boxWidth - PositionCalculator.PADDING_LEFT) };
      }
      return { left: normalLeft };
    }
  }

  private _calculateVerticalPosition(cursorRect: DOMRect, boxHeight: number, viewportHeight: number): number {
    if (this._isPositionedAbove) {
      const idealTop = cursorRect.top - boxHeight - PositionCalculator.PADDING_TOP - PositionCalculator.EXTRA_PADDING_ABOVE;
      
      if (idealTop < PositionCalculator.MIN_TOP_MARGIN) {
        const totalNeededHeight = boxHeight + PositionCalculator.EXTRA_PADDING_ABOVE + PositionCalculator.PADDING_TOP + 20;
        if (viewportHeight < totalNeededHeight) {
          this._isPositionedAbove = false;
          return Math.min(cursorRect.top + PositionCalculator.PADDING_TOP, viewportHeight - boxHeight);
        } else {
          return Math.max(PositionCalculator.MIN_TOP_MARGIN, idealTop);
        }
      }
      return idealTop;
    } else {
      const normalTop = cursorRect.top + PositionCalculator.PADDING_TOP;
      if (normalTop + boxHeight > viewportHeight) {
        const idealTopAbove = cursorRect.top - boxHeight - PositionCalculator.PADDING_TOP - PositionCalculator.EXTRA_PADDING_ABOVE;
        
        if (idealTopAbove >= PositionCalculator.MIN_TOP_MARGIN) {
          this._isPositionedAbove = true;
          return idealTopAbove;
        } else {
          const totalNeededHeight = boxHeight + PositionCalculator.EXTRA_PADDING_ABOVE + PositionCalculator.PADDING_TOP + 20;
          if (viewportHeight < totalNeededHeight) {
            return Math.min(normalTop, viewportHeight - boxHeight);
          } else {
            this._isPositionedAbove = true;
            return Math.max(PositionCalculator.MIN_TOP_MARGIN, idealTopAbove);
          }
        }
      }
      return normalTop;
    }
  }
} 