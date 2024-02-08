const express = require('express');
const path = require('path');
const Vite = require('vite');
const https = require('https');
const fs = require('fs');


// Generate local ssl in directory : https://github.com/FiloSottile/mkcert

let sslCert = "./cert.pem"
let sslKey = "./key.pem"

var app = express();

const sslOptions = {
    cert: fs.readFileSync(sslCert),
    key: fs.readFileSync(sslKey),
};

const port = 5137;
const PROXY_PORT = 5138;

let server

let serverListen
let transfProtocol

serverListen = https.createServer(sslOptions, app)
transfProtocol = "https"


// SERVER

//let server = null

const startIndex = async () => {

    const startServer = async () => {
        console.log("\nSTARTING NODEJS SERVER")
        return new Promise(async (resolve, reject) => {
            server = serverListen.listen(port, function () {
                console.log(' -> FriCams server started on ' + transfProtocol + '://localhost:' + port)
            });
            resolve(server)
        })
    }

    const runServer = async () => {
        console.log("\nRUNNING SERVER")
        return new Promise(async (resolve, reject) => {
            if (process.env.NODE_ENV == 'dev') {

                const Proxy = require('http-proxy');

                var proxy = new Proxy.createProxyServer({
                    target: { host: 'localhost', port: PROXY_PORT }
                });

                // proxy anything yet-unhandled back to vite
                app.get('*', (req, res) => proxy.web(req, res));

                // proxy hmr ws back to vite
                server.on('upgrade', (req, socket, head) => {
                    if (req.url == '/') proxy.ws(req, socket, head)
                });

                // start our vite dev server
                const vite = await Vite.createServer({ server: { port: PROXY_PORT } });
                vite.listen();
                console.log(" -> Running vite dev server")
                resolve()

            } else {
                app.use(express.static('dist'))
                app.get('*', function (request, response) {
                    response.sendFile(path.resolve('dist', 'index.html'));
                });
                console.log(" -> Running prod server")
                resolve()
            }
        })
    }


    await startServer()
    await runServer()



}

startIndex()
