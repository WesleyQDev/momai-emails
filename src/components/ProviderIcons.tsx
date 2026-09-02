// src/components/ProviderIcons.tsx
// High quality brand SVGs for Gmail, Outlook, Yahoo and Custom (Outros)

import React from 'react'

export const GmailIcon: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M44 24V9.5C44 7.01 41.99 5 39.5 5H36L24 14L12 5H8.5C6.01 5 4 7.01 4 9.5V24" fill="#EA4335" />
    <path d="M4 24V38.5C4 40.99 6.01 43 8.5 43H12V24L24 33L36 24V43H39.5C41.99 43 44 40.99 44 38.5V24L24 9L4 24Z" fill="#EA4335" />
    <path d="M4 9.5V38.5C4 40.99 6.01 43 8.5 43H12V24L4 18V9.5Z" fill="#4285F4" />
    <path d="M44 9.5V38.5C44 40.99 41.99 43 39.5 43H36V24L44 18V9.5Z" fill="#34A853" />
    <path d="M12 5H8.5C6.01 5 4 7.01 4 9.5V18L12 24V5Z" fill="#FBBC05" />
    <path d="M36 5H39.5C41.99 5 44 7.01 44 9.5V18L36 24V5Z" fill="#C5221F" />
    <path d="M36 24L24 15L12 24V43H36V24Z" fill="#F1F3F4" />
  </svg>
)

export const OutlookIcon: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="8" fill="#0078D4" />
    <path d="M26 12L40 16.5V31.5L26 36V12Z" fill="#28A8EA" />
    <path d="M26 12L12 16.5V31.5L26 36V12Z" fill="#0078D4" />
    <path d="M26 21L40 16.5V31.5L26 27V21Z" fill="#005A9E" opacity="0.4" />
    <circle cx="21" cy="24" r="8" fill="#004578" />
    <path
      d="M21 28C18.79 28 17 26.21 17 24C17 21.79 18.79 20 21 20C23.21 20 25 21.79 25 24C25 26.21 23.21 28 21 28ZM21 21.8C19.78 21.8 18.8 22.78 18.8 24C18.8 25.22 19.78 26.2 21 26.2C22.22 26.2 23.2 25.22 23.2 24C23.2 22.78 22.22 21.8 21 21.8Z"
      fill="#FFFFFF"
    />
  </svg>
)

export const YahooIcon: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="10" fill="#6001D2" />
    <path d="M12 16H36V32H12V16Z" fill="#FFFFFF" fillOpacity="0.15" />
    <path d="M14 18H34V30H14V18Z" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" fill="none" />
    <path d="M14 19L24 26L34 19" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <text x="24" y="41" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="800" letterSpacing="-0.5" fontFamily="sans-serif">
      yahoo!
    </text>
  </svg>
)

export const CustomMailIcon: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="8" width="36" height="24" rx="4" stroke="currentColor" strokeWidth="2.5" fill="none" />
    <path d="M6 10L24 24L42 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <text x="24" y="42" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="700" fontFamily="sans-serif">
      Outros
    </text>
  </svg>
)
