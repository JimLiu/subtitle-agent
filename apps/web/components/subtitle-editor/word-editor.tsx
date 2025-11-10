import React from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import type { JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import Word from './extensions/word-node'

export interface WordEditorProps {
  value: JSONContent
  onValueChange: (next: JSONContent) => void
  onFocus?: (e: FocusEvent) => void
  onBlur?: (e: FocusEvent) => void
  onKeyDown?: (e: KeyboardEvent, editor: Editor) => void
  onWordClick?: (event: PointerEvent, node: PMNode) => void
  editable?: boolean
  className?: string
}

const WordsDoc = Document.extend({
  content: 'word+',
  selectable: false,
  addKeyboardShortcuts: () => ({
    'Shift-Space': () => true,
  }),
})

const isJSONContentEqual = (a?: JSONContent, b?: JSONContent) => {
  if (a === b) return true
  if (!a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

export const WordEditor = React.forwardRef<Editor | null, WordEditorProps>(
  (props, ref) => {
    const { value, onValueChange, onFocus, onBlur, onKeyDown, onWordClick, editable, className } = props
    const wordExtension = React.useMemo(() => Word.configure({ onWordClick }), [onWordClick])

    const editor = useEditor({
      extensions: [WordsDoc, wordExtension, Text],
      parseOptions: { preserveWhitespace: 'full' },
      immediatelyRender: false,
      editable,
      content: value,
      editorProps: {
        attributes: {
          class: 'text-md focus:outline-none',
          spellcheck: 'true',
        },
        handleDOMEvents: {
          paste: (view, ev: ClipboardEvent) => {
            ev.preventDefault()
            const text = ev.clipboardData?.getData('text/plain') ?? ''
            view.dispatch(view.state.tr.insertText(text))
            return true
          },
        },
      },
      onUpdate: ({ editor }) => {
        const json = editor.getJSON()
        if (!isJSONContentEqual(json, value)) {
          onValueChange(json)
        }
      },
      onFocus: onFocus as any,
      onBlur: onBlur as any,
    }, [wordExtension, editable])

    React.useEffect(() => {
      if (!editor || editor.isDestroyed) return
      const current = editor.getJSON()
      if (isJSONContentEqual(current, value)) return

      const anchor = editor.state.selection.anchor
      const chain = editor.chain().setContent(value, {
        emitUpdate: false,
        parseOptions: { preserveWhitespace: 'full' },
      })
      if (editor.state.doc.content.size > 0) {
        chain.setTextSelection(Math.max(0, Math.min(anchor, editor.state.doc.content.size)))
      }
      chain.run()
    }, [value, editor])

    React.useImperativeHandle(ref, () => editor as any, [editor])

    return (
      <EditorContent
        editor={editor}
        className={className}
        onKeyDown={(e) => onKeyDown?.(e.nativeEvent as unknown as KeyboardEvent, editor!)}
        spellCheck
      />
    )
  },
)

WordEditor.displayName = 'WordEditor'

export default WordEditor
