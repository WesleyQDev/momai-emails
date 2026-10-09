import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRightIcon } from '@heroicons/react/24/outline'

export interface ContextMenuOption {
  id?: string
  label?: string
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode
  shortcut?: string
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

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
  className = '',
  minWidth = 190
}: ContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: y, left: x })
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const scheduleCloseSubmenu = () => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      setActiveSubmenuId(null)
    }, 250)
  }

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const padding = 12

    let adjustedX = x
    let adjustedY = y

    if (adjustedX + rect.width + minWidth > window.innerWidth - padding) {
      adjustedX = Math.max(padding, window.innerWidth - rect.width - minWidth - padding)
    }

    if (adjustedY + rect.height > window.innerHeight - padding) {
      adjustedY = Math.max(padding, window.innerHeight - rect.height - padding)
    }

    setPos({ top: adjustedY, left: adjustedX })
  }, [x, y, items.length, minWidth])

  useEffect(() => {
    let active = true

    const handleClickOutside = (event: MouseEvent) => {
      if (!active) return
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const timer = setTimeout(() => {
      if (!active) return
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 50)

    return () => {
      active = false
      clearTimeout(timer)
      clearCloseTimer()
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!items || items.length === 0) return null

  const renderIcon = (icon?: React.ComponentType<{ className?: string }> | React.ReactNode, danger?: boolean) => {
    if (!icon) return null
    if (React.isValidElement(icon)) {
      return <span className={`shrink-0 w-4 h-4 flex items-center justify-center ${danger ? 'text-error' : 'text-text-muted'}`}>{icon}</span>
    }
    const IconComp = icon as React.ComponentType<{ className?: string }>
    return <IconComp className={`w-4 h-4 shrink-0 ${danger ? 'text-error' : 'text-text-muted group-hover:text-text'}`} />
  }

  const content = (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      className={`fixed z-[9999] bg-card border border-border/80 rounded-xl shadow-2xl p-1 select-none animate-in fade-in zoom-in-95 duration-100 ${className}`}
      style={{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        minWidth: `${minWidth}px`,
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="flex flex-col gap-0.5">
        {items.map((item, idx) => {
          const itemId = item.id || `item-${idx}`

          if (item.divider) {
            return <div key={itemId} className="my-1 border-t border-border/60" />
          }

          if (item.disabled) {
            return (
              <div
                key={itemId}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-text-muted/40 cursor-not-allowed rounded-lg select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {renderIcon(item.icon, item.danger)}
                  <span className="truncate">{item.label}</span>
                </div>
                {item.shortcut && (
                  <span className="text-[10px] text-text-muted/30 font-mono tracking-wider shrink-0 ml-2">
                    {item.shortcut}
                  </span>
                )}
              </div>
            )
          }

          const hasChildren = Boolean(item.children && item.children.length > 0)
          const isSubmenuOpen = activeSubmenuId === itemId

          const openSubmenu = () => {
            clearCloseTimer()
            if (hasChildren) {
              setActiveSubmenuId(itemId)
            } else {
              setActiveSubmenuId(null)
            }
          }

          return (
            <div
              key={itemId}
              onMouseEnter={openSubmenu}
              onMouseLeave={() => {
                if (hasChildren) {
                  scheduleCloseSubmenu()
                }
              }}
              className="relative"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (hasChildren) {
                    if (isSubmenuOpen) {
                      setActiveSubmenuId(null)
                    } else {
                      openSubmenu()
                    }
                  } else if (item.onClick) {
                    item.onClick()
                    onClose()
                  }
                }}
                className={`flex items-center justify-between gap-3 px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer text-left w-full group focus:outline-none ${
                  isSubmenuOpen ? 'bg-input text-text' : 'text-text hover:bg-input/80 hover:text-text'
                } ${item.danger ? 'text-error hover:bg-error/15 focus:bg-error/15' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {renderIcon(item.icon, item.danger)}
                  <span className="truncate">{item.label}</span>
                </div>
                {hasChildren ? (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-text-muted shrink-0 ml-2 group-hover:text-text" />
                ) : item.shortcut ? (
                  <span className="text-[10px] text-text-muted/60 group-hover:text-text font-mono tracking-wider shrink-0 ml-2">
                    {item.shortcut}
                  </span>
                ) : null}
              </button>

              {/* Directly anchored submenu to the RIGHT */}
              {hasChildren && isSubmenuOpen && (
                <div
                  role="menu"
                  aria-orientation="vertical"
                  onMouseEnter={clearCloseTimer}
                  onMouseLeave={scheduleCloseSubmenu}
                  className="absolute z-[10000] border border-border rounded-xl shadow-2xl p-1 select-none animate-fade-in before:absolute before:-left-3 before:top-0 before:bottom-0 before:w-4 before:content-['']"
                  style={{
                    position: 'absolute',
                    left: '100%',
                    marginLeft: '4px',
                    top: '-4px',
                    minWidth: `${minWidth}px`,
                    backgroundColor: 'rgb(var(--bg-card))',
                    WebkitAppRegion: 'no-drag'
                  } as React.CSSProperties}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col gap-0.5">
                    {item.children!.map((child, cIdx) => (
                      <button
                        key={child.id || cIdx}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          if (child.onClick) {
                            child.onClick()
                            onClose()
                          }
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs text-text hover:bg-input hover:text-text rounded-lg transition-colors cursor-pointer text-left w-full group focus:outline-none focus:bg-input"
                      >
                        {child.icon && (
                          <span className="shrink-0 w-4 h-4 flex items-center justify-center text-text-muted group-hover:text-text">
                            {React.isValidElement(child.icon)
                              ? child.icon
                              : React.createElement(child.icon as React.ComponentType<{ className?: string }>, { className: 'w-4 h-4' })}
                          </span>
                        )}
                        <span className="truncate">{child.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
}
