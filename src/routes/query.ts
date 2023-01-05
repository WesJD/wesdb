import { Request, Response } from "express"
import { Environment } from ".."

type QueryBody = {
    // the sql to execute
    sql: string
}

const handleQueryRequest = (request: Request<{}, {}, QueryBody>, response: Response, { db }: Environment) => {
    if (!("sql" in request.body)) {
        response.status(400)
        response.json({ error: "sql not provided" })
        return
    }

    const sql = request.body.sql
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
}

export default handleQueryRequest
