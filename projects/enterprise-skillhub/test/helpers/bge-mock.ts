import http from 'node:http';

export type BgeMock = {
  url: string;
  setMode: (mode: 'ok' | 'down' | 'timeout' | 'bad_dim') => void;
  close: () => Promise<void>;
};

function makeEmbedding(dim = 1024) {
  return Array.from({ length: dim }, (_, i) => (i % 2 === 0 ? 0.001 : -0.001));
}

export async function startBgeMock(): Promise<BgeMock> {
  let mode: 'ok' | 'down' | 'timeout' | 'bad_dim' = 'ok';

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith('/v1/encode')) {
      res.statusCode = 404;
      return res.end('not found');
    }

    if (mode === 'down') {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: 'bge down' }));
    }

    if (mode === 'timeout') {
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((r) => setTimeout(r, 10_000));
    }

    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    let texts: string[] = [];
    try {
      const parsed = JSON.parse(body);
      texts = parsed.texts || [];
    } catch {
      // ignore
    }

    const dim = mode === 'bad_dim' ? 2 : 1024;

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        embeddings: texts.map(() => makeEmbedding(dim)),
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    setMode: (m) => {
      mode = m;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}
