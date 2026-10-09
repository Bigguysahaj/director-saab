// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const storage = vi.hoisted(() => ({ duringWrite: null as (() => Promise<void>) | null }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
    if (storage.duringWrite) {
      // Hold the real truncation window open so a simultaneous reader is deterministic.
      await fs.writeFile(args[0], '');
      await storage.duringWrite();
    }
    return fs.writeFile(...args);
  } };
});
import * as projects from './projectStore';
import * as cast from './castStore';
import { logSubmittedTake } from './takeLog';
let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'eng007-')); vi.stubEnv('DIRECTOR_DATA_DIR', root); });
afterEach(async () => { storage.duringWrite = null; vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const source = await projects.createProject('Source');
  const target = await projects.createProject('Target');
  const member = await cast.createMember(source.id, 'Asha');
  const image = 'data:image/png;base64,cGhvdG8=';
  await cast.updateMember(source.id, member.id, { photoDataUrl: image, sheetDataUrl: image, closeupDataUrl: image, shots: { front: { image, cost: 0.25 } }, stageColor: '#ff0000' });
  return { source, target, member };
}
it('rename keeps ID, cast, takes and active selection across reload', async () => {
  const { source, member } = await fixture();
  await projects.setActiveProject(source.id);
  await writeFile(path.join(projects.projectDir(source.id), 'takes.json'), 'takes');
  await projects.renameProject(source.id, ' New name ');
  expect((await projects.listProjects()).projects.find(p => p.id === source.id)?.name).toBe('New name');
  expect((await projects.listProjects()).activeId).toBe(source.id);
  expect((await cast.readRoster(source.id))[0].id).toBe(member.id);
  expect(await readFile(path.join(projects.projectDir(source.id), 'takes.json'), 'utf8')).toBe('takes');
  await expect(projects.renameProject(source.id, '')).rejects.toThrow(/name/i);
  await expect(projects.renameProject(source.id, 'target')).rejects.toThrow(/already/i);
  await expect(projects.renameProject('missing', 'Name')).rejects.toThrow(/not found/i);
});
it('deletes disk files, preserves other projects and selects a valid fallback', async () => {
  const { source, target } = await fixture();
  await mkdir(path.join(projects.projectDir(target.id), 'videos'));
  await writeFile(path.join(projects.projectDir(target.id), 'videos', 'take.mp4'), 'video');
  await projects.deleteProject(target.id);
  await expect(stat(projects.projectDir(target.id))).rejects.toThrow();
  expect((await projects.listProjects()).activeId).toBe('default');
  expect(await cast.readRoster(source.id)).toHaveLength(1);
  await projects.deleteProject(source.id);
  expect((await projects.listProjects()).activeId).toBe('default');
  await projects.deleteProject('default');
  expect(await projects.listProjects()).toMatchObject({ projects: [{ id: 'default', name: 'Default' }], activeId: 'default' });
  expect(await cast.readRoster('default')).toEqual([]);
  await expect(projects.deleteProject('missing')).rejects.toThrow(/not found/i);
});
it.each(['copy', 'move'] as const)('%s transfers all images and metadata without sharing assignments', async mode => {
  const { source, target, member } = await fixture();
  const transferred = await cast.transferMember(source.id, member.id, target.id, mode);
  expect(transferred).toMatchObject({ name: 'Asha', stageColor: null, shots: { front: { cost: 0.25 } } });
  for (const filename of [transferred.photo!, transferred.sheet!, transferred.closeup!, transferred.shots.front.file]) {
    expect((await cast.readMemberFile(target.id, transferred.id, filename)).toString()).toBe('photo');
  }
  expect(cast.toClientMember(target.id, transferred).photo).toContain('?project=target');
  expect(await cast.readRoster(source.id)).toHaveLength(mode === 'copy' ? 1 : 0);
  if (mode === 'move') await expect(stat(path.join(projects.projectDir(source.id), 'cast', member.id))).rejects.toThrow();
  else {
    const another = await cast.transferMember(source.id, member.id, target.id, 'copy');
    expect(another.id).not.toBe(transferred.id);
    expect(await cast.readRoster(target.id)).toHaveLength(2);
  }
});
it('rejects invalid transfers without changing the source', async () => {
  const { source, target, member } = await fixture();
  await expect(cast.transferMember(source.id, member.id, source.id, 'move')).rejects.toThrow(/different/i);
  await expect(cast.transferMember(source.id, member.id, 'missing', 'move')).rejects.toThrow(/not found/i);
  await expect(cast.transferMember('missing', member.id, target.id, 'copy')).rejects.toThrow(/not found/i);
  await expect(cast.transferMember(source.id, 'missing', target.id, 'move')).rejects.toThrow(/not found/i);
  // A missing referenced file must fail before the source is removed.
  await rm(path.join(projects.projectDir(source.id), 'cast', member.id, 'photo.png'));
  await expect(cast.transferMember(source.id, member.id, target.id, 'move')).rejects.toThrow();
  expect(await cast.readRoster(source.id)).toHaveLength(1);
  expect(await cast.readRoster(target.id)).toEqual([]);
});

it('delete also removes project take logs and videos stored outside its folder', async () => {
  const { source, target } = await fixture();
  for (const [id, project] of [['source-job', source.id], ['target-job', target.id]]) {
    await logSubmittedTake({ id, project, request: { model: 'test', prompt: 'take' } });
    await writeFile(path.join(root, 'takes', id, 'output.mp4'), 'video');
  }
  await projects.deleteProject(source.id);
  await expect(stat(path.join(root, 'takes', 'source-job'))).rejects.toThrow();
  expect(await readFile(path.join(root, 'takes', 'target-job', 'output.mp4'), 'utf8')).toBe('video');
});

it('readers always see complete project and cast records during updates', async () => {
  await projects.listProjects();
  const member = await cast.createMember('default', 'Asha');
  storage.duringWrite = async () => {
    expect((await projects.listProjects()).activeId).toBe('default');
    expect(await cast.readRoster('default')).toHaveLength(1);
  };
  await projects.renameProject('default', 'Film');
  await cast.updateMember('default', member.id, { name: 'Updated Asha' });
  expect((await projects.listProjects()).projects[0].name).toBe('Film');
  expect((await cast.readRoster('default'))[0].name).toBe('Updated Asha');
});
