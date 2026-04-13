declare const __ITERATOR_TOKEN__: string

export const DEFAULT_ITERATOR_API = 'https://heimdall-henna.vercel.app'

export function getApiBase(): string {
  return DEFAULT_ITERATOR_API
}

export function getPluginToken(): string {
  return typeof __ITERATOR_TOKEN__ !== 'undefined' ? __ITERATOR_TOKEN__ : ''
}
