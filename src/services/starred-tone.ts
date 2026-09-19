// src/services/starred-tone.ts
// Theme-token class for the favorited star state (yellow in every app theme).

export const STARRED_TONE_CLASS = 'text-highlight'

export function starredToneClass(starred: boolean): string {
  return starred ? STARRED_TONE_CLASS : ''
}
