import { describe, expect, it, vi } from 'vitest'
import { backup, backupSupported, pickWith } from '../../src/backup/fileBackup'
import type { BackupHandle } from '../../src/backup/controller'
import { emptyState } from '../../src/store/storage'
import { signal } from '@preact/signals'

const fakeHandle = { name: 'f.json' } as unknown as BackupHandle

describe('fileBackup in node', () => {
  it('backupSupported is false in node', () => {
    expect(backupSupported).toBe(false)
  })

  it('backup.status is unsupported in node; init/choose/resume/stop/flush resolve without throwing', async () => {
    expect(backup.status.value).toEqual({ kind: 'unsupported' })
    await expect(backup.init(signal(emptyState()))).resolves.toBeUndefined()
    await expect(backup.choose()).resolves.toBeUndefined()
    await expect(backup.resume()).resolves.toBeUndefined()
    await expect(backup.stop()).resolves.toBeUndefined()
    await expect(backup.flush()).resolves.toBeUndefined()
  })
})

describe('pickWith', () => {
  it("resolves the handle the picker returns, and passes suggestedName 'piano-practice-backup.json'", async () => {
    const show = vi.fn().mockResolvedValue(fakeHandle)
    await expect(pickWith(show)()).resolves.toBe(fakeHandle)
    expect(show).toHaveBeenCalledWith({
      suggestedName: 'piano-practice-backup.json',
      types: [{ description: 'Piano Practice backup', accept: { 'application/json': ['.json'] } }],
    })
  })

  it('an AbortError → null', async () => {
    const err = Object.assign(new Error('closed'), { name: 'AbortError' })
    await expect(pickWith(() => Promise.reject(err))()).resolves.toBeNull()
  })

  it('any other error rethrows', async () => {
    const err = new Error('boom')
    await expect(pickWith(() => Promise.reject(err))()).rejects.toBe(err)
  })
})
