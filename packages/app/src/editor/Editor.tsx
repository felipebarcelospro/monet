import { autocompletion, completionKeymap, type CompletionSource } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder, type ViewUpdate } from '@codemirror/view'
import { useEffect, useRef } from 'react'

import { liveMarkdown } from './decorations'
import { liveBlockExtension } from './liveBlocks'

/** A note the wikilink autocomplete can offer. */
export interface EditorNote {
  id: string
  title: string
  path: string
}

/**
 * The Markdown editor.
 *
 * It is a controlled CodeMirror instance: the store owns the text, the editor
 * reports every change, and an external change (another app writing the file)
 * is applied without echoing back into the store.
 */
export function Editor({
  value,
  placeholder: placeholderText,
  notes,
  notePath,
  onChange,
}: {
  value: string
  placeholder: string
  notes: EditorNote[]
  notePath: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const applying = useRef(false)
  const onChangeRef = useRef(onChange)
  const notesRef = useRef(notes)
  const placeholderCompartment = useRef(new Compartment())
  const placeholderTextRef = useRef(placeholderText)

  onChangeRef.current = onChange
  notesRef.current = notes
  placeholderTextRef.current = placeholderText

  useEffect(() => {
    const parent = host.current
    if (!parent) return

    const source: CompletionSource = (context) => {
      const before = context.matchBefore(/\[\[([^\]\n]*)$/u)
      if (!before) return null

      const term = before.text.slice(2).toLowerCase()
      const options = notesRef.current
        .filter((note) => note.title.toLowerCase().includes(term))
        .slice(0, 24)
        .map((note) => ({
          label: note.title,
          detail: note.path.replace(/\.md$/u, '').split('/').slice(0, -1).join('/'),
          type: 'text',
          apply: `${note.title}]]`,
        }))

      if (options.length === 0) return null
      return {
        from: before.from + 2,
        options,
        validFor: /^[^\]\n]*$/u,
      }
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown(),
        history(),
        EditorView.lineWrapping,
        liveMarkdown,
        liveBlockExtension(notePath),
        autocompletion({
          override: [source],
          icons: false,
          closeOnBlur: true,
          activateOnTyping: true,
        }),
        keymap.of([
          ...completionKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorState.tabSize.of(2),
        EditorView.contentAttributes.of({
          spellcheck: 'true',
          autocorrect: 'on',
        }),
        placeholderCompartment.current.of(placeholder(placeholderTextRef.current)),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (!update.docChanged) return
          if (applying.current) return
          onChangeRef.current(update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          mousedown(event) {
            if (!(event.metaKey || event.ctrlKey)) return false
            const element = (event.target as HTMLElement).closest('.cm-wikilink')
            const target = element?.getAttribute('data-target')
            if (!target) return false
            window.dispatchEvent(new CustomEvent('monet:open-wikilink', { detail: target }))
            event.preventDefault()
            return true
          },
        }),
        EditorView.theme({
          '&': { backgroundColor: 'transparent' },
          '.cm-scroller': { overflow: 'visible' },
          '.cm-content': { padding: '0' },
          '.cm-line': { padding: '0' },
        }),
      ],
    })

    const view = new EditorView({ state, parent })
    viewRef.current = view

    const focus = (): void => view.focus()
    const outline = (event: Event): void => {
      const text = String((event as CustomEvent).detail ?? '')
      if (text.length === 0) return
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
      const pattern = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'u')
      for (let number = 1; number <= view.state.doc.lines; number += 1) {
        const line = view.state.doc.line(number)
        if (pattern.test(line.text)) {
          view.dispatch({
            selection: { anchor: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 24 }),
          })
          view.focus()
          return
        }
      }
    }

    window.addEventListener('monet:focus-editor', focus)
    window.addEventListener('monet:outline', outline)

    return () => {
      window.removeEventListener('monet:focus-editor', focus)
      window.removeEventListener('monet:outline', outline)
      view.destroy()
      viewRef.current = null
    }
    // The component is remounted for each note, so the document is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply an external change (another app wrote the file) without echoing it.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return

    applying.current = true
    try {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        scrollIntoView: false,
      })
    } finally {
      applying.current = false
    }
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: placeholderCompartment.current.reconfigure(placeholder(placeholderText)),
    })
  }, [placeholderText])

  return <div className="editor-body" ref={host} />
}
