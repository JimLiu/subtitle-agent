import { Node, mergeAttributes } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'

export interface ElevenWordAttrs {
  id?: string
  active?: boolean | null
  played?: boolean | null
  class?: string
}

export interface ElevenWordOptions {
  onWordClick?: (event: PointerEvent, node: PMNode) => void
}

export const Word = Node.create<ElevenWordOptions>({
  name: 'word',
  group: 'word',
  content: 'text*',
  inline: true,
  defining: true,
  selectable: true,
  whitespace: 'pre',

  addOptions() {
    return {
      onWordClick: undefined,
    }
  },

  addAttributes() {
    return {
      active: {
        default: null,
        parseHTML: (el: Element) => {
          const raw = el.getAttribute('data-active')
          if (raw === 'true') return true
          if (raw === 'false') return false
          return null
        },
        renderHTML: (attrs: ElevenWordAttrs) => ({ 'data-active': attrs.active }),
      },
      played: {
        default: null,
        parseHTML: (el: Element) => {
          const raw = el.getAttribute('data-played')
          if (raw === 'true') return true
          if (raw === 'false') return false
          return null
        },
        renderHTML: (attrs: ElevenWordAttrs) => ({ 'data-played': attrs.played }),
      },
      id: {
        required: true,
        parseHTML: (el: Element) => el.getAttribute('data-id'),
        renderHTML: (attrs: ElevenWordAttrs) => ({ 'data-id': attrs.id }),
      },
      class: {
        default: undefined,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="word"]' }, { tag: 'eleven-word' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const active = (node.attrs?.active ?? null) as boolean | null
    const played = (node.attrs?.played ?? null) as boolean | null
    const cls =
      [
        node.attrs?.class,
        HTMLAttributes.class,
        played ? 'text-foreground' : 'text-subtle',
        active ? '[text-shadow:_0px_0px_1px_rgba(0,0,0,0.75)]' : undefined,
      ]
        .filter(Boolean)
        .join(' ') || undefined

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'word',
        class: cls,
      }),
      0,
    ]
  },

  addProseMirrorPlugins() {
    const { onWordClick } = this.options
    if (!onWordClick) return []

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            pointerdown: (view, event) => {
              const target = event.target as HTMLElement | null
              const wordEl = target?.closest('[data-type="word"]') as HTMLElement | null
              if (!wordEl) return false

              let pos: number
              try {
                pos = view.posAtDOM(wordEl, 0)
              } catch {
                return false
              }

              const resolvedPos = view.state.doc.resolve(pos)
              const node = resolvedPos.nodeAfter
              if (!node) return false

              event.stopPropagation()
              onWordClick(event as PointerEvent, node)
              return true
            },
          },
        },
      }),
    ]
  },
})

const ElevenWord = Word
export default ElevenWord
