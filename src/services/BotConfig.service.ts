import { LogLevels, BotConfig as BotConfigModel } from '../models/BotConfig.model'
import { Dictionary } from '../models/Dictionary.model'
import { Logger } from '../utils/Logger'
import { FileLoader } from './FileLoader.service'

export class BotConfig implements BotConfigModel {
    private static _instance: BotConfig | null = null
    public static get instance() {
        if (!this._instance) {
            this._instance = new BotConfig()
        }

        return this._instance
    }

    private _logger: Logger
    private _logLevel: LogLevels
    private _prefix: string
    private _specialRoles: string[]

    constructor() {
        this._logger = new Logger('BotConfigService')
        this._logLevel = (process.env.LOG_LEVEL ?? LogLevels.DEBUG) as LogLevels
        this._prefix = process.env.PREFIX ?? '!'

        const filePath = `../../${process.env.NODE_ENV ?? 'development'}.config.json`
        const data = FileLoader.loadFromFile(filePath)

        if (data) {
            const config = JSON.parse(data) as Dictionary
            this._specialRoles = config.specialRoles ?? ['Approved']
        } else {
            this._specialRoles = ['Approved']
        }
    }

    public get logLevel() {
        return this._logLevel
    }
    public get prefix() {
        return this._prefix
    }
    public get specialRoles() {
        return this._specialRoles
    }
}
