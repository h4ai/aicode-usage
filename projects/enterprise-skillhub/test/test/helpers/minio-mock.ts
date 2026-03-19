import http from 'node:http';

/**
 * Minimal MinIO mock placeholder.
 *
 * 说明：当前 E2E 测试仅用于对接 API 合入后的行为；
 * 在未合入真实存储层前，本 mock 不做真正的 object 管理。
 */
export type MinioMock = {
  url: string;
  close: () => Promise<void>;
};

export async function startMinioMock(): Promise<MinioMock> {
  const server = http.createServer((req, res) => {
    // naive S3-like response
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, path: req.url, method: req.method }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}
