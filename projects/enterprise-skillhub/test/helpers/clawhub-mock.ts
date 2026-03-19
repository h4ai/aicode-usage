import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';

export type ClawHubMockOpts = {
  port?: number;
};

export type MockServer = {
  baseUrl: string;
  close: () => Promise<void>;
  setHandler: (h: Handler) => void;
};

export type Handler = (req: IncomingMessage, res: ServerResponse, url: URL, body: any) => void;

async function readBody(req: IncomingMessage): Promise<any> {
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(data);
      }
    });
  });
}

export async function startClawHubMock(opts: ClawHubMockOpts = {}): Promise<MockServer> {
  let handler: Handler = (_req, res) => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'mock not configured' }));
  };

  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    const body = await readBody(req);
    handler(req, res, u, body);
  });

  const port = await new Promise<number>((resolve) => {
    server.listen(opts.port ?? 0, () => {
      const addr = server.address();
      if (typeof addr === 'string' || addr == null) resolve(0);
      else resolve(addr.port);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    setHandler: (h) => (handler = h),
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
