// The slice of the File System Access API the backup uses that TypeScript's DOM lib lacks
// (probed with tsc 7.0.2: showSaveFilePicker, SaveFilePickerOptions, queryPermission and
// requestPermission are missing; createWritable/getFile/name are already declared).
// Global script on purpose: no imports or exports.
interface SaveFilePickerOptions {
  suggestedName?: string
  excludeAcceptAllOption?: boolean
  types?: { description?: string; accept: Record<string, string[]> }[]
}

interface FileSystemHandlePermissionDescriptor {
  mode: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}
