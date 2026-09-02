// src/components/ProviderIcons.tsx
// High quality brand SVGs for Gmail, Outlook, Yahoo and Custom (Outros)

import React from 'react'

export const GmailIcon: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 -31.5 256 256" className={className} version="1.1" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
    <g>
      <path d="M58.1818182,192.049515 L58.1818182,93.1404244 L27.5066233,65.0770089 L0,49.5040608 L0,174.59497 C0,184.253152 7.82545455,192.049515 17.4545455,192.049515 L58.1818182,192.049515 Z" fill="#4285F4" />
      <path d="M197.818182,192.049515 L238.545455,192.049515 C248.203636,192.049515 256,184.224061 256,174.59497 L256,49.5040608 L224.844415,67.3422767 L197.818182,93.1404244 L197.818182,192.049515 Z" fill="#34A853" />
      <polygon fill="#EA4335" points="58.1818182 93.1404244 54.0077618 54.4932827 58.1818182 17.5040608 128 69.8676972 197.818182 17.5040608 202.487488 52.4960089 197.818182 93.1404244 128 145.504061" />
      <path d="M197.818182,17.5040608 L197.818182,93.1404244 L256,49.5040608 L256,26.2313335 C256,4.64587897 231.36,-7.65957557 214.109091,5.28587897 L197.818182,17.5040608 Z" fill="#FBBC04" />
      <path d="M0,49.5040608 L26.7588051,69.5731646 L58.1818182,93.1404244 L58.1818182,17.5040608 L41.8909091,5.28587897 C24.6109091,-7.65957557 0,4.64587897 0,26.2313335 L0,49.5040608 Z" fill="#C5221F" />
    </g>
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
