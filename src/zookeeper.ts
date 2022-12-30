import ZooKeeperPromise from "zookeeper"

const ZKConstants = ZooKeeperPromise.constants
const ELECTION_ROOT = "/election"

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

export const electLeader = async (
    client: ZooKeeperPromise,
    onLeaderChange: (leaderAddress: string, nodeName: string) => void
) => {
    if (!(await client.pathExists(ELECTION_ROOT, false))) {
        throw new Error(`election root ${ELECTION_ROOT} does not exist`)
    }

    const handleChildrenUpdate = async (children: string[]) => {
        children.sort()
        const nodeName = children[0]
        const data = await client.get(`${ELECTION_ROOT}/${nodeName}`, false)
        const address = (data[1] as Buffer).toString("utf8")
        onLeaderChange(address, nodeName)
    }
    const watcher = () => {
        client
            .w_get_children(ELECTION_ROOT, watcher)
            .then(handleChildrenUpdate)
            .catch((error) => console.log("failed to handle children update in watcher", error))
    }

    handleChildrenUpdate(await client.w_get_children(ELECTION_ROOT, watcher))
}
