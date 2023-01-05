# wesdb

wesdb is a dumb database built on [SQLite](https://www.sqlite.org/index.html) and [Apache ZooKeeper](https://zookeeper.apache.org/).
It was built as an exercise to use ZooKeeper after I completed reading
[ZooKeeper: Wait-free coordination for Internet-scale systems](https://www.usenix.org/legacy/event/atc10/tech/full_papers/Hunt.pdf).

**Please do not use this**. Check out [Why is it dumb?](#why-is-it-dumb).

## Core Design

wesdb is centered around a leader and follower model, which is orchestrated utilizing ZooKeeper. Read requests are able to be served
from any node in the cluster. Write requests are forwarded to the leader, which are then propagated to the follower nodes.

Each node has its own local SQLite database that is saved in the file `wesdb.db`. Interacting with the database occurs over the following
HTTP endpoints:

-   **/execute** - Execute a SQL statement like a CREATE, UPDATE, ALTER, or INSERT. Writes must go through this endpoint.
-   **/query** - Execute a SQL query like a SELECT. Attempting to send writes to this endpoint will be met with an error.

## Why is it dumb?

There's a plethora of issues that exist with the naive design of wesdb, but I'll highlight a few glaring ones:

-   It does statement-based replication. This means that instead of capturing the state change that a query makes on the leader node, then
    replicating that state, the query text itself is simply sent to the follower nodes. This quickly falls apart when executing queries that use
    `RAND()`, `NOW()`, etc because they now yield different results on each node.
    -   This is by far the most illogical part of the design. The idea of a leader node is to have write synchronization in place, but this issue continues the ability for a desync.
-   It doesn't handle adding new nodes to the cluster. When a new node is added to the cluster, its own local data is completely blank. You're free
    to copy the data over to a new node yourself, but the system does not manage this at all.
-   It doesn't handle individual node crashes, other than electing new leaders. When a crashed node boots back up, it is living at the last saved state before
    its crash. The system makes no attempt to inform the rebooted node of the changes that occurred while it was offline.
-   It's not partition tolerant, at all. This means that a single bad node can cause writes to fail across the entire cluster.

### Why is it here then?

Simply for any people who are interested in learning more about database basics and building distributed systems using ZooKeeper. It was a fun
litte project to build!

## Testing it yourself

You're more than welcome to give wesdb a try yourself! You can start up a cluster with three database nodes and one ZooKeeper node by simply having
Docker installed and running `docker-compose up` in the root directory. You'll recieve log messages informing you of the individual ports each node
is running on. Simply send requests to any of them!
