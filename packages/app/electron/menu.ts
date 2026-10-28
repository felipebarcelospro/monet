import { Menu, app, type MenuItemConstructorOptions } from 'electron'

import type { Locale, MenuAction, Theme } from '../src/shared/contract'
import { translate } from '../src/shared/i18n'

/** The callbacks the menu needs from the application. */
export interface MenuActions {
  send: (action: MenuAction) => void
  setLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
}

/**
 * Builds the native menu.
 *
 * The menu is part of the interface, so it is translated with the same
 * catalogue as the window and rebuilt whenever the language changes.
 */
export function buildMenu(locale: Locale, theme: Theme, actions: MenuActions): Menu {
  const t = (key: Parameters<typeof translate>[1]): string => translate(locale, key)

  const appMenu: MenuItemConstructorOptions = {
    label: 'Monet',
    submenu: [
      { label: t('menu.about'), role: 'about' },
      { type: 'separator' },
      {
        label: t('menu.settings'),
        accelerator: 'CmdOrCtrl+,',
        click: () => actions.send('settings'),
      },
      { type: 'separator' },
      { label: t('menu.hide'), role: 'hide' },
      { label: t('menu.hideOthers'), role: 'hideOthers' },
      { label: t('menu.showAll'), role: 'unhide' },
      { type: 'separator' },
      { label: t('menu.quit'), role: 'quit' },
    ],
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: t('menu.file'),
    submenu: [
      {
        label: t('menu.newNote'),
        accelerator: 'CmdOrCtrl+N',
        click: () => actions.send('new-note'),
      },
      {
        label: t('palette.dailyNote'),
        accelerator: 'CmdOrCtrl+Shift+D',
        click: () => actions.send('daily-note'),
      },
      {
        label: t('menu.openVault'),
        accelerator: 'CmdOrCtrl+O',
        click: () => actions.send('open-vault'),
      },
      { type: 'separator' },
      {
        label: t('menu.closeTab'),
        accelerator: 'CmdOrCtrl+W',
        click: () => actions.send('close-tab'),
      },
      { label: t('menu.closeWindow'), role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
    ],
  }

  const editMenu: MenuItemConstructorOptions = {
    label: t('menu.edit'),
    submenu: [
      { label: t('menu.undo'), role: 'undo' },
      { label: t('menu.redo'), role: 'redo' },
      { type: 'separator' },
      { label: t('menu.cut'), role: 'cut' },
      { label: t('menu.copy'), role: 'copy' },
      { label: t('menu.paste'), role: 'paste' },
      { label: t('menu.selectAll'), role: 'selectAll' },
    ],
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: t('menu.view'),
    submenu: [
      {
        label: t('menu.commandPalette'),
        accelerator: 'CmdOrCtrl+K',
        click: () => actions.send('command-palette'),
      },
      {
        label: t('menu.quickSwitcher'),
        accelerator: 'CmdOrCtrl+P',
        click: () => actions.send('quick-switcher'),
      },
      {
        label: t('menu.search'),
        accelerator: 'CmdOrCtrl+Shift+F',
        click: () => actions.send('search'),
      },
      { type: 'separator' },
      {
        label: t('menu.toggleSidebar'),
        accelerator: 'CmdOrCtrl+1',
        click: () => actions.send('toggle-sidebar'),
      },
      {
        label: t('menu.toggleInspector'),
        accelerator: 'CmdOrCtrl+2',
        click: () => actions.send('toggle-inspector'),
      },
      {
        label: t('menu.reading'),
        accelerator: 'CmdOrCtrl+E',
        click: () => actions.send('toggle-reading'),
      },
      {
        label: t('menu.graph'),
        accelerator: 'CmdOrCtrl+G',
        click: () => actions.send('toggle-graph'),
      },
      { type: 'separator' },
      {
        label: t('menu.language'),
        submenu: [
          {
            label: 'English',
            type: 'radio',
            checked: locale === 'en',
            click: () => actions.setLocale('en'),
          },
          {
            label: 'Português (Brasil)',
            type: 'radio',
            checked: locale === 'pt-BR',
            click: () => actions.setLocale('pt-BR'),
          },
          {
            label: 'Español',
            type: 'radio',
            checked: locale === 'es',
            click: () => actions.setLocale('es'),
          },
        ],
      },
      {
        label: t('settings.appearance'),
        submenu: [
          {
            label: t('settings.theme.system'),
            type: 'radio',
            checked: theme === 'system',
            click: () => actions.setTheme('system'),
          },
          {
            label: t('settings.theme.light'),
            type: 'radio',
            checked: theme === 'light',
            click: () => actions.setTheme('light'),
          },
          {
            label: t('settings.theme.dark'),
            type: 'radio',
            checked: theme === 'dark',
            click: () => actions.setTheme('dark'),
          },
        ],
      },
    ],
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: t('menu.window'),
    role: 'window',
    submenu: [
      { label: t('menu.minimize'), role: 'minimize' },
      { label: t('menu.zoom'), role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
    ],
  }

  const template: MenuItemConstructorOptions[] = [appMenu, fileMenu, editMenu, viewMenu, windowMenu]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  return menu
}

/** The app name shown by macOS. */
export function appName(): string {
  return app.getName()
}
