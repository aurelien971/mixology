import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface CompanySettings {
  supplierName:    string
  supplierAddress: string
  supplierPhone:   string
  supplierEmail:   string
  vatNumber:       string
  bankAccountName: string
  bankSortCode:    string
  bankAccountNumber: string
  bankReference:   string  // default reference note e.g. "Please quote invoice number"
  updatedAt?: Date
}

export const DEFAULT_SETTINGS: CompanySettings = {
  supplierName:      'Foodlab Cocktails',
  supplierAddress:   'London, UK',
  supplierPhone:     '',
  supplierEmail:     '',
  vatNumber:         '',
  bankAccountName:   '',
  bankSortCode:      '',
  bankAccountNumber: '',
  bankReference:     'Please quote invoice number as reference',
}

const DOC_REF = () => doc(db, 'settings', 'company')

export async function getCompanySettings(): Promise<CompanySettings> {
  const snap = await getDoc(DOC_REF())
  if (!snap.exists()) return { ...DEFAULT_SETTINGS }
  const data = snap.data() as CompanySettings & { updatedAt?: Timestamp }
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    updatedAt: data.updatedAt?.toDate(),
  }
}

export async function saveCompanySettings(
  settings: Omit<CompanySettings, 'updatedAt'>
): Promise<void> {
  await setDoc(DOC_REF(), {
    ...settings,
    updatedAt: Timestamp.now(),
  })
}