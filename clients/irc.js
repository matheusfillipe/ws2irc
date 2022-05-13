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
    const hook_types = ["onmessage", "onjoin", "onconnect", "onclose", "onerror", "onopen", "onnickinuse", "onnames"]
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

      const irc_code = m.data.split(" ")[1]
      if ((this.init == 0) && (irc_code == "376")) {
        this.init = 1
        this.log("orange", "CONNECTED")
        this._onconnect()
      }

      if (this.init == 1) {
        let type = m.data.split(" ")[1]
        if (type === "PRIVMSG") {
          const from_nick = m.data.split(":")[1].split("!")[0]
          const message = m.data.split(" ").splice(3).join(" ").substring(1)
          this._onmessage(from_nick, message)
          this.deb("blue", from_nick + "> " + message)

        } else if (type === "JOIN") {
          const channel = m.data.split(":")[2].trim()
          this.deb("blue", channel + " joined.")
          this._onjoin(channel)

        } else {
          switch (irc_code) {
            case "433":
              this.deb("red", "Nickname already in use.")
              this._onnickinuse()
              break
            case "353":
              const channel = m.data.split("=")[1].split(" ")[1]
              const names = m.data.split(":").slice(-1)[0].split(" ")
              this._onnames(channel, names)
              break
          }
        }
      } else if (irc_code == "433") {
        this.deb("red", "Nickname already in use. Trying to change nick.")
        this.nick = this.nick + "_"
        this.nick(this.nick)
      }
    }
    this.ws = ws
    return this
  }

  quote(message) {
    message = message.replace(/\n/g, "")
    this.deb("orange", "<== " + message)
    this.ws.send(message)
  }
  send(nick_or_channel, message) {
    this.quote(`PRIVMSG ${nick_or_channel} :${message}`)
  }
  nick(new_nick) {
    this.quote(`nick ${new_nick}`)
  }
  join(channel) {
    this.quote(`JOIN ${channel}`)
  }
  part(channel) {
    this.quote(`PART ${channel}`)
  }
  quit(message) {
    this.quote(`QUIT :${message}`)
  }
  mode(channel, mode) {
    this.quote(`MODE ${channel} ${mode}`)
  }
  kick(channel, nick, message) {
    this.quote(`KICK ${channel} ${nick} :${message}`)
  }
  topic(channel, topic) {
    this.quote(`TOPIC ${channel} :${topic}`)
  }
  names(channel) {
    this.quote(`NAMES ${channel}`)
  }
  close() {
    this.quit("bye")
    this.ws.close()
  }
}

/* EXAMPLE USAGE
 *
 * let client = new WsIrcClient({
 *   server: "server.com",
 *   port: 7667,
 *   nick: "echobot",
 *   // debug: true
 * })
 *   .onmessage(function (from, message) {
 *     console.log(from + "> " + message)
 *     // this.send("#bots", from + ": Turns out I am an irc bot running on someone's browser!")
 *     this.send("#bots", from + ": " + message)
 *   })
 *   .onconnect(function () {
 *     this.join("#bots")
 *   })
 *   .onjoin(function (channel) {
 *     console.log("Joined " + channel)
 *     this.send(channel, "Hello!")
 *   })
 *   .onnames(function (channel, names) {
 *     console.log("Names in " + channel + " :" + names.join(" "))
 *   })
 *   .connect()
 */
