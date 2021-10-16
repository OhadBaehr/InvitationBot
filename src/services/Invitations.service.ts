import { Invitation } from '../models/Invitation.model'
import { Logger } from '../utils/Logger'
import SQLiteConnector from '../utils/SQLiteConnector'
import { isUndefined } from 'lodash'

export default class InvitationsService {
    private _connector: SQLiteConnector
    private _logger: Logger
    public promise: Promise<void> | null = null

    constructor() {
        this._logger = new Logger('InvitationsService')
        this._connector = SQLiteConnector.instance
        this.promise = this._generateTables()
    }

    private async _generateTables() {
        const statements: string[] = []
        statements.push(
            'CREATE TABLE IF NOT EXISTS `Invitations` (\
            `code` TEXT UNIQUE PRIMARY KEY,\
            `inviter` TEXT NOT NULL,\
            `uses` INTEGER DEFAULT 0,\
            `count` INTEGER DEFAULT 0)'
        )
        try {
            await this._connector.execute(statements, undefined, () => this._logger.log('Tables are ready'))
        } catch (e: any) {
            this._logger.error(e.message, e.error)
        }
    }

    public async awaitCreation() {
        if (this.promise) {
            await this.promise
            this.promise = null
        }
    }

    public async add(invitation: Invitation) {
        const query = `INSERT INTO Invitations (code, inviter, count) VALUES (?, ?, ?);`
        try {
            await this._connector.query(query, [invitation.code, invitation.inviter, invitation.count])
            this._logger.log('Successfully inserted new Invitation')
        } catch (e: any) {
            this._logger.error(e.message, e.error)
            throw e
        }
    }

    public async remove(code: string) {
        const query = `DELETE FROM Invitations WHERE code = ?;`
        try {
            await this._connector.query(query, [code])
            this._logger.log('Successfully removed Invitation ', code)
        } catch (e: any) {
            this._logger.error(e.message, e.error)
            throw e
        }
    }

    public async update(code: string, update: { count?: number; uses?: number }) {
        let query = `UPDATE Invitations SET `
        const params = []

        if (!isUndefined(update.count)) {
            query += ' count = ? '
            params.push(update.count)
        }

        if (!isUndefined(update.uses)) {
            if (update.count) {
                query += ', '
            }
            query += ' uses = ? '
            params.push(update.uses)
        }

        query += `WHERE code = ?;`
        params.push(code)

        try {
            await this._connector.query(query, params)
            this._logger.log('Successfully updated Invitation ', code)
        } catch (e: any) {
            this._logger.error(e.message, e.error)
            throw e
        }
    }

    public async get(code: string) {
        const query = `SELECT * FROM Invitations WHERE code = ?;`
        try {
            const res = (await this._connector.get(query, [code])) as Invitation[]
            return res[0] ?? null
        } catch (e: any) {
            this._logger.error(e.message, e.error)
            throw e
        }
    }

    public async leaderboard() {
        const query = `SELECT inviter, SUM(count) as entries FROM Invitations GROUP BY inviter ORDER BY SUM(count) DESC LIMIT 10;`
        try {
            const res = (await this._connector.get(query)) as Array<{ inviter: string; entries: number }>
            return res ?? []
        } catch (e: any) {
            this._logger.error(e.message, e.error)
            throw e
        }
    }

    // get all entries
    // unique their inviter
    // count all count field that have same inviter and return that

    // public async query(query: RatingQuery) {
    //     let statement = `SELECT * FROM Rating`
    //     let parameters = ``
    //     const params = []

    //     if (query.category) {
    //         parameters += `category = ?`
    //         params.push(query.category)
    //     }
    //     if (query.item) {
    //         parameters += `item = ?`
    //         params.push(query.item)
    //     }
    //     if (query.rating) {
    //         parameters += `rating >= ?`
    //         params.push(query.rating)
    //     }
    //     if (query.date) {
    //         parameters += `date >= ?`
    //         params.push(query.date)
    //     }

    //     if (parameters.length) {
    //         statement += 'WHERE ' + parameters
    //     }
    //     statement += `;`
    //     try {
    //         const res = (await this._connector.get(statement, params)) as DbRating[]
    //         return res ?? []
    //     } catch (e: any) {
    //         this._logger.error(e.message, e.error)
    //         throw e
    //     }
    // }
}
