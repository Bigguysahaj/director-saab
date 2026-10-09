// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import * as routes from './route';
import * as members from '../cast/[id]/route';
import { createProject, listProjects } from '@/lib/projectStore';
import { createMember, readRoster } from '@/lib/castStore';
let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'eng007-api-')); vi.stubEnv('DIRECTOR_DATA_DIR', root); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
const request = (body: unknown, url = 'http://x/api/projects') => new Request(url, { method: 'POST', body: JSON.stringify(body) });
it('renames and deletes projects through the API', async () => {
  const project = await createProject('Film');
  expect((await routes.PATCH(request({ id: project.id, name: 'New film' }))).status).toBe(200);
  expect((await listProjects()).projects[1].name).toBe('New film');
  expect((await routes.DELETE(request({ id: project.id }))).status).toBe(200);
  expect((await listProjects()).projects).toHaveLength(1);
});
it('returns 400 for invalid bodies and 404 for unknown projects', async () => {
  for (const body of [null, {}, { id: 'default', name: 1 }, { id: 'default', name: '' }]) expect((await routes.PATCH(request(body))).status).toBe(400);
  expect((await routes.PATCH(request({ id: 'missing', name: 'Film' }))).status).toBe(404);
  expect((await routes.DELETE(request({ id: 'missing' }))).status).toBe(404);
  expect((await routes.DELETE(request({}))).status).toBe(400);
  expect((await routes.PATCH(new Request('http://x/api/projects', { method: 'PATCH', body: '{' }))).status).toBe(400);
});
it('copies and moves members with destination URLs', async () => {
  await listProjects();
  const target = await createProject('Target');
  const member = await createMember('default', 'Asha');
  const ctx = { params: Promise.resolve({ id: member.id }) };
  const url = `http://x/api/cast/${member.id}?project=default`;
  const copy = await members.POST(request({ targetProjectId: target.id, mode: 'copy' }, url), ctx);
  expect(copy.status).toBe(201);
  expect((await copy.json()).name).toBe('Asha');
  expect(await readRoster('default')).toHaveLength(1);
  expect((await members.POST(request({ targetProjectId: target.id, mode: 'move' }, url), ctx)).status).toBe(201);
  expect(await readRoster('default')).toEqual([]);
  expect(await readRoster(target.id)).toHaveLength(2);
});
it('rejects invalid transfer requests', async () => {
  await listProjects();
  const member = await createMember('default', 'Asha');
  const ctx = { params: Promise.resolve({ id: member.id }) };
  const url = `http://x/api/cast/${member.id}?project=default`;
  for (const body of [null, {}, { targetProjectId: 'default', mode: 'copy' }, { targetProjectId: 'default', mode: 'bad' }]) expect((await members.POST(request(body, url), ctx)).status).toBe(400);
  expect((await members.POST(request({ targetProjectId: 'missing', mode: 'move' }, url), ctx)).status).toBe(404);
});
