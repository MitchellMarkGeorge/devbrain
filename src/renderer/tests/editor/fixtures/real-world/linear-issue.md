Refresh the access token a minute before it expires, so requests never fail with 401.

* Read the expiry from the token response.
* Schedule one refresh per session.
* Retry once on a network error.

* [Docs on refresh tokens](<https://example.com/docs/refresh>)
  How the provider rotates them

**Size: M**

Test data: detach this task, edit this description in DevBrain, then reattach it.
