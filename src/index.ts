import express from "express"
import { open } from "sqlite"
import sqlite3 from "sqlite3"

const start = async (port: number) => {
    const db = await open({
        filename: "wesdb.db",
        driver: sqlite3.Database,
    })

    const app = express()
    app.use(express.json()) // parse bodys to js objects
    app.post("/execute", (request, response) => {
        if (!("sql" in request.body)) {
            response.status(400)
            response.json({ error: "sql not provided" })
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

        db.all(request.body.sql)
            .then((result) => {
                response.status(200)
                response.json({ result })
            })
            .catch((error) => {
                response.status(500)
                response.json({ error: error.message })
            })
    })
    app.listen(port)
}

const port = parseInt(process.env.PORT) || 3000
start(port)
    .then(() => console.log(`started, listening on http://localhost:${port}`))
    .catch((err) => console.error("failed to boot", err))
