// src/components/EmailAvatar.tsx
// Sender avatar with authentic Gmail Material colors and domain logo resolution (Correios, Google, etc.)

import React, { useState } from 'react'

interface EmailAvatarProps {
  name?: string
  address?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}
// Authentic Gmail Material color palette per letter (exact match with Gmail mobile & web)
const GMAIL_PALETTE: Record<string, string> = {
  A: '#1A73E8', // Blue
  B: '#0288D1', // Cyan
  C: '#E8710A', // Orange (exact Indeed / Candidate-se in Gmail)
  D: '#7B1FA2', // Purple
  E: '#D93025', // Red
  F: '#C2185B', // Deep Pink
  G: '#1E8E3E', // Green
  H: '#F29900', // Amber
  I: '#00897B', // Teal
  J: '#8E24AA', // Violet
  K: '#5C6BC0', // Indigo
  L: '#0288D1', // Light Blue
  M: '#F9AB00', // Yellow / Gold (exact "eu, Mail" in Gmail)
  N: '#00897B', // Teal (exact "noreply" in Gmail)
  O: '#E8710A', // Orange
  P: '#C2185B', // Pink
  Q: '#7B1FA2', // Purple
  R: '#D93025', // Red
  S: '#1A73E8', // Blue
  T: '#1E8E3E', // Green
  U: '#F29900', // Amber
  V: '#00897B', // Teal
  W: '#5C6BC0', // Indigo
  X: '#8E24AA', // Violet
  Y: '#F9AB00', // Gold
  Z: '#E8710A'  // Orange
}

// Extract domain from address
function extractDomain(address?: string): string | null {
  if (!address) return null
  const clean = address.trim().toLowerCase()
  const atIndex = clean.lastIndexOf('@')
  if (atIndex === -1) return null
  return clean.slice(atIndex + 1).replace(/>/g, '').trim()
}

// Detect if sender is a known company or service
function detectCompanyDomain(name?: string, address?: string): string | null {
  const n = (name || '').toLowerCase()
  const a = (address || '').toLowerCase()
  const domain = extractDomain(address)

  if (n.includes('correios') || a.includes('correios')) {
    return 'correios.com.br'
  }
  if (n.includes('computrabajo') || a.includes('computrabajo')) {
    return 'computrabajo.com'
  }
  if (n.includes('indeed') || a.includes('indeed')) {
    return 'indeed.com'
  }
  if (n.includes('nubank') || a.includes('nubank')) {
    return 'nubank.com.br'
  }
  if (n.includes('facebook') || a.includes('facebook')) {
    return 'facebook.com'
  }
  if (n.includes('instagram') || a.includes('instagram')) {
    return 'instagram.com'
  }
  if (n.includes('github') || a.includes('github')) {
    return 'github.com'
  }
  if (n.includes('google') || a.includes('google')) {
    return 'google.com'
  }

  // If domain is not a generic personal webmail, try fetching domain favicon
  if (
    domain &&
    domain !== 'gmail.com' &&
    domain !== 'googlemail.com' &&
    domain !== 'outlook.com' &&
    domain !== 'hotmail.com' &&
    domain !== 'live.com' &&
    domain !== 'yahoo.com' &&
    domain !== 'yahoo.com.br' &&
    domain !== 'icloud.com'
  ) {
    return domain
  }

  return null
}

// Session cache of domains to prevent pop-in / re-flicker on rerenders and tab switches
const loadedDomains = new Set<string>()
const failedDomains = new Set<string>()

export const EmailAvatar: React.FC<EmailAvatarProps> = ({
  name,
  address,
  size = 'md',
  className = ''
}) => {
  const displayName = name?.trim() || address?.trim() || '?'
  const initial = displayName.charAt(0).toUpperCase()
  const companyDomain = detectCompanyDomain(name, address)

  const isFailed = companyDomain ? failedDomains.has(companyDomain) : false
  const [imageError, setImageError] = useState(isFailed)
  const isAlreadyLoaded = Boolean(companyDomain && loadedDomains.has(companyDomain))
  const [imageLoaded, setImageLoaded] = useState(isAlreadyLoaded)

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm'
  }[size]

  // Exact Gmail Material solid color circle with white bold letter
  const bgColor = GMAIL_PALETTE[initial] || '#1A73E8'

  // If company logo is detected and hasn't failed to load
  if (companyDomain && !imageError) {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${companyDomain}&sz=128`
    return (
      <div
        className={`${sizeClasses} relative rounded-full overflow-hidden shrink-0 flex items-center justify-center shadow-xs select-none ${className}`}
        style={{ backgroundColor: imageLoaded ? undefined : bgColor }}
        title={`${displayName} (${address || ''})`}
      >
        {/* Instant fallback letter visible immediately while image is downloading/decoding */}
        {!imageLoaded && (
          <span className="font-bold text-white leading-none">{initial}</span>
        )}
        <img
          src={faviconUrl}
          alt={displayName}
          className={`absolute inset-0 w-full h-full object-contain p-0.5 rounded-full bg-card border border-border transition-opacity duration-200 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="eager"
          decoding="async"
          onLoad={() => {
            loadedDomains.add(companyDomain)
            setImageLoaded(true)
          }}
          onError={() => {
            failedDomains.add(companyDomain)
            setImageError(true)
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`${sizeClasses} rounded-full shrink-0 flex items-center justify-center font-bold text-white select-none shadow-xs ${className}`}
      style={{ backgroundColor: bgColor }}
      title={`${displayName} (${address || ''})`}
    >
      <span>{initial}</span>
    </div>
  )
}
