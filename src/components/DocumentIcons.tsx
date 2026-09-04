// src/components/DocumentIcons.tsx
// Official, high-fidelity colored file type icons (PDF, Word, Excel, PowerPoint, Image, Archive, etc.)

import React from 'react'

interface IconProps {
  className?: string
  size?: number
}

/**
 * Official Adobe/Gmail PDF red document icon with sharp typography
 */
export const PdfFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Red document container with folded top-right corner */}
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z"
      fill="#EA4335"
    />
    {/* Folded corner darker shade */}
    <path d="M14 2V8H20L14 2Z" fill="#C5221F" />
    {/* White badge with bold PDF text */}
    <rect x="5.5" y="11" width="13" height="7.5" rx="1.5" fill="#FFFFFF" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="#EA4335"
      fontSize="5.2"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
      letterSpacing="-0.3"
    >
      PDF
    </text>
  </svg>
)

/**
 * Official Microsoft Word blue document icon with 'W'
 */
export const WordFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Blue document page */}
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z"
      fill="#185ABD"
    />
    {/* Folded corner */}
    <path d="M14 2V8H20L14 2Z" fill="#103F91" />
    {/* White Badge with W */}
    <rect x="5.5" y="11" width="13" height="7.5" rx="1.5" fill="#FFFFFF" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="#185ABD"
      fontSize="5.5"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
      letterSpacing="-0.2"
    >
      DOC
    </text>
  </svg>
)

/**
 * Official Microsoft Excel green document icon with 'X'
 */
export const ExcelFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Green document page */}
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z"
      fill="#107C41"
    />
    {/* Folded corner */}
    <path d="M14 2V8H20L14 2Z" fill="#0A5229" />
    {/* White Badge with XLS */}
    <rect x="5.5" y="11" width="13" height="7.5" rx="1.5" fill="#FFFFFF" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="#107C41"
      fontSize="5.2"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
      letterSpacing="-0.3"
    >
      XLS
    </text>
  </svg>
)

/**
 * Official Microsoft PowerPoint orange/red icon with 'P'
 */
export const PowerPointFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z"
      fill="#D83B01"
    />
    <path d="M14 2V8H20L14 2Z" fill="#A82A00" />
    <rect x="5.5" y="11" width="13" height="7.5" rx="1.5" fill="#FFFFFF" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="#D83B01"
      fontSize="5.2"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      PPT
    </text>
  </svg>
)

/**
 * Vibrant Image document icon
 */
export const ImageFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="3" fill="#8B5CF6" />
    <circle cx="8.5" cy="8.5" r="2" fill="#FBBF24" />
    <path d="M21 16L16 11L7 20H19C20.1046 20 21 19.1046 21 18V16Z" fill="#A78BFA" opacity="0.8" />
    <path d="M3 18L9 12L16 19H5C3.89543 19 3 18.1046 3 17V18Z" fill="#DDD6FE" />
  </svg>
)

/**
 * Archive zip/rar yellow file icon
 */
export const ArchiveFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z"
      fill="#F59E0B"
    />
    <path d="M14 2V8H20L14 2Z" fill="#D97706" />
    <rect x="5.5" y="11" width="13" height="7.5" rx="1.5" fill="#FFFFFF" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="#D97706"
      fontSize="5.2"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      ZIP
    </text>
  </svg>
)

/**
 * Text / Code file icon
 */
export const TextFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z"
      fill="#6B7280"
    />
    <path d="M14 2V8H20L14 2Z" fill="#4B5563" />
    <rect x="5.5" y="11" width="13" height="7.5" rx="1.5" fill="#FFFFFF" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="#4B5563"
      fontSize="5.2"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      TXT
    </text>
  </svg>
)

/**
 * General document icon
 */
export const GenericFileIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z"
      fill="#4F46E5"
    />
    <path d="M14 2V8H20L14 2Z" fill="#3730A3" />
    <rect x="5.5" y="11" width="13" height="7.5" rx="1.5" fill="#FFFFFF" />
    <text
      x="12"
      y="16.5"
      textAnchor="middle"
      fill="#4F46E5"
      fontSize="4.8"
      fontWeight="900"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      DOC
    </text>
  </svg>
)
