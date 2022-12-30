import express from "express"
import { open } from "sqlite"
import sqlite3 from "sqlite3"
import { addElectionNode, electLeader, Leader, startAndConnect } from "./zookeeper"
import { Server } from "http"
import { AddressInfo } from "net"

const start = async (port: number) => {
    console.log("setting up db...")
    const db = await open({
        filename: "wesdb.db",
        driver: sqlite3.Database,
    })

    // the address that the express server is served on
    let publicAddress: string
    // the currently known leader
    let leader: Leader

    console.log("starting webserver...")
    const app = express()
    app.use(express.json()) // parse bodys to js objects
    app.post("/execute", (request, response) => {
        if (!("sql" in request.body)) {
            response.status(400)
            response.json({ error: "sql not provided" })
            return
        }

        if (publicAddress != leader.address) {
            console.log("forwarding execute request to leader", request.body)
            fetch(`${leader.address}/execute`, {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(request.body),
            })
                .then((leaderResponse) => Promise.all([Promise.resolve(leaderResponse), leaderResponse.json()]))
                .then(([leaderResponse, body]) => {
                    response.status(leaderResponse.status)
                    response.json(body)
                })
                .catch((error) => {
                    response.status(500)
                    response.json({ error: `failed to propogate write request to leader: ${error.message}` })
                })
            return
        }

        db.exec(request.body.sql)
            .then(() => {
                response.status(200)
                response.json({})
            })
            .catch((error) => {
                response.status(500)
                response.json({ error: error.message })
            })
    })
    app.post("/query", (request, response) => {
        if (!("sql" in request.body)) {
            response.status(400)
            response.json({ error: "sql not provided" })
            return
        }

        const sql = request.body.sql as string
        // This is a REALLY stupid check to make sure no one does an update inside of a
        // query. Of course, this would never be a real solution in production, but no need
        // to overcomplicate our simple test project.
        const lowerSql = sql.toLowerCase()
        if (["update", "insert", "alter", "create"].some((elem) => lowerSql.includes(elem))) {
            response.status(400)
            response.json({ error: "an update query must be ran using execute" })
            return
        }

        db.all(sql)
            .then((result) => {
                response.status(200)
                response.json({ result })
            })
            .catch((error) => {
                response.status(500)
                response.json({ error: error.message })
            })
    })
    const expressServer = await new Promise<Server>((resolve) => {
        const server = app.listen(port, () => resolve(server))
    })
    const address = expressServer.address() as AddressInfo
    publicAddress = `http://${address.address}:${address.port}`
    console.log(`webserver is listening on ${publicAddress}`)

    console.log("connecting to zookeeper...")
    const zkConnect = process.env.ZOOKEEPER_CONNECT || "localhost:2181"
    const zookeeper = await startAndConnect(zkConnect)

    console.log("adding zookeeper election node...")
    await addElectionNode(zookeeper, publicAddress)

    console.log("beginning leader election...")
    await electLeader(zookeeper, (newLeader) => {
        leader = newLeader
        console.log("new leader elected", newLeader)
    })
}

start(parseInt(process.env.PORT) || 3000).catch((err) => console.error("failed to boot", err))
