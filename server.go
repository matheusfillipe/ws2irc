package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

func debug(message string, params ...interface{}) {
	if os.Getenv("DEBUG") == "true" {
		fmt.Printf("DEBUG - [%v]:: %v\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(message, params...))
	}
}

type Config struct {
	listen_host    string
	listen_port    string
	irc_host       string
	irc_port       string
	ssl_cert       string
	ssl_key        string
	allowed_origin string
	upgrader       *websocket.Upgrader
}

func makeConfig() Config {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

  allowed_origin := os.Getenv("ALLOWED_ORIGIN")
	var config = Config{
		listen_host:    os.Getenv("LISTEN_HOST"),
		listen_port:    os.Getenv("LISTEN_PORT"),
		irc_host:       os.Getenv("IRC_HOST"),
		irc_port:       os.Getenv("IRC_PORT"),
		ssl_cert:       os.Getenv("SSL_CERT"),
		ssl_key:        os.Getenv("SSL_KEY"),
		allowed_origin: allowed_origin,
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


func main() {
  config := makeConfig()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		debug("Client origin: %q", origin)
    upgrader := config.upgrader
		conn, err := upgrader.Upgrade(w, r, nil)
		log.Println("New client from ", r.RemoteAddr)
		if err != nil {
			log.Println(err)
			return
		}

		for {
			// Read message from browser
			msgType, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}

			// Print the message to the console
			fmt.Printf("%s sent: %s\n", conn.RemoteAddr(), string(msg))

			// Write message back to browser
			if err = conn.WriteMessage(msgType, msg); err != nil {
				return
			}
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
