/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, {
  HTMLAttributes,
  FunctionComponent,
  ReactNode,
  Ref,
  useState,
  useMemo,
  useCallback,
} from 'react';

import { useCombinedRefs } from '../../services';
import {
  EuiResizeObserver,
  EuiResizeObserverProps,
} from '../observer/resize_observer';
import type { CommonProps } from '../common';

import { TruncationUtilsWithDOM, TruncationUtilsWithCanvas } from './utils';
import { euiTextTruncateStyles } from './text_truncate.styles';

const TRUNCATION_TYPES = ['end', 'start', 'startEnd', 'middle'] as const;
export type EuiTextTruncationTypes = (typeof TRUNCATION_TYPES)[number];

export type EuiTextTruncateProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onResize'
> &
  CommonProps & {
    /**
     * The full text string to truncate
     */
    text: string;
    /**
     * The truncation type desired. Determines where the ellipses are placed.
     */
    truncation?: EuiTextTruncationTypes;
    /**
     * This prop **only** applies to the `start` and `end` truncation types.
     * It allows preserving a certain number of characters of either the
     * starting or ending text.
     *
     * If the passed offset is greater than the total text length,
     * the offset will be ignored.
     */
    truncationOffset?: number;
    /**
     * This prop **only** applies to the `startEnd` truncation type.
     * It allows customizing the anchor position of the displayed text,
     * which otherwise defaults to the middle of the text string.
     *
     * The primary use case for this prop for is search highlighting - e.g., if
     * a user searches for a specific word in the text, pass the index of that
     * found word to ensure it is always visible.
     *
     * This behavior will intelligently detect when positions are close to the start
     * or end of the text, and omit leading or trailing ellipses when necessary.
     * If the passed position is greater than the total text length,
     * the truncation will simply default to `start` instead.
     */
    truncationPosition?: number;
    /**
     * Defaults to the horizontal ellipsis character.
     * Can be optionally configured to use other punctuation,
     * e.g. spaces, brackets, hyphens, asterisks, etc.
     */
    ellipsis?: string;
    /**
     * By default, EuiTextTruncate will render a resize observer to detect the
     * available width it has. For performance reasons (e.g. multiple truncated
     * text items within the same container), you may opt to pass in your own
     * container width, which will skip initializing a resize observer.
     */
    width?: number;
    /**
     * Optional callback that fires when the default resizer observer both mounts and
     * registers a size change. This callback will **not** fire if `width` is passed.
     */
    onResize?: (width: number) => void;
    /**
     * By default, EuiTextTruncate will calculate its truncation via DOM manipulation
     * and measurement, which has the benefit of automatically inheriting font styles.
     * However, if this approach proves to have a significant performance impact for your
     * usage, consider using the `canvas` API instead, which is more performant.
     *
     * Please note that there are minute pixel to subpixel differences between the
     * two options due to different rendering engines.
     */
    measurementRenderAPI?: 'dom' | 'canvas';
    /**
     * By default, EuiTextTruncate will render the truncated string directly.
     * You can optionally pass a render prop function to the component, which
     * allows for more flexible text rendering, e.g. adding custom markup
     * or highlighting
     */
    children?: (truncatedString: string) => ReactNode;
  };

export const EuiTextTruncate: FunctionComponent<EuiTextTruncateProps> = ({
  width,
  ...props
}) => {
  return width != null ? (
    <EuiTextTruncateWithWidth width={width} {...props} />
  ) : (
    <EuiTextTruncateWithResizeObserver {...props} />
  );
};

const EuiTextTruncateWithWidth: FunctionComponent<
  Omit<EuiTextTruncateProps, 'onResize'> & {
    width: number;
    containerRef?: Ref<HTMLDivElement>;
  }
> = ({
  width,
  children,
  text,
  truncation: _truncation = 'end',
  truncationOffset: _truncationOffset = 0,
  truncationPosition,
  ellipsis = '…',
  containerRef,
  measurementRenderAPI = 'dom',
  ...rest
}) => {
  // Note: This needs to be a state and not a ref to trigger a rerender on mount
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const refs = useCombinedRefs([setContainerEl, containerRef]);

  // Handle exceptions where we need to override the passed props
  const { truncation, truncationOffset } = useMemo(() => {
    let truncation = _truncation;
    let truncationOffset = 0;

    if (_truncation === 'end' || _truncation === 'start') {
      if (0 < _truncationOffset && _truncationOffset < text.length) {
        truncationOffset = _truncationOffset;
      }
    } else if (_truncation === 'startEnd' && truncationPosition != null) {
      if (truncationPosition <= 0) {
        truncation = 'end';
      } else if (truncationPosition >= text.length) {
        truncation = 'start';
      }
    }
    return { truncation, truncationOffset };
  }, [_truncation, _truncationOffset, truncationPosition, text.length]);

  const truncatedText = useMemo(() => {
    let truncatedText = '';
    if (!containerEl || !width) return truncatedText;

    const params = {
      fullText: text,
      ellipsis,
      container: containerEl,
      availableWidth: width,
    };
    const utils =
      measurementRenderAPI === 'canvas'
        ? new TruncationUtilsWithCanvas(params)
        : new TruncationUtilsWithDOM(params);

    if (utils.checkIfTruncationIsNeeded() === false) {
      truncatedText = text;
    } else if (utils.checkSufficientEllipsisWidth(truncation) === false) {
      truncatedText = '';
    } else {
      switch (truncation) {
        case 'end':
          truncatedText = utils.truncateEnd(truncationOffset);
          break;
        case 'start':
          truncatedText = utils.truncateStart(truncationOffset);
          break;
        case 'startEnd':
          if (truncationPosition == null) {
            truncatedText = utils.truncateStartEndAtMiddle();
          } else {
            truncatedText =
              utils.truncateStartEndAtPosition(truncationPosition);
          }
          break;
        case 'middle':
          truncatedText = utils.truncateMiddle();
          break;
      }
    }

    if (measurementRenderAPI === 'dom') {
      (utils as TruncationUtilsWithDOM).cleanup();
    }
    return truncatedText;
  }, [
    width,
    text,
    truncation,
    truncationOffset,
    truncationPosition,
    ellipsis,
    containerEl,
    measurementRenderAPI,
  ]);

  const isTruncating = truncatedText !== text;

  return (
    <div
      css={euiTextTruncateStyles.euiTextTruncate}
      ref={refs}
      title={isTruncating ? text : undefined}
      {...rest}
    >
      {isTruncating ? (
        <>
          <span
            css={euiTextTruncateStyles.truncatedText}
            aria-hidden
            data-test-subj="truncatedText"
          >
            {children ? children(truncatedText) : truncatedText}
          </span>
          <span css={euiTextTruncateStyles.fullText} data-test-subj="fullText">
            {text}
          </span>
        </>
      ) : (
        <span data-test-subj="fullText">{text}</span>
      )}
    </div>
  );
};

const EuiTextTruncateWithResizeObserver: FunctionComponent<
  Omit<EuiTextTruncateProps, 'width'>
> = ({ onResize: _onResize, ...props }) => {
  const [width, setWidth] = useState(0);
  const onResize: EuiResizeObserverProps['onResize'] = useCallback(
    ({ width }) => {
      setWidth(width);
      _onResize?.(width);
    },
    [_onResize]
  );

  return (
    <EuiResizeObserver onResize={onResize}>
      {(ref) => (
        <EuiTextTruncateWithWidth width={width} containerRef={ref} {...props} />
      )}
    </EuiResizeObserver>
  );
};
