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
    [key: string]: any
  }
  export default sdk
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
