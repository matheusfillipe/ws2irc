package main

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

func debug(message string, params ...interface{}) {
	if os.Getenv("DEBUG") == "true" {
		fmt.Printf("DEBUG - [%v]:: %v\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(message, params...))
	}
}

var connected_clients = make(map[string]uint16)

type Config struct {
	listen_host    string
	listen_port    string
	irc_host       string
	irc_port       string
	irc_ssl        bool
	ssl_cert       string
	ssl_key        string
	allowed_origin string
	max_per_ip     uint16
	upgrader       *websocket.Upgrader
}

func makeConfig() Config {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	allowed_origin := os.Getenv("ALLOWED_ORIGIN")
	max_ip, err := strconv.Atoi(os.Getenv("MAX_PER_IP"))
	max_per_ip := uint16(max_ip)
	var config = Config{
		listen_host:    os.Getenv("LISTEN_HOST"),
		listen_port:    os.Getenv("LISTEN_PORT"),
		irc_host:       os.Getenv("IRC_HOST"),
		irc_port:       os.Getenv("IRC_PORT"),
		irc_ssl:        os.Getenv("IRC_USE_SSL") == "true",
		ssl_cert:       os.Getenv("SSL_CERT"),
		ssl_key:        os.Getenv("SSL_KEY"),
		allowed_origin: allowed_origin,
		max_per_ip:     max_per_ip,
		upgrader: &websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				return allowed_origin == "" || allowed_origin == origin
			},
		},
	}
	debug("Allowing origin: %q", allowed_origin)
	return config
}

func irc_connect(config Config) net.Conn {

	addr := config.irc_host + ":" + config.irc_port
	tcpAddr, err := net.ResolveTCPAddr("tcp", addr)
	if err != nil {
		println("ResolveTCPAddr failed:", err.Error())
		return nil
	}
	debug("Starting IRC server connection")

	conn, err := func() (net.Conn, error) {
		if config.irc_ssl {
			return tls.Dial("tcp", addr, &tls.Config{})
		} else {
			return net.DialTCP("tcp", nil, tcpAddr)
		}
	}()

	if err != nil {
		println("Failed to connect to irc server:", err.Error())
		return nil
	}
	return conn
}

func bridge(ws_conn *websocket.Conn, irc_conn net.Conn, client_ip string) {
	// Read from irc, Write to websocket
	close := func() {
		ws_conn.Close()
		irc_conn.Close()
	}

	go func() {
		for {
			reader := bufio.NewReader(irc_conn)
			for {
				irc_message, err := reader.ReadString('\n')
				if err != nil {
					println("Read from irc server failed:", err.Error())
					close()
					return
				}
				debug("Irc Server message: %s", string(irc_message))

				if err = ws_conn.WriteMessage(websocket.TextMessage, []byte(irc_message)); err != nil {
					log.Println("Error writing message: ", err, " to ", ws_conn.RemoteAddr(), ". Closing connection")
					close()
					return
				}
			}
		}
	}()

	// Read from websocket, Write to irc
	for {
		msgType, ws_message, err := ws_conn.ReadMessage()
		if msgType == websocket.BinaryMessage {
			debug("Ignoring websocket binary message")
			continue
		}
		if err != nil {
			println("Read from websocket server failed:", err.Error())
			close()
			return
		}
		debug("Message from websocket client: %s", ws_message)

		if _, err = irc_conn.Write([]byte(string(ws_message) + "\r\n")); err != nil {
			log.Println("Error writing : ", err, " to irc server. Closing connection")
			close()
			return
		}
	}
}

func main() {
	config := makeConfig()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Println("New client from ", r.RemoteAddr)

		client_ip := strings.Split(r.RemoteAddr, ":")[0]
    if value, ok := connected_clients[client_ip]; ok && value >= config.max_per_ip {
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte("403 - Too many ongoing connections from your ip"))
      println("Bloking it")
			return
		}
		if _, ok := connected_clients[client_ip]; ok {
			connected_clients[client_ip]++
		} else {
			connected_clients[client_ip] = 1
		}

		upgrader := config.upgrader
		ws_conn, err := upgrader.Upgrade(w, r, nil)
		debug("Client origin: %q", r.Header.Get("Origin"))

		if err != nil {
			log.Println(err)
			return
		}
		irc_conn := irc_connect(config)
		if irc_conn == nil {
			return
		}
		bridge(ws_conn, irc_conn, client_ip)
    connected_clients[client_ip]--
		if value, ok := connected_clients[client_ip]; ok && value <= 0 {
			delete(connected_clients, client_ip)
		}
	})

	if config.ssl_cert != "" && config.ssl_key != "" {
		log.Printf("Starting server with https on %v:%v", config.listen_host, config.listen_port)
		log.Fatal(http.ListenAndServeTLS(config.listen_host+":"+config.listen_port, config.ssl_cert, config.ssl_key, nil))
	} else {
		log.Printf("Starting server on %v:%v", config.listen_host, config.listen_port)
		log.Fatal(http.ListenAndServe(config.listen_host+":"+config.listen_port, nil))
	}
}
