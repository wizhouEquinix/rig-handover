import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Temp runs dir only: runs/ is read-only fixtures and is never touched here.
const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-'));

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
};

// Written out of alphabetical order on purpose: the page and the JSON must sort by job.
const okLines = [
  '{"at":"2026-10-28T23:00:02+01:00","job":"b/y","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T22:10:00+01:00","job":"c/z","status":"fail","owner":null,"error":"timeout"}',
  '{"at":"2026-10-28T23:05:00+01:00","job":"a/x","status":"retry","owner":"rook"}',
  '{"at":"2026-10-28T23:06:00+01:00","job":"a/x","status":"ok","owner":"rook"}',
];

const badLines = [
  '{"at":"2026-10-27T23:00:02+01:00","job":"b/y","status":"ok","owner":"rook"}',
  '{"at":"2026-',
  '{"at":"2026-10-27T23:01:00+01:00","job":"a/x","status":"fail","owner":"rook"}',
];

function fileFor(night: string): string {
  return path.join(runsDir, `${night}.jsonl`);
}

beforeAll(() => {
  fs.writeFileSync(fileFor('2026-10-28'), okLines.join('\n') + '\n');
  fs.writeFileSync(fileFor('2026-10-27'), '');
  fs.writeFileSync(fileFor('2026-10-26'), badLines.join('\n') + '\n');
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page /digest/:night', () => {
  it('answers 200 with HTML for a night on disk', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('a/x');
    expect(html).toContain('b/y');
    expect(html).toContain('c/z');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2001-01-01');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 200 for a night with a bad line and still shows the good jobs', async () => {
    const res = await createApp(config).request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('a/x');
    expect(html).toContain('b/y');
  });
});

describe('digest JSON /api/digest/:night', () => {
  it('answers 200 with night, rows and badLines for a night on disk', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((row) => row.job)).toEqual(['a/x', 'b/y', 'c/z']);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2001-01-01');
    expect(res.status).toBe(404);
  });

  it('answers rows [] and badLines 0 for an empty night', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('answers 200 for a night with a bad line, counts it, and keeps the good jobs', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(['a/x', 'b/y']);
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-10-28', '2026-10-26'])('lists the same jobs in the same order for %s', async (night) => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${night}`)).text();
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as Night;

    expect(body.rows.length).toBeGreaterThan(0);
    let previous = -1;
    for (const row of body.rows) {
      const index = html.indexOf(row.job);
      expect(index, `job ${row.job} missing from page`).toBeGreaterThan(-1);
      expect(index, `job ${row.job} out of order on page`).toBeGreaterThan(previous);
      previous = index;
    }
  });
});
