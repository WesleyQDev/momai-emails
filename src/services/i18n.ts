// src/services/i18n.ts
// Internationalization and translations for folder names and UI labels

export const FOLDER_TRANSLATIONS: Record<string, string> = {
  inbox: 'Caixa de Entrada',
  'all mail': 'Todos os E-mails',
  all: 'Todos os E-mails',
  'todos os e-mails': 'Todos os E-mails',
  drafts: 'Rascunhos',
  draft: 'Rascunhos',
  rascunhos: 'Rascunhos',
  important: 'Importantes',
  importantes: 'Importantes',
  'sent mail': 'Enviados',
  sent: 'Enviados',
  'sent messages': 'Enviados',
  enviados: 'Enviados',
  'itens enviados': 'Enviados',
  spam: 'Spam',
  junk: 'Spam',
  'lixo eletrônico': 'Spam',
  starred: 'Com Estrela',
  'com estrela': 'Com Estrela',
  trash: 'Lixeira',
  bin: 'Lixeira',
  'deleted items': 'Lixeira',
  'itens excluídos': 'Lixeira',
  lixeira: 'Lixeira',
  archive: 'Arquivo',
  arquivo: 'Arquivo'
}

export const CATEGORY_TRANSLATIONS: Record<string, { label: string; description: string }> = {
  primary: {
    label: 'Principal',
    description: 'Conversas pessoais e e-mails diretos'
  },
  promotions: {
    label: 'Promoções',
    description: 'Ofertas, novidades e e-mails de marketing'
  },
  social: {
    label: 'Social',
    description: 'Mensagens de redes sociais e mídias'
  },
  updates: {
    label: 'Atualizações',
    description: 'Notificações, confirmações e recibos'
  }
}

/**
 * Format folder name for user-facing UI in pt-BR
 */
export function formatFolderName(name: string, role?: string): string {
  if (!name) return ''
  const cleanName = name.replace(/^\[Gmail\]\/?/i, '').trim()
  const lower = cleanName.toLowerCase()

  if (FOLDER_TRANSLATIONS[lower]) {
    return FOLDER_TRANSLATIONS[lower]
  }

  if (role) {
    const roleLower = role.toLowerCase()
    switch (roleLower) {
      case 'inbox':
        return 'Caixa de Entrada'
      case 'all':
      case 'allmail':
        return 'Todos os E-mails'
      case 'drafts':
        return 'Rascunhos'
      case 'important':
        return 'Importantes'
      case 'sent':
        return 'Enviados'
      case 'junk':
      case 'spam':
        return 'Spam'
      case 'starred':
        return 'Com Estrela'
      case 'trash':
        return 'Lixeira'
      case 'archive':
        return 'Arquivo'
    }
  }

  return cleanName
}
