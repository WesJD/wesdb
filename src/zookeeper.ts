import ZooKeeper from "zookeeper"

export const startAndConnect = (connect: string): Promise<ZooKeeper> => {
    return new Promise((resolve, reject) => {
        try {
            const client = new ZooKeeper({ connect })
            client.once("connect", () => resolve(client))
            client.init({})
        } catch (error) {
            reject(error)
        }
    })
}
