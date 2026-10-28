import { useT } from '../hooks/useT'
import { folderName } from '../lib/notes'
import { useStore } from '../state/store'
import { ConfirmDialog, PromptDialog } from './Dialog'

/** The dialog that is currently asking the user something, if any. */
export function Dialogs(): React.JSX.Element | null {
  const t = useT()
  const dialog = useStore((state) => state.dialog)
  const document = useStore((state) => state.document)
  const close = useStore((state) => state.closeDialog)
  const renameNote = useStore((state) => state.renameNote)
  const deleteNote = useStore((state) => state.deleteNote)
  const renameFolder = useStore((state) => state.renameFolder)

  if (!dialog) return null

  switch (dialog.kind) {
    case 'rename-note':
      if (!document) return null
      return (
        <PromptDialog
          title={t('editor.renameTitle')}
          initialValue={document.title}
          confirmLabel={t('common.rename')}
          onCancel={close}
          onConfirm={(value) => {
            close()
            void renameNote(value)
          }}
        />
      )
    case 'delete-note':
      if (!document) return null
      return (
        <ConfirmDialog
          title={t('editor.deleteTitle', { title: document.title })}
          body={t('editor.deleteBody')}
          confirmLabel={t('common.delete')}
          onCancel={close}
          onConfirm={() => {
            close()
            void deleteNote()
          }}
        />
      )
    case 'rename-folder':
      return (
        <PromptDialog
          title={t('folder.renameTitle')}
          initialValue={folderName(dialog.path)}
          confirmLabel={t('common.rename')}
          onCancel={close}
          onConfirm={(value) => {
            close()
            void renameFolder(dialog.path, value)
          }}
        />
      )
  }
}
