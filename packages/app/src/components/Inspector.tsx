import {
  AlignLeft,
  ArrowDownLeft,
  ArrowUpRight,
  AtSign,
  Calendar,
  CircleDot,
  Clock,
  ExternalLink,
  Folder,
  Link2,
  ListTree,
  Network,
  Plus,
  Shapes,
  SlidersHorizontal,
  Tags,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { parseHeadings } from '@monet/core/browser'

import { useT } from '../hooks/useT'
import { LocalGraph } from './LocalGraph'
import { dateTime, longDate, readingMinutes, statusName, tagTone, typeName } from '../lib/notes'
import { useStore } from '../state/store'
import type { NoteSummary } from '../shared/contract'
import { MenuButton, MenuItem, MenuLabel } from './Menu'
import { statusTone, typeIcon, typeTone } from './Icons'

const TYPES = [
  'note',
  'inbox',
  'project',
  'area',
  'person',
  'meeting',
  'daily',
  'resource',
  'essay',
]
const STATUSES = ['inbox', 'active', 'done', 'archived', 'someday']

/** The fourth column: properties and relations. */
export function Inspector(): React.JSX.Element {
  const t = useT()
  const document = useStore((state) => state.document)
  const snapshot = useStore((state) => state.snapshot)
  const locale = useStore((state) => state.prefs.locale)
  const toggleInspector = useStore((state) => state.toggleInspector)
  const setProperty = useStore((state) => state.setProperty)
  const toggleTag = useStore((state) => state.toggleTag)
  const selectNote = useStore((state) => state.selectNote)

  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [addingProperty, setAddingProperty] = useState(false)
  const [propertyKey, setPropertyKey] = useState('')
  const [propertyValue, setPropertyValue] = useState('')

  const summary: NoteSummary | null = document
    ? (snapshot?.notes.find((note) => note.id === document.id) ?? null)
    : null

  const headings = useMemo(() => {
    if (!document) return []
    return parseHeadings(document.body).slice(0, 40)
  }, [document?.body, document?.id])

  const outgoing = (summary?.outgoing ?? [])
    .map((id) => snapshot?.notes.find((note) => note.id === id))
    .filter((note): note is NoteSummary => Boolean(note))
  const backlinks = (summary?.backlinks ?? [])
    .map((id) => snapshot?.notes.find((note) => note.id === id))
    .filter((note): note is NoteSummary => Boolean(note))

  const type = summary?.type ?? 'note'
  const status = summary?.status
  const url = typeof document?.frontmatter['url'] === 'string' ? document.frontmatter['url'] : ''
  const aliases = Array.isArray(document?.frontmatter['aliases'])
    ? (document?.frontmatter['aliases'] as string[])
    : typeof document?.frontmatter['aliases'] === 'string'
      ? [document?.frontmatter['aliases'] as string]
      : []

  const TypeIcon = typeIcon(type)

  const commitTag = (): void => {
    const value = tagDraft.trim().replace(/^#+/u, '')
    if (value.length > 0) void toggleTag(value)
    setTagDraft('')
    setAddingTag(false)
  }

  return (
    <aside className="column inspector">
      <header className="inspector-header">
        <div className="inspector-title">
          <SlidersHorizontal size={13} strokeWidth={1.7} />
          {t('inspector.properties')}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={toggleInspector}
        >
          <X size={13} strokeWidth={1.8} />
        </button>
      </header>

      {!document || !summary ? (
        <div className="inspector-scroll">
          <div className="rel-empty" style={{ paddingTop: 18 }}>
            {t('editor.noNote.title')}
          </div>
        </div>
      ) : (
        <div className="inspector-scroll">
          <section className="prop-section">
            <div className="prop-row">
              <TypeIcon className="prop-icon" size={13} strokeWidth={1.7} />
              <span className="prop-label">{t('inspector.type')}</span>
              <div className="prop-value">
                <MenuButton
                  align="left"
                  trigger={({ toggle }) => (
                    <button
                      type="button"
                      className={`chip chip-button tone-${typeTone(type)}`}
                      onClick={toggle}
                    >
                      {typeName(type, t)}
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuLabel>{t('inspector.type')}</MenuLabel>
                      {TYPES.map((item) => (
                        <MenuItem
                          key={item}
                          selected={item === type}
                          onSelect={() => {
                            close()
                            void setProperty('type', item)
                          }}
                        >
                          {typeName(item, t)}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </MenuButton>
              </div>
            </div>

            <div className="prop-row">
              <CircleDot className="prop-icon" size={13} strokeWidth={1.7} />
              <span className="prop-label">{t('inspector.status')}</span>
              <div className="prop-value">
                <MenuButton
                  align="left"
                  trigger={({ toggle }) => (
                    <button
                      type="button"
                      className={`chip chip-button ${
                        status ? `tone-${statusTone(status)}` : 'tone-neutral'
                      }`}
                      onClick={toggle}
                    >
                      {status ? statusName(status, t) : t('inspector.empty')}
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuLabel>{t('inspector.status')}</MenuLabel>
                      {STATUSES.map((item) => (
                        <MenuItem
                          key={item}
                          selected={item === status}
                          onSelect={() => {
                            close()
                            void setProperty('status', item)
                          }}
                        >
                          {statusName(item, t)}
                        </MenuItem>
                      ))}
                      {status ? (
                        <>
                          <div className="menu-separator" />
                          <MenuItem
                            onSelect={() => {
                              close()
                              void setProperty('status', null)
                            }}
                          >
                            {t('common.none')}
                          </MenuItem>
                        </>
                      ) : null}
                    </>
                  )}
                </MenuButton>
              </div>
            </div>

            <div className="prop-row">
              <Calendar className="prop-icon" size={13} strokeWidth={1.7} />
              <span className="prop-label">{t('inspector.created')}</span>
              <div className="prop-value">
                <span className="prop-text">{longDate(document.createdAt, locale)}</span>
              </div>
            </div>

            <div className="prop-row">
              <Clock className="prop-icon" size={13} strokeWidth={1.7} />
              <span className="prop-label">{t('inspector.modified')}</span>
              <div className="prop-value">
                <span className="prop-text">{dateTime(document.modifiedAt, locale)}</span>
              </div>
            </div>

            <div className="prop-row" style={{ alignItems: 'flex-start', paddingTop: 6 }}>
              <Tags className="prop-icon" size={13} strokeWidth={1.7} style={{ marginTop: 4 }} />
              <span className="prop-label" style={{ paddingTop: 3 }}>
                {t('inspector.tags')}
              </span>
              <div className="prop-value">
                <div className="tag-editor">
                  {summary.tags.map((tag) => (
                    <span key={tag} className={`chip tone-${tagTone(tag)} chip-button`}>
                      {tag}
                      <button
                        type="button"
                        className="chip-remove"
                        aria-label={t('inspector.remove')}
                        onClick={() => void toggleTag(tag)}
                      >
                        <X size={9} strokeWidth={2.4} />
                      </button>
                    </span>
                  ))}
                  {addingTag ? (
                    <input
                      autoFocus
                      className="inline-input"
                      style={{ width: 84 }}
                      value={tagDraft}
                      placeholder={t('inspector.tagPlaceholder')}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onBlur={commitTag}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitTag()
                        if (event.key === 'Escape') {
                          setTagDraft('')
                          setAddingTag(false)
                        }
                      }}
                    />
                  ) : (
                    <button type="button" className="tag-add" onClick={() => setAddingTag(true)}>
                      <Plus size={10} strokeWidth={2} />
                      {t('inspector.addTag')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {url ? (
              <div className="prop-row">
                <Link2 className="prop-icon" size={13} strokeWidth={1.7} />
                <span className="prop-label">{t('inspector.url')}</span>
                <div className="prop-value">
                  {editingUrl ? (
                    <input
                      autoFocus
                      className="inline-input"
                      value={urlDraft}
                      onChange={(event) => setUrlDraft(event.target.value)}
                      onBlur={() => {
                        void setProperty('url', urlDraft.trim().length > 0 ? urlDraft.trim() : null)
                        setEditingUrl(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void setProperty(
                            'url',
                            urlDraft.trim().length > 0 ? urlDraft.trim() : null,
                          )
                          setEditingUrl(false)
                        }
                        if (event.key === 'Escape') setEditingUrl(false)
                      }}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className="prop-text prop-link"
                        onClick={() => {
                          setUrlDraft(url)
                          setEditingUrl(true)
                        }}
                        title={url}
                      >
                        {url.replace(/^https?:\/\//u, '')}
                      </button>
                      <button
                        type="button"
                        className="icon-button small"
                        aria-label={t('inspector.open')}
                        onClick={() => window.open(url, '_blank')}
                      >
                        <ExternalLink size={11} strokeWidth={1.8} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <div className="prop-row">
              <AlignLeft className="prop-icon" size={13} strokeWidth={1.7} />
              <span className="prop-label">{t('inspector.words')}</span>
              <div className="prop-value">
                <span className="prop-text">
                  {summary.wordCount.toLocaleString(locale)} ·{' '}
                  {t('editor.readingTime', { count: readingMinutes(summary.wordCount) })}
                </span>
              </div>
            </div>

            {summary.folder ? (
              <div className="prop-row">
                <Folder className="prop-icon" size={13} strokeWidth={1.7} />
                <span className="prop-label">{t('inspector.folder')}</span>
                <div className="prop-value">
                  <span className="prop-text">{summary.folder}</span>
                </div>
              </div>
            ) : null}

            {aliases.length > 0 ? (
              <div className="prop-row">
                <AtSign className="prop-icon" size={13} strokeWidth={1.7} />
                <span className="prop-label">{t('inspector.aliases')}</span>
                <div className="prop-value">
                  {aliases.map((alias) => (
                    <span key={alias} className="chip tone-neutral">
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {addingProperty ? (
              <div className="prop-row" style={{ gridTemplateColumns: '16px 76px minmax(0, 1fr)' }}>
                <Plus className="prop-icon" size={13} strokeWidth={1.7} />
                <input
                  autoFocus
                  className="inline-input"
                  placeholder="key"
                  value={propertyKey}
                  onChange={(event) => setPropertyKey(event.target.value)}
                />
                <input
                  className="inline-input"
                  placeholder="value"
                  value={propertyValue}
                  onChange={(event) => setPropertyValue(event.target.value)}
                  onBlur={() => {
                    if (propertyKey.trim().length > 0) {
                      void setProperty(propertyKey.trim(), propertyValue.trim())
                    }
                    setAddingProperty(false)
                    setPropertyKey('')
                    setPropertyValue('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && propertyKey.trim().length > 0) {
                      void setProperty(propertyKey.trim(), propertyValue.trim())
                      setAddingProperty(false)
                      setPropertyKey('')
                      setPropertyValue('')
                    }
                    if (event.key === 'Escape') setAddingProperty(false)
                  }}
                />
              </div>
            ) : (
              <button type="button" className="prop-add" onClick={() => setAddingProperty(true)}>
                <Plus size={11} strokeWidth={2} />
                {t('inspector.addProperty')}
              </button>
            )}
          </section>

          {summary && (outgoing.length > 0 || backlinks.length > 0) ? (
            <section className="insp-section">
              <div className="insp-section-head">
                <span>{t('inspector.localGraph')}</span>
                <span className="count">{outgoing.length + backlinks.length}</span>
              </div>
              <LocalGraph currentNote={summary} incoming={backlinks} outgoing={outgoing} />
            </section>
          ) : null}

          <section className="insp-section">
            <div className="insp-section-head">
              <span>{t('inspector.linksTo')}</span>
              <span className="count">{outgoing.length}</span>
            </div>
            {outgoing.length === 0 ? (
              <div className="rel-empty">{t('inspector.noLinks')}</div>
            ) : (
              outgoing.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="rel-row"
                  onClick={() => void selectNote(note.id)}
                >
                  <ArrowUpRight className="rel-icon" size={12} strokeWidth={1.9} />
                  <span className="rel-title">{note.title}</span>
                  <span className="rel-tag">{note.folder.split('/').pop() ?? ''}</span>
                </button>
              ))
            )}
          </section>

          <section className="insp-section">
            <div className="insp-section-head">
              <span>{t('inspector.linkedFrom')}</span>
              <span className="count">{backlinks.length}</span>
            </div>
            {backlinks.length === 0 ? (
              <div className="rel-empty">{t('inspector.noLinks')}</div>
            ) : (
              backlinks.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="rel-row"
                  onClick={() => void selectNote(note.id)}
                >
                  <ArrowDownLeft className="rel-icon" size={12} strokeWidth={1.9} />
                  <span className="rel-title">{note.title}</span>
                  <span className="rel-tag">{note.folder.split('/').pop() ?? ''}</span>
                </button>
              ))
            )}
          </section>

          <section className="insp-section">
            <div className="insp-section-head">
              <span>{t('inspector.outline')}</span>
              <span className="count">{headings.length}</span>
            </div>
            {headings.length === 0 ? (
              <div className="rel-empty">{t('inspector.noOutline')}</div>
            ) : (
              headings.map((heading, index) => (
                <button
                  key={`${heading.start}-${index}`}
                  type="button"
                  className={`outline-row level-${heading.level}`}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('monet:outline', { detail: heading.title }),
                    )
                  }
                >
                  <ListTree
                    size={11}
                    strokeWidth={1.8}
                    style={{ marginRight: 6, opacity: 0.45, flex: 'none' }}
                  />
                  <span className="outline-text">{heading.title}</span>
                </button>
              ))
            )}
          </section>
        </div>
      )}
    </aside>
  )
}
