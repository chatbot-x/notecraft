/**
 * Shared image upload handler — converts a File to a data URL for localStorage.
 * Used by the editor, slash commands, and toolbar.
 */
export function imageDataUrlHandler({ file, callback }: {
  id: string
  file: File
  callback: {
    progress: (n: number) => void
    fail: (e: Error) => void
    success: (u: string) => void
  }
}) {
  const reader = new FileReader()

  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      callback.progress(Math.round((e.loaded / e.total) * 100))
    }
  }

  reader.onload = () => {
    callback.success(reader.result as string)
  }

  reader.onerror = () => {
    callback.fail(new Error('Failed to read file'))
  }

  reader.readAsDataURL(file)
}
