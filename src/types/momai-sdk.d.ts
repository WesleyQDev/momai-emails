// src/types/momai-sdk.d.ts
declare module 'momai:sdk' {
  const sdk: {
    api: {
      get: (path: string, options?: any) => Promise<any>
      post: (path: string, body?: any, options?: any) => Promise<any>
      delete: (path: string, options?: any) => Promise<any>
    }
    registry: {
      registerRenderer: (type: string, component: any) => void
    }
    notifications: {
      send: (opts: { title: string; body?: string; action?: string }) => Promise<void>
    }
    badge: {
      set: (countOrOpts: any, extId?: string) => void
      clear: (extId?: string) => void
    }
    clipboard: {
      read: () => Promise<{
        ok: boolean
        type?: 'image' | 'text'
        dataUrl?: string
        text?: string
        error?: string
      }>
      writeImage: (dataUrl: string) => Promise<{ ok: boolean; error?: string }>
    }
    i18n?: {
      getLocale: () => string
      onLocaleChange: (callback: (locale: string) => void) => () => void
    }
    [key: string]: any
  }
  export default sdk
  export interface ContextMenuOption {
    id?: string
    label?: string
    shortcut?: string
    icon?: any
    onClick?: () => void
    danger?: boolean
    disabled?: boolean
    divider?: boolean
    children?: ContextMenuOption[]
  }
  export interface ContextMenuProps {
    x: number
    y: number
    items: ContextMenuOption[]
    onClose: () => void
    className?: string
    minWidth?: number
  }
  export const ContextMenu: (props: ContextMenuProps) => any
  export function useExtensionVisibility(explicitIsActive?: boolean, extensionId?: string): boolean
  export function useWarmup(onWarmup: () => Promise<void> | void, deps?: unknown[]): void
  export function useCachedState<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void]
  export function useShare(): { open: (payload: any) => Promise<any>; close: () => void; providers: any[] }
  export function useAutocomplete(options: any): any
  export const AutocompleteInput: any
  export const AutocompleteTextarea: any
  export const ScopedHistoryStore: any
}

declare module 'momai:events' {
  export function useExtensionEvents(options: {
    eventType?: string
    onEvent?: (event: any) => void
  }): {
    events: any[]
    latestEvent: any | null
    clearEvents: () => void
  }
}

declare global {
  interface Window {
    React: any
    ReactDOM: any
    JSXRuntime: any
    MomAISDK: any
    api?: any
  }
}

export {}
