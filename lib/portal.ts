import { updateAccount } from '@/lib/firestore/accounts'
import { Account } from '@/types'

// Unambiguous charset — no 0/O, 1/l/I
const TOKEN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const TOKEN_LENGTH = 24

export function generatePortalToken(): string {
  const bytes = new Uint32Array(TOKEN_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => TOKEN_CHARS[b % TOKEN_CHARS.length]).join('')
}

export function portalUrl(token: string): string {
  return `${window.location.origin}/portal/${token}`
}

// Returns the account's portal token, creating and persisting one if missing.
export async function ensurePortalToken(account: Account): Promise<string> {
  if (account.clientToken) return account.clientToken
  const token = generatePortalToken()
  await updateAccount(account.id, { clientToken: token })
  return token
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for contexts where the async clipboard API is unavailable
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

export async function copyPortalLink(account: Account): Promise<string> {
  const token = await ensurePortalToken(account)
  await copyText(portalUrl(token))
  return token
}
