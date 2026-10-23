import React, { useCallback, useMemo, useRef, useState } from 'react';
import { DeleteOutlined, FileTextOutlined, FormatPainterOutlined } from '@ant-design/icons';

export interface JsonEditorError {
  title: string;
  message: string;
}

export interface JsonContextEditorProps {
  /** DOM id of the textarea; the page label points at it with htmlFor. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  onFormat: () => void;
  onInsertSample: () => void;
  onClear: () => void;
  /** False while the payload does not parse as a JSON object. */
  isValid: boolean;
  error: JsonEditorError | null;
  onSubmitShortcut?: () => void;
  placeholder?: string;
}

const DEFAULT_PLACEHOLDER = '{\n  "country": "CN",\n  "plan": "premium"\n}';

/** Max editor body height when the user drags the corner handle. */
const MIN_EDITOR_HEIGHT = 180;
const MAX_EDITOR_HEIGHT = 720;

const TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;

/**
 * Tokenizes the JSON text for the syntax layer. It intentionally works on
 * incomplete/broken input too: highlighting must not disappear while the user
 * is mid-keystroke, and the real validation feedback is owned by the page.
 */
function renderHighlighted(source: string): React.ReactNode[] {
  if (!source) return [];
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;
  TOKEN_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(source)) !== null) {
    if (match.index > lastIndex) nodes.push(source.slice(lastIndex, match.index));
    const token = match[0];

    if (match[1] !== undefined) {
      // A string followed by ":" is an object key, everything else is a value.
      const isKey = /^\s*:/.test(source.slice(TOKEN_PATTERN.lastIndex));
      nodes.push(
        <span key={tokenIndex} className={isKey ? 'ctx-token-key' : 'ctx-token-string'}>
          {token}
        </span>
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <span key={tokenIndex} className="ctx-token-number">
          {token}
        </span>
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <span key={tokenIndex} className="ctx-token-literal">
          {token}
        </span>
      );
    } else {
      nodes.push(
        <span key={tokenIndex} className="ctx-token-punct">
          {token}
        </span>
      );
    }
    tokenIndex += 1;
    lastIndex = TOKEN_PATTERN.lastIndex;
  }

  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

/**
 * Context JSON editor matched to the evaluation mock:
 * gutter + highlighted code layer under a real (transparent) textarea so the
 * user keeps native caret, selection, IME and undo behaviour.
 */
export const JsonContextEditor: React.FC<JsonContextEditorProps> = ({
  id,
  value,
  onChange,
  onFormat,
  onInsertSample,
  onClear,
  isValid,
  error,
  onSubmitShortcut,
  placeholder = DEFAULT_PLACEHOLDER,
}) => {
  const codeLayerRef = useRef<HTMLPreElement>(null);
  const gutterLayerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);

  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const highlighted = useMemo(() => renderHighlighted(value), [value]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = event.currentTarget;
    if (codeLayerRef.current) {
      codeLayerRef.current.scrollTop = scrollTop;
      codeLayerRef.current.scrollLeft = scrollLeft;
    }
    if (gutterLayerRef.current) {
      gutterLayerRef.current.style.transform = `translateY(${-scrollTop}px)`;
    }
  }, []);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = rootRef.current?.getBoundingClientRect().height ?? 240;

    const move = (moveEvent: PointerEvent) => {
      const next = Math.min(
        MAX_EDITOR_HEIGHT,
        Math.max(MIN_EDITOR_HEIGHT, startHeight + moveEvent.clientY - startY)
      );
      setManualHeight(next);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onSubmitShortcut?.();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`ctx-editor${isValid ? '' : ' is-invalid'}${error ? ' has-error' : ''}${
        composing ? ' is-composing' : ''
      }`}
      style={manualHeight === null ? undefined : { flex: '0 0 auto', height: manualHeight }}
    >
      <div className="ctx-editor-shell">
        <div className="ctx-editor-bar">
          <span className="ctx-editor-kind">JSON</span>
          <div className="ctx-editor-tools">
            <button
              type="button"
              className="ctx-tool"
              onClick={onFormat}
              disabled={!isValid}
              title="自动美化排版 JSON"
            >
              <span className="ctx-tool-icon" aria-hidden="true">
                <FormatPainterOutlined />
              </span>
              格式化
            </button>
            <span className="ctx-tool-sep" aria-hidden="true" />
            <button type="button" className="ctx-tool" onClick={onInsertSample}>
              <span className="ctx-tool-icon" aria-hidden="true">
                <FileTextOutlined />
              </span>
              插入示例
            </button>
            <span className="ctx-tool-sep" aria-hidden="true" />
            <button type="button" className="ctx-tool" onClick={onClear}>
              <span className="ctx-tool-icon" aria-hidden="true">
                <DeleteOutlined />
              </span>
              清空
            </button>
          </div>
        </div>

        <div className="ctx-editor-body">
          <div className="ctx-editor-gutter" aria-hidden="true">
            <div ref={gutterLayerRef} className="ctx-editor-gutter-layer">
              {Array.from({ length: lineCount }, (_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
          </div>

          <div className="ctx-editor-code">
            <pre ref={codeLayerRef} className="ctx-editor-highlight" aria-hidden="true">
              <code>
                {highlighted}
                {'\n'}
              </code>
            </pre>
            <textarea
              id={id}
              className="ctx-editor-input"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              aria-invalid={!isValid}
              aria-describedby={error ? `${id}-error` : undefined}
              placeholder={placeholder}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              wrap="off"
            />
          </div>
        </div>

        <div
          className="ctx-editor-resize"
          aria-hidden="true"
          onPointerDown={handleResizeStart}
        />
      </div>

      {error && (
        <div className="ctx-editor-error" id={`${id}-error`} data-testid="context-json-error" role="alert">
          <span className="ctx-editor-error-icon" aria-hidden="true">
            !
          </span>
          <div className="ctx-editor-error-body">
            <div className="ctx-editor-error-title">{error.title}</div>
            <div className="ctx-editor-error-message">{error.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};
