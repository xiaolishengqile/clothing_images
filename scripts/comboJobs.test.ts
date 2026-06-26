import assert from 'node:assert/strict'
import { rebuildComboJobsPreservingResults, type ComboImageItem, type ComboJob } from '../src/lib/comboJobs.ts'

function file(name: string): File {
  return new File(['x'], name, { type: 'image/png' })
}

function item(id: string, name: string): ComboImageItem {
  return {
    id,
    file: file(name),
    previewObjectUrl: `blob:${id}`,
  }
}

const modelA = item('model-a', 'model A.png')
const modelB = item('model-b', 'model B.png')
const sceneA = item('scene-a', 'scene A.png')
const clothA = item('cloth-a', 'cloth A.png')

const existing: ComboJob[] = [
  {
    id: 'existing-a',
    file: clothA.file,
    previewObjectUrl: clothA.previewObjectUrl,
    status: 'done',
    addedSeq: 7,
    resultDataUrl: 'data:image/png;base64,done-a',
    comboModelFile: modelA.file,
    comboSceneFile: sceneA.file,
    comboModelId: modelA.id,
    comboSceneId: sceneA.id,
    comboClothingId: clothA.id,
    comboModelLabel: 'model A',
    comboSceneLabel: 'scene A',
    comboClothingLabel: 'cloth A',
    comboModelPreviewUrl: modelA.previewObjectUrl,
    comboScenePreviewUrl: sceneA.previewObjectUrl,
  },
]

let seq = 8
const rebuilt = rebuildComboJobsPreservingResults({
  previousJobs: existing,
  models: [modelA, modelB],
  scenes: [sceneA],
  clothes: [clothA],
  nextId: () => `new-${seq}`,
  nextSeq: () => seq++,
})

assert.equal(rebuilt.length, 2)
assert.equal(rebuilt[0]?.id, 'existing-a')
assert.equal(rebuilt[0]?.resultDataUrl, 'data:image/png;base64,done-a')
assert.equal(rebuilt[0]?.status, 'done')
assert.equal(rebuilt[1]?.comboModelId, 'model-b')
assert.equal(rebuilt[1]?.status, 'queued')

const afterSourceRemoval = rebuildComboJobsPreservingResults({
  previousJobs: rebuilt,
  models: [modelB],
  scenes: [sceneA],
  clothes: [clothA],
  nextId: () => `new-${seq}`,
  nextSeq: () => seq++,
})

assert.equal(afterSourceRemoval.length, 1)
assert.equal(afterSourceRemoval[0]?.comboModelId, 'model-b')
