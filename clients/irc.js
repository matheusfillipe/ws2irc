const DEFAULT_USERNAME = 'websocket'

class WsIrcClient {
  constructor(config) {
    let server, port, username, nick, debug
    ({server, port, nick, username, debug} = config)
    if (!server || !port) {
      throw new Error('No server or port specified')
    }
    this.server = server + ":" + port
    this.port = port
    this.nick = nick || "nick_" + new Date().getTime().toString(36) + new Date().getMilliseconds().toString(36)
    this.username = username || DEFAULT_USERNAME
    this.debug = debug
    this.log = (c, l) => setTimeout(
      console.log.bind(this, "%c%s", "font-size: 14px; color:" + c, new Date().toLocaleString("it") + ": " + l)
    )
    this.deb = (c, l) => {
      if (this.debug) this.log(c, l)
    }
    this.init = 0
    this.reset_hooks()
  }

  reset_hooks() {
    const empty = () => {}
    const hook_types = ["onmessage", "onjoin", "onconnect", "onclose", "onerror", "onopen"]
    for (const hook of hook_types) {
      const _hook = "_" + hook
      this[_hook] = empty
      this[hook] = (f) => {
        this[_hook] = f.bind(this)
        return this
      }
    }
  }

  connect() {
    // check if page is ssl
    const isSecure = window.location.protocol === 'https:'
    let wsstring = isSecure ? "wss://" : "ws://"
    let ws = new WebSocket(`${wsstring}${this.server}`)

    ws.onopen = e => {
      ws.send(`user ${this.username} * * :${this.username}`)
      ws.send(`nick ${this.nick}`)
      this._onopen(e)
    }
    ws.onclose = e => {
      this.log("CLOSED")
      this._onclose(e)
    }

    ws.onerror = e => {
      this.log("red", "ERROR")
      fetch("https://" + server).then(c => this.log(c.text()))
      this._onerror(e)
    }

    ws.onmessage = m => {
      if (m.data.indexOf("PING") == 0) ws.send(m.data.replace("PI", "PO"))
      else this.deb("green", "==> " + m.data)

      if ((this.init == 0) && (m.data.split(" ")[1] == "376")) {
        this.init = 1
        this.log("orange", "CONNECTED")
        this._onconnect()
      }

      if (this.init == 1) {
        let type = m.data.split(" ")[1]
        if (type === "PRIVMSG") {
          let from_nick = m.data.split(":")[1].split("!")[0]
          let message = m.data.split(" ").splice(3).join(" ").substring(1)
          this._onmessage(from_nick, message)
          this.deb("blue", from_nick + "> " + message)

        } else if (type === "JOIN") {
          let channel = m.data.split(":")[2]
          let message = m.data.split(" ").splice(3).join(" ").substring(1)
          this._onjoin(channel, message)
          this.deb("blue", channel + " joined.")

        } else if (m.data.split(" ")[1] === "353") {
          if (m.data.split(":")[2][0] === "@") {
            chan = m.data.split("=")[1].split(" ")[1]
            ws.send("mode " + chan + " +s");
          }
        }
      }
    }
    this.ws = ws
    return this
  }

  send(nick_or_channel, message) {
    this.ws.send(`PRIVMSG ${nick_or_channel} :${message}`)
  }
  join(channel) {
    this.ws.send(`JOIN ${channel}`)
  }
  part(channel) {
    this.ws.send(`PART ${channel}`)
  }
  quit(message) {
    this.ws.send(`QUIT :${message}`)
  }
  mode(channel, mode) {
    this.ws.send(`MODE ${channel} ${mode}`)
  }
  kick(channel, nick, message) {
    this.ws.send(`KICK ${channel} ${nick} :${message}`)
  }
  topic(channel, topic) {
    this.ws.send(`TOPIC ${channel} :${topic}`)
  }
  names(channel) {
    this.ws.send(`NAMES ${channel}`)
  }
  close() {
    this.quit("bye")
    this.ws.close()
  }
}


/*  EXAMPLE USAGE
 * let client = new WsIrcClient({
 *   server: "yourserver.com",
 *   port: 7667,
 *   nick: "echobot",
 *   // debug: true
 * })
 *   .onmessage(function(from, message) {
 *     console.log(from + "> " + message)
 *     // this.send("#bots", from + ": Turns out I am an irc bot running on someone's browser!")
 *     this.send("#bots", from + ": " + message)
 *   })
 *   .onconnect(function() {
 *     this.join("#bots")
 *   })
 *   .onjoin(function(channel, message) {
 *     console.log("Joined " + channel + "> " + message)
 *     this.send("channel, "Hello!")
 *   })
 *   .connect()
 */
