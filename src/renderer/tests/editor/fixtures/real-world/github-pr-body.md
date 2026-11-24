## Summary

Moves token storage to the OS keychain.

- Reads the old file once and deletes it.
- Falls back to the file when no keychain is available.

## Test plan

- [x] `npm test`
- [x] Fresh install on macOS
- [ ] Linux without a secret service

<details>
<summary>Screenshots</summary>

![before](https://example.com/before.png)

</details>

| Platform | Keychain |
| --- | --- |
| macOS | Keychain Access |
| Windows | Credential Manager |

---

[//]: # (dependabot-start)
⚠️ **Dependabot is rebasing this PR** ⚠️

[//]: # (dependabot-end)

Closes #412.
