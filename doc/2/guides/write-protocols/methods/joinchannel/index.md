---
code: true
type: page
title: joinChannel
---

# joinChannel

Informs the protocol that one of its connected users joined a [channel](/core/2/guides/write-protocols/start-writing-protocols#channels).

---

## Arguments

```js
joinChannel(channel, connectionId);
```

<br/>

| Arguments      | Type              | Description                                                                                                                           |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `channel`      | <pre>string</pre> | Joined channel identifier                                                                                                             |
| `connectionId` | <pre>string</pre> | Connection unique identifier, previously registered by the protocol using [newConnection](/core/2/guides/write-protocols/entrypoint/newconnection) |

---

## Return

The `joinChannel` function is not expected to return a value.
