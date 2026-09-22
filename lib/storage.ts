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
export async function deleteSignedDeliveryNote(orderId: string, url?: string): Promise<void> {
  // The stored link points at the exact file, whatever its name.
  if (url) {
    try { await deleteObject(ref(storage, url)); return } catch { /* fall back to the usual names */ }
  }
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
/**
 * Upload any file against a project, under projects/{projectId}/.
 *
 * The name is prefixed with the upload time so two files called "brief.pdf"
 * sit side by side instead of the second silently replacing the first.
 */
export async function uploadProjectFile(
  projectId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ url: string; path: string }> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120)
  const path = `projects/${projectId}/${Date.now()}-${safe}`
  const storageRef = ref(storage, path)

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
      contentDisposition: `inline; filename="${safe}"`,
    })
    task.on(
      'state_changed',
      (snapshot) => onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      (error) => reject(error),
      async () => resolve({ url: await getDownloadURL(task.snapshot.ref), path })
    )
  })
}

/** Remove a stored file. Already gone counts as done. */
export async function deleteStoredFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path))
  } catch (e) {
    if ((e as { code?: string })?.code !== 'storage/object-not-found') throw e
  }
}
