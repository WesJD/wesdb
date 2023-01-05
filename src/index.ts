import express from "express"
import { Database, open } from "sqlite"
import sqlite3 from "sqlite3"
import { addElectionNode, electLeader, Node, startAndConnect } from "./zookeeper"
import { Server } from "http"
import { AddressInfo } from "net"
import ZooKeeperPromise from "zookeeper"
import handleExecuteRequest from "./routes/execute"
import handleQueryRequest from "./routes/query"

export type Environment = {
    // the sqlite db
    db: Database<sqlite3.Database, sqlite3.Statement>
    // the address that the expresss server is served on
    publicAddress: string
    // the currently known leader
    leader: Node
    // the zookeeper client
    zookeeper: ZooKeeperPromise
}

const start = async (port: number, host: string) => {
    let env: Environment

    console.log("setting up db...")
    const db = await open({
        filename: "wesdb.db",
        driver: sqlite3.Database,
    })

    console.log("configuring webserver...")
    const app = express()
    app.use(express.json()) // parse bodys to js objects
    app.post("/execute", (request, response) => handleExecuteRequest(request, response, env))
    app.post("/query", (request, response) => handleQueryRequest(request, response, env))

    console.log("starting webserver...")
    const server = await startExpress(app, port, host)
    const publicAddress = getPublicAddress(server)

    const { client: zookeeper, initialLeader } = await setupZookeeper(publicAddress, (newLeader) => {
        env = { ...env, leader: newLeader }
        console.log("new leader elected", newLeader)
    })
    env = { db, publicAddress, zookeeper, leader: initialLeader }

    console.log(`started! webserver is listening @ ${publicAddress} and initial environment is`, env)
}

const getPublicAddress = (server: Server): string => {
    const address = server.address() as AddressInfo
    return `http://${address.address == "::" ? "localhost" : address.address}:${address.port}`
}

const startExpress = (express: express.Express, port: number, host: string): Promise<Server> => {
    return new Promise((resolve) => {
        const server = express.listen(port, host, () => resolve(server))
    })
}

const setupZookeeper = async (
    publicAddress: string,
    onLeaderChange: (leader: Node) => void
): Promise<{ client: ZooKeeperPromise; initialLeader: Node }> => {
    console.log("connecting to zookeeper...")
    const zkConnect = process.env.ZOOKEEPER_CONNECT || "localhost:2181"
    const zookeeper = await startAndConnect(zkConnect)

    console.log("adding zookeeper election node...")
    await addElectionNode(zookeeper, publicAddress)

    console.log("beginning leader election...")
    const initialLeader = await electLeader(zookeeper, onLeaderChange)

    return { client: zookeeper, initialLeader }
}

start(parseInt(process.env.BIND_PORT) || 3000, process.env.BIND_HOST ?? "localhost").catch((err) =>
    console.error("failed to boot", err)
)
