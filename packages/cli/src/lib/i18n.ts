/**
 * Localisation for the Monet CLI.
 *
 * The CLI ships the same three locales as the app: English, Brazilian
 * Portuguese and Spanish. Messages are looked up by key, and the locale is
 * resolved from the `--locale` flag, the `MONET_LOCALE` environment variable
 * or the system locale, in that order.
 */

/** The locales the CLI ships. */
export const LOCALES = ['en', 'pt-BR', 'es'] as const

/** A supported locale. */
export type Locale = (typeof LOCALES)[number]

/** The locale used when nothing else is specified. */
export const DEFAULT_LOCALE: Locale = 'en'

const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    'error.vaultNotFound': 'Vault not found: {path}',
    'error.noteNotFound': 'Note not found: {path}',
    'error.noteExists': 'A note already exists at: {path}',
    'error.invalidTarget': 'Invalid link target: {target}',
    'error.linkExists': 'The link already exists in this note.',
    'error.linkMissing': 'No link with the target "{target}" was found.',
    'error.appRunning':
      'The Monet app is already running with this vault open (pid {pid}). Saving from the CLI may conflict with the app.',
    'error.missingVault': 'No vault configured. Run `monet config set --vault <path>` first.',
    'error.invalidFrontmatter': 'The note has malformed frontmatter: {reason}',
    'help.vault': 'Path to the vault folder',
    'help.locale': 'Locale for messages (en, pt-BR, es)',
    'note.created': 'Created note: {path}',
    'note.moved': 'Moved note to: {path}',
    'note.deleted': 'Deleted note: {path}',
    'note.updated': 'Updated note: {path}',
    'link.created': 'Linked to {target}',
    'skill.installed': 'Installed the Monet skill for {agents}',
    'skill.noneFound': 'No supported agents were detected.',
  },
  'pt-BR': {
    'error.vaultNotFound': 'Cofre não encontrado: {path}',
    'error.noteNotFound': 'Nota não encontrada: {path}',
    'error.noteExists': 'Já existe uma nota em: {path}',
    'error.invalidTarget': 'Destino de link inválido: {target}',
    'error.linkExists': 'O link já existe nesta nota.',
    'error.linkMissing': 'Nenhum link com o destino "{target}" foi encontrado.',
    'error.appRunning':
      'O app Monet já está rodando com este cofre aberto (pid {pid}). Salvar pela CLI pode conflitar com o app.',
    'error.missingVault': 'Nenhum cofre configurado. Rode `monet config set --vault <caminho>` primeiro.',
    'error.invalidFrontmatter': 'A nota tem frontmatter inválido: {reason}',
    'help.vault': 'Caminho para a pasta do cofre',
    'help.locale': 'Idioma das mensagens (en, pt-BR, es)',
    'note.created': 'Nota criada: {path}',
    'note.moved': 'Nota movida para: {path}',
    'note.deleted': 'Nota excluída: {path}',
    'note.updated': 'Nota atualizada: {path}',
    'link.created': 'Link criado para {target}',
    'skill.installed': 'Skill do Monet instalada para {agents}',
    'skill.noneFound': 'Nenhum agente compatível foi encontrado.',
  },
  es: {
    'error.vaultNotFound': 'Bóveda no encontrada: {path}',
    'error.noteNotFound': 'Nota no encontrada: {path}',
    'error.noteExists': 'Ya existe una nota en: {path}',
    'error.invalidTarget': 'Destino de enlace inválido: {target}',
    'error.linkExists': 'El enlace ya existe en esta nota.',
    'error.linkMissing': 'No se encontró ningún enlace con el destino "{target}".',
    'error.appRunning':
      'La app Monet ya está en ejecución con esta bóveda abierta (pid {pid}). Guardar desde la CLI puede entrar en conflicto con la app.',
    'error.missingVault': 'No hay bóveda configurada. Ejecuta `monet config set --vault <ruta>` primero.',
    'error.invalidFrontmatter': 'La nota tiene un frontmatter inválido: {reason}',
    'help.vault': 'Ruta de la carpeta de la bóveda',
    'help.locale': 'Idioma de los mensajes (en, pt-BR, es)',
    'note.created': 'Nota creada: {path}',
    'note.moved': 'Nota movida a: {path}',
    'note.deleted': 'Nota eliminada: {path}',
    'note.updated': 'Nota actualizada: {path}',
    'link.created': 'Enlace creado a {target}',
    'skill.installed': 'Skill de Monet instalada para {agents}',
    'skill.noneFound': 'No se encontró ningún agente compatible.',
  },
}

/**
 * Resolves the locale to use.
 *
 * The order is: the explicit argument, the `MONET_LOCALE` environment
 * variable, the system locale, then the default.
 */
export function resolveLocale(explicit?: string): Locale {
  const candidates = [explicit, process.env['MONET_LOCALE'], process.env['LANG']]
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = candidate.replace('_', '-')
    const exact = LOCALES.find((locale) => locale.toLowerCase() === normalized.toLowerCase())
    if (exact) return exact
    const base = normalized.split('-')[0]?.toLowerCase()
    const partial = LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === base)
    if (partial) return partial
  }
  return DEFAULT_LOCALE
}

/**
 * A message catalogue bound to a locale.
 */
export class Messages {
  /** The locale of the catalogue. */
  readonly locale: Locale

  constructor(locale: Locale = resolveLocale()) {
    this.locale = locale
  }

  /**
   * Looks up a message and substitutes `{placeholder}` tokens.
   */
  get(key: string, values: Record<string, string | number> = {}): string {
    const catalogue = MESSAGES[this.locale] ?? MESSAGES[DEFAULT_LOCALE]
    const fallback = MESSAGES[DEFAULT_LOCALE] ?? {}
    let message = catalogue[key] ?? fallback[key] ?? key
    for (const [name, value] of Object.entries(values)) {
      message = message.replaceAll(`{${name}}`, String(value))
    }
    return message
  }
}
