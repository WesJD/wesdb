import { Request, Response as ExpressResponse } from "express"
import { Environment } from ".."
import { getAllNodes } from "../zookeeper"

type ExecuteBody = {
    // the sql string to execute
    sql: string
    // the address of the node where the request is originating
    from?: string
}

const handleExecuteRequest = (request: Request<{}, {}, ExecuteBody>, response: ExpressResponse, env: Environment) => {
    const { publicAddress, leader } = env

    console.log("recieved execute request", request.body)
    if (!("sql" in request.body)) {
        response.status(400)
        response.json({ error: "sql not provided" })
        return
    }

    // reroute the request to leader if it isnt from the leader and we are a follower
    if (request.body.from != leader.address && publicAddress != leader.address) {
        console.log("forwarding execute request to leader", request.body)
        forwardRequest(request, env.leader.address, env)
            .then((response) => Promise.all([Promise.resolve(response), response.json()]))
            .then(([leaderResponse, body]) => {
                response.status(leaderResponse.status)
                response.json(body)
            })
            .catch((error) => {
                response.status(500)
                response.json({ error: `failed to propagate write request to leader: ${error.message}` })
                console.error("failed execute propagation", error)
            })
        return
    }

    console.log("executing request locally", request.body)
    executeRequest(request, env)
        .then(() => {
            response.status(200)
            response.json({})
        })
        .catch((error) => {
            response.status(500)
            response.json({ error: error.message })
            console.error("failed to execute request", error)
        })
}

const executeRequest = async (request: Request<{}, {}, ExecuteBody>, env: Environment) => {
    const { db, publicAddress, leader, zookeeper } = env

    // execute the sql locally
    await db.exec(request.body.sql)

    // if we aren't the leader, then we never need to forward requests
    if (publicAddress != leader.address) {
        return
    }

    console.log("sending write request to all children since request was propagated from %s", request.body.from)
    const nodes = await getAllNodes(zookeeper)
    await Promise.all(
        nodes
            .filter((node) => node.address != leader.address) // don't send the request to ourselves!!
            .map((node) =>
                forwardRequest(request, node.address, env).then((response) => {
                    if (response.status != 200) {
                        throw new Error("failed to write request to followers")
                    }
                    return response
                })
            )
    )
}

const forwardRequest = async (request: Request, address: string, { publicAddress }: Environment): Promise<Response> => {
    return await fetch(`${address}/execute`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({ ...request.body, from: publicAddress } as ExecuteBody),
    })
}

export default handleExecuteRequest
