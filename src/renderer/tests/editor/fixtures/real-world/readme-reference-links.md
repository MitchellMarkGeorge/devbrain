# fetch-retry

[![npm][npm-badge]][npm] [![build][ci-badge]][ci]

Retries `fetch` with exponential backoff. See the [API](#api) and the [changelog][changelog].

Installation
------------

```bash
npm install fetch-retry
```

## API

### `retry(url, options?)`

| Option    | Default | Description              |
|-----------|--------:|--------------------------|
| `retries` | `3`     | How many times to retry. |
| `delay`   | `1000`  | First delay, in ms.      |

* Works in Node 18+ and browsers
* No dependencies
  * not even `node-fetch`

## License

MIT, see [LICENSE](./LICENSE).

[npm]: https://www.npmjs.com/package/fetch-retry
[npm-badge]: https://img.shields.io/npm/v/fetch-retry.svg
[ci]: https://github.com/example/fetch-retry/actions
[ci-badge]: https://github.com/example/fetch-retry/workflows/ci/badge.svg
[changelog]: ./CHANGELOG.md "Changes"
