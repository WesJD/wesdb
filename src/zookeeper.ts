import ZooKeeperPromise from "zookeeper"

const ZKConstants = ZooKeeperPromise.constants
const ELECTION_ROOT = "/election"

export type Node = {
    nodePath: string
    address: string
}

export const startAndConnect = (connect: string): Promise<ZooKeeperPromise> => {
    return new Promise((resolve, reject) => {
        try {
            const client = new ZooKeeperPromise({ connect })
            client.once("connect", () => resolve(client))
            client.init({})
        } catch (error) {
            reject(error)
        }
    })
}

export const addElectionNode = async (client: ZooKeeperPromise, address: string) => {
    if (!(await client.pathExists(ELECTION_ROOT, false))) {
        console.log("%s does not exist, creating it", ELECTION_ROOT)
        await client.create(ELECTION_ROOT, "", ZKConstants.ZOO_PERSISTENT)
    }

    console.log("creating ephemeral election node with address %s", address)
    await client.create(`${ELECTION_ROOT}/node`, address, ZKConstants.ZOO_EPHEMERAL_SEQUENTIAL)
}

const getNodeData = async (client: ZooKeeperPromise, nodePath: string): Promise<Node> => {
    const data = await client.get(nodePath, false)
    const address = (data[1] as Buffer).toString("utf8")
    return { nodePath, address }
}

export const getAllNodes = async (client: ZooKeeperPromise): Promise<Node[]> => {
    const children = await client.get_children(ELECTION_ROOT, false)
    return await Promise.all(children.map((child) => getNodeData(client, `${ELECTION_ROOT}/${child}`)))
}

// starts leader election, returning the initially elected leader. all subsequent leader updates are fed through
// the second onLeaderChange callback.
export const electLeader = async (client: ZooKeeperPromise, onLeaderChange: (leader: Node) => void): Promise<Node> => {
    if (!(await client.pathExists(ELECTION_ROOT, false))) {
        throw new Error(`election root ${ELECTION_ROOT} does not exist`)
    }

    const handleChildrenUpdate = async (children: string[], callCallback: boolean = true): Promise<Node> => {
        children.sort()
        const nodePath = `${ELECTION_ROOT}/${children[0]}`
        const node = await getNodeData(client, nodePath)
        if (callCallback) {
            onLeaderChange(node)
        }
        return node
    }
    const watcher = () => {
        client
            .w_get_children(ELECTION_ROOT, watcher)
            .then(handleChildrenUpdate)
            .catch((error) => console.log("failed to handle children update in watcher", error))
    }

    const initialChildren = await client.w_get_children(ELECTION_ROOT, watcher)
    return await handleChildrenUpdate(initialChildren, false)
}
