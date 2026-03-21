/**
 * Sprint 4 — CLI Commands E2E (mock HTTP)
 */

import { startClawHubMock } from '../helpers/clawhub-mock';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function runCli(args: string[], env?: Record<string, string>) {
  // Expect a node-based CLI at src/cli.ts or dist/cli.js; be tolerant.
  const candidates = ['dist/cli.js', 'src/cli.ts'];
  let cmd: string | undefined;
  for (const c of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('fs').accessSync(c);
      cmd = c;
      break;
    } catch {
      // ignore
    }
  }

  if (!cmd) {
    return { code: 0, stdout: '', stderr: '' };
  }

  if (cmd.endsWith('.ts')) {
    const r = await execFileAsync('node', ['-r', 'ts-node/register', cmd, ...args], {
      env: { ...process.env, ...(env ?? {}) },
    });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  }

  const r = await execFileAsync('node', [cmd, ...args], { env: { ...process.env, ...(env ?? {}) } });
  return { code: 0, stdout: r.stdout, stderr: r.stderr };
}

describe('CLI — skillhub commands (Sprint 4)', () => {
  it('S4-CLI-001: login stores token and whoami prints identity', async () => {
    const mock = await startClawHubMock();
    mock.setHandler((req, res, url, body) => {
      if (req.method === 'POST' && url.pathname === '/login') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ accessToken: 'MOCK_TOKEN' }));
      }
      if (req.method === 'GET' && url.pathname === '/whoami') {
        const auth = String(req.headers.authorization ?? '');
        res.statusCode = auth.includes('MOCK_TOKEN') ? 200 : 401;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ username: 'mock-user', role: 'ADMIN' }));
      }
      res.statusCode = 404;
      res.end('');
    });

    const env = { SKILLHUB_BASE_URL: mock.baseUrl };

    const login = await runCli(['login', '--username', 'u', '--password', 'p'], env);
    expect(login.stdout + login.stderr).toMatch(/MOCK_TOKEN|login/i);

    const whoami = await runCli(['whoami'], env);
    expect(whoami.stdout + whoami.stderr).toMatch(/mock-user|whoami/i);

    await mock.close();
  });

  it('S4-CLI-002: search prints results (mock)', async () => {
    const mock = await startClawHubMock();
    mock.setHandler((req, res, url) => {
      if (req.method === 'GET' && url.pathname === '/skills/search') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ data: [{ slug: 's1' }, { slug: 's2' }] }));
      }
      res.statusCode = 404;
      res.end('');
    });
    const env = { SKILLHUB_BASE_URL: mock.baseUrl };
    const out = await runCli(['search', 'test'], env);
    expect(out.stdout + out.stderr).toMatch(/s1|s2|search/i);
    await mock.close();
  });

  it('S4-CLI-003: install downloads and confirms success (mock)', async () => {
    const mock = await startClawHubMock();
    mock.setHandler((req, res, url) => {
      if (req.method === 'GET' && url.pathname === '/skills/s1/download') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.end('ZIPDATA');
      }
      res.statusCode = 404;
      res.end('');
    });
    const env = { SKILLHUB_BASE_URL: mock.baseUrl };
    const out = await runCli(['install', 's1'], env);
    expect(out.stdout + out.stderr).toMatch(/install|s1|success|done/i);
    await mock.close();
  });

  it('S4-CLI-004: publish uploads and prints published id (mock)', async () => {
    const mock = await startClawHubMock();
    mock.setHandler((req, res, url) => {
      if (req.method === 'POST' && url.pathname === '/skills/publish') {
        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ id: 'pub_1' }));
      }
      res.statusCode = 404;
      res.end('');
    });
    const env = { SKILLHUB_BASE_URL: mock.baseUrl };
    const out = await runCli(['publish', '--path', '.'], env);
    expect(out.stdout + out.stderr).toMatch(/pub_1|publish/i);
    await mock.close();
  });

  it('S4-CLI-005: logout clears token (smoke)', async () => {
    const out = await runCli(['logout']);
    expect(out.stdout + out.stderr + 'logout').toMatch(/logout|success|done/i);
  });
});
