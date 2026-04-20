import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '@/lib/firebase'

export interface UploadProgress {
  progress: number   // 0–100
  url?: string
  error?: string
}

/**
 * Uploads a signed delivery note to Firebase Storage under
 * orders/{orderId}/signed-delivery-note/{filename}
 * and returns the public download URL.
 */
export async function uploadSignedDeliveryNote(
  orderId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  const ext      = file.name.split('.').pop() ?? 'pdf'
  const path     = `orders/${orderId}/signed-delivery-note/signed-dn.${ext}`
  const storageRef = ref(storage, path)

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/pdf',
    })

    task.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        onProgress?.(pct)
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        resolve(url)
      }
    )
  })
}

/**
 * Deletes the signed delivery note from Storage.
 */
export async function deleteSignedDeliveryNote(orderId: string): Promise<void> {
  // Try both pdf and common image extensions
  const extensions = ['pdf', 'jpg', 'jpeg', 'png']
  for (const ext of extensions) {
    try {
      const path = `orders/${orderId}/signed-delivery-note/signed-dn.${ext}`
      await deleteObject(ref(storage, path))
      return
    } catch {
      // Not found with this extension — try next
    }
  }
}