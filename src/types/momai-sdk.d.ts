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
