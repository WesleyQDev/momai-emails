// src/components/EmailAvatar.tsx
// Sender avatar supporting domain logos (Google Favicon 128px) and stylized initials fallback

import React, { useState } from 'react'

interface EmailAvatarProps {
  name?: string
  address?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// Consistent color generation based on sender string
function getAvatarColor(str: string): { bg: string; text: string } {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = [
    { bg: 'bg-accent/20', text: 'text-accent border-accent/40' },
    { bg: 'bg-input/80', text: 'text-text border-border' },
    { bg: 'bg-sidebar/80', text: 'text-text border-accent/30' },
    { bg: 'bg-card border', text: 'text-text-muted border-border' }
  ]
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

// Extract clean domain from email address
function extractDomain(address?: string): string | null {
  if (!address) return null
  const clean = address.trim().toLowerCase()
  const atIndex = clean.lastIndexOf('@')
  if (atIndex === -1) return null
  return clean.slice(atIndex + 1).replace(/>/g, '').trim()
}

export const EmailAvatar: React.FC<EmailAvatarProps> = ({
  name,
  address,
  size = 'md',
  className = ''
}) => {
  const [imageError, setImageError] = useState(false)

  const displayName = name?.trim() || address?.trim() || '?'
  const initial = displayName.charAt(0).toUpperCase()
  const domain = extractDomain(address)

  // Determine if domain is a known entity/company (Correios, Google, Gov, Bank, etc.)
  // or a general personal webmail provider
  const isPersonalWebmail =
    domain === 'gmail.com' ||
    domain === 'googlemail.com' ||
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'yahoo.com' ||
    domain === 'yahoo.com.br' ||
    domain === 'icloud.com'

  // If it's a domain like correios.com.br, amazon.com, etc., or even if it has a favicon
  const hasFaviconCandidate = Boolean(domain && !isPersonalWebmail)
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm'
  }[size]

  const colorStyle = getAvatarColor(displayName)

  if (hasFaviconCandidate && faviconUrl && !imageError) {
    return (
      <div
        className={`${sizeClasses} rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-card border border-border/80 shadow-xs ${className}`}
        title={`${displayName} (${address})`}
      >
        <img
          src={faviconUrl}
          alt={displayName}
          className="w-full h-full object-contain p-1 rounded-full"
          onError={() => setImageError(true)}
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div
      className={`${sizeClasses} rounded-full shrink-0 flex items-center justify-center font-bold border ${colorStyle.bg} ${colorStyle.text} select-none ${className}`}
      title={`${displayName} (${address})`}
    >
      {initial}
    </div>
  )
}
