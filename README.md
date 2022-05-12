# WS2IRC

A very simple websocket to irc bridge implemented in go. To get started copy and modify the `.env`:
```bash
cp env.example .env
```

You might be able to have any combination of client using either wss or ws and irc server using tls or not. Also make sure to set ALLOW_ORIGIN to the proper value or leave empty to allow any origin (not recommended!).

Then you can run it with:

```bash
go run .
```
There is an example js client inside `/clients` that you can use in a browser.

If you are implemented your own irc client be aware that each ws message must be of type text and will be interpreted as an individual irc message without the need for the `"\r\n"` separator. This is valid for both sent and received messages.
